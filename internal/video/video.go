package video

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"umbrella/internal/config"
	"umbrella/internal/storage/sqlite"

	"github.com/google/uuid"
)

var MODE = config.CFG.FFmpegProfile
var STATICPATH = config.CFG.StaticPath
var VIDEOPATH = config.CFG.VideosPath

func init() {
	mime.AddExtensionType(".m3u8", "application/vnd.apple.mpegurl")
	mime.AddExtensionType(".ts", "video/mp2t")
}

type VideoResponse struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Status      string `json:"status"`
	StreamURL   string `json:"stream_url"`
	Thumbnail   string `json:"thumbnail"`
	Description string `json:"description"`
	Progress    int    `json:"progress"`
}
type ffprobeOutput struct {
	Format struct {
		Tags map[string]string `json:"tags"`
	} `json:"format"`
}

var ffmpegVideoArgs = map[string][]string{
	// === CPU ===
	"cpu": {
		"-c:v", "libx264",
		"-preset", "veryfast",
	},

	// === Intel iGPU (QSV) ===
	// HW-декодер убран, остаются только кодек и output options
	"intel": {
		"-c:v", "h264_qsv",
	},

	// === NVIDIA GPU (NVENC) ===
	"nvidia": {
		"-c:v", "h264_nvenc",
		"-preset", "p4",
		"-tune", "hq",
	},

	// === NVIDIA H.265 / HEVC кодирование через NVENC ===
	"h265_nvenc": {
		"-c:v", "hevc_nvenc",
		"-preset", "p4",
		"-tune", "hq",
	},

	// === AMD GPU (Linux VAAPI) ===
	"amd_vaapi": {
		"-c:v", "h264_vaapi",
	},

	// === AMD GPU (Windows AMF) ===
	"amd_amf": {
		"-c:v", "h264_amf",
	},
}

func ListVideos(storage *sqlite.Storage) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		offset := 0
		limit := 10

		if o := r.URL.Query().Get("offset"); o != "" {
			if v, err := strconv.Atoi(o); err == nil {
				offset = v
			}
		}
		if l := r.URL.Query().Get("limit"); l != "" {
			if v, err := strconv.Atoi(l); err == nil {
				limit = v
			}
		}

		if limit > 50 {
			limit = 50
		}

		videos, err := storage.ListVideos(limit, offset)
		if err != nil {
			http.Error(w, fmt.Sprintf("failed to load videos: %v", err), http.StatusInternalServerError)
			return
		}

		// Преобразуем в VideoResponse
		var resp []VideoResponse
		for _, v := range videos {
			resp = append(resp, VideoResponse{
				ID:        v.ID,
				Title:     v.Title,
				Status:    v.Status,
				Progress:  v.Progress,
				Thumbnail: v.Thumbnail,
				StreamURL: "/api/stream/" + v.ID,
			})
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}
}

func RandomVideoHandler(storage *sqlite.Storage) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := storage.GetRandomVideoID()
		if err != nil {
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}
		if id == "" {
			http.Error(w, "no videos available", http.StatusNotFound)
			return
		}

		w.Write([]byte(id))
	}
}

func UploadHandler(storage *sqlite.Storage) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		file, header, err := r.FormFile("video")
		if err != nil {
			http.Error(w, "file not found", http.StatusBadRequest)
			return
		}
		defer file.Close()

		// Генерация ID и создание папки для видео
		id := uuid.New().String()
		dir := filepath.Join(VIDEOPATH, id)
		if err := os.MkdirAll(dir, 0755); err != nil {
			http.Error(w, "cannot create video directory", http.StatusInternalServerError)
			return
		}

		input := filepath.Join(dir, "input.mp4")
		out, err := os.Create(input)
		if err != nil {
			http.Error(w, "cannot create file", http.StatusInternalServerError)
			return
		}
		defer out.Close()

		if _, err := io.Copy(out, file); err != nil {
			http.Error(w, "cannot save file", http.StatusInternalServerError)
			return
		}

		// Создаём запись в БД через метод Storage
		if err := storage.CreateVideo(id, header.Filename, "uploaded", 0); err != nil {
			http.Error(w, "cannot save video in DB", http.StatusInternalServerError)
			return
		}

		desc, err := GetVideoDescription(input)
		if err != nil {
			log.Printf("metadata read error for %s: %v", id, err)
		} else if desc != "" {
			if err := storage.SetVideoDescription(id, desc); err != nil {
				log.Printf("cannot save description for %s: %v", id, err)
			}
		}

		w.Write([]byte(id))
	}
}

func GetVideoDescription(path string) (string, error) {
	cmd := exec.Command(
		"ffprobe",
		"-v", "quiet",
		"-print_format", "json",
		"-show_format",
		path,
	)

	out, err := cmd.Output()
	if err != nil {
		return "", err
	}

	var data ffprobeOutput
	if err := json.Unmarshal(out, &data); err != nil {
		return "", err
	}

	tags := data.Format.Tags

	// популярные варианты хранения описания
	if v, ok := tags["description"]; ok {
		return v, nil
	}
	if v, ok := tags["comment"]; ok {
		return v, nil
	}
	if v, ok := tags["synopsis"]; ok {
		return v, nil
	}

	return "", nil
}

// Вспомогательная функция для JSON ошибок
func writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{
		"error": msg,
	})
}

func PublishHandler(storage *sqlite.Storage) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := r.FormValue("id")
		title := r.FormValue("title")
		thumbTime := r.FormValue("thumb_time")

		if id == "" || title == "" || thumbTime == "" {
			writeJSONError(w, http.StatusBadRequest, "missing parameters")
			return
		}

		dir := filepath.Join(VIDEOPATH, id)
		input := filepath.Join(dir, "input.mp4")

		// Проверяем, что файл существует
		if _, err := os.Stat(input); err != nil {
			writeJSONError(w, http.StatusBadRequest, "input video not found")
			return
		}

		// Обновляем title и ставим статус processing
		if err := storage.SetVideoProcessing(id, title); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "cannot update video: "+err.Error())
			fmt.Println("PUBLISH:", id, title, thumbTime)
			return
		}

		// Запускаем транскодинг асинхронно
		go func() {
			if err := Transcode(storage, id, input, dir, thumbTime); err != nil {
				fmt.Println("TRANSCODE FAILED:", err)
			}
		}()

		w.Write([]byte("ok"))
	}
}

func Transcode(storage *sqlite.Storage, id, input, dir, thumbTime string) error {
	duration, err := getVideoDuration(input)
	if err == nil {
		t, err2 := strconv.ParseFloat(thumbTime, 64)
		if err2 == nil {
			if t > duration-1 {
				t = duration - 1
			}
			if t < 0 {
				t = 0
			}
			thumbTime = fmt.Sprintf("%.2f", t)
		}
	}

	ext := strings.ToLower(filepath.Ext(input))
	isAudio := ext == ".mp3" || ext == ".wav" || ext == ".flac"

	buildArgs := func(mode string) []string {
		args := []string{"-y"}
		switch mode {
		case "intel":
			args = append(args, "-hwaccel", "qsv")
		case "amd_vaapi":
			args = append(args, "-hwaccel", "vaapi", "-hwaccel_device", "/dev/dri/renderD128")
		}
		args = append(args, "-i", input)
		if opts, ok := ffmpegVideoArgs[mode]; ok {
			args = append(args, opts...)
		} else {
			args = append(args, ffmpegVideoArgs["cpu"]...)
		}
		args = append(args,
			"-c:a", "aac",
			"-hls_time", "4",
			"-hls_playlist_type", "vod",
			"-hls_segment_filename", filepath.Join(dir, "seg%03d.ts"),
			filepath.Join(dir, "index.m3u8"),
		)
		return args
	}

	runFFmpeg := func(args []string) ([]byte, error) {
		cmd := exec.Command("ffmpeg", args...)
		return cmd.CombinedOutput()
	}

	out, err := runFFmpeg(buildArgs(MODE))
	if err != nil {
		logLower := strings.ToLower(string(out))
		if strings.Contains(logLower, "nvenc") || strings.Contains(logLower, "no capable devices") || strings.Contains(logLower, "driver") {
			out, err = runFFmpeg(buildArgs("cpu"))
		}
	}
	if err != nil {
		storage.SetVideoError(id)
		return fmt.Errorf("ffmpeg HLS failed: %w\n%s", err, string(out))
	}

	// --- Thumbnail ---
	thumbPath := filepath.Join(dir, "thumb.jpg")
	if isAudio {
		cover := filepath.Join(dir, "thumb.jpg")
		if !fileExists(cover) {
			cover = "static/def.jpg"
		}
		thumbCmd := exec.Command("ffmpeg", "-y", "-i", cover, "-frames:v", "1", "-q:v", "2", thumbPath)
		if out, err := thumbCmd.CombinedOutput(); err != nil {
			storage.SetVideoError(id)
			return fmt.Errorf("thumbnail (audio) failed: %w\n%s", err, string(out))
		}
	} else {
		thumbCmd := exec.Command("ffmpeg", "-y", "-ss", thumbTime, "-i", input, "-frames:v", "1", "-q:v", "2", thumbPath)
		if out, err := thumbCmd.CombinedOutput(); err != nil {
			storage.SetVideoError(id)
			return fmt.Errorf("thumbnail failed: %w\n%s", err, string(out))
		}
	}

	// --- удаляем исходник ---
	_ = os.Remove(input)

	if err := storage.SetVideoReadyWithThumbnail(id, "/api/stream/"+id+"/thumb.jpg"); err != nil {
		return err
	}

	return nil
}

func GetVideoHandler(storage *sqlite.Storage) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := strings.TrimPrefix(r.URL.Path, "/api/video/")

		v, err := storage.GetVideo(id)
		if err != nil {
			// ⬇ ВАЖНО: во время processing это не ошибка сервера
			writeJSONError(w, http.StatusOK, "processing")
			return
		}

		if v == nil {
			writeJSONError(w, http.StatusNotFound, "video not found")
			return
		}

		// Обрабатываем null/пустое описание
		desc := v.Description
		if desc == "" {
			desc = "" // можно поставить "Нет описания", если хотите
		}

		resp := VideoResponse{
			ID:          v.ID,
			Title:       v.Title,
			Status:      v.Status,
			Thumbnail:   v.Thumbnail,
			Description: desc,
			Progress:    v.Progress,
			StreamURL:   "/api/stream/" + v.ID,
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}
}

func DeleteVideoHandler(storage *sqlite.Storage) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {

		if r.Method != http.MethodGet {
			w.Header().Set("Allow", http.MethodGet)
			writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}

		id := strings.TrimPrefix(r.URL.Path, "/api/delete/")
		if id == "" {
			writeJSONError(w, http.StatusBadRequest, "missing video id")
			return
		}

		// удаляем запись из БД
		err := storage.DeleteVideo(id)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "failed to delete video")
			log.Println(err)
			return
		}

		// путь к папке видео
		videoDir := filepath.Join(VIDEOPATH, id)

		// удаляем папку с файлами
		err = os.RemoveAll(videoDir)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "failed to delete video files")
			log.Println(err)
			return
		}
		log.Println("video with id: ", id, " deleted, path: ", videoDir)

		w.WriteHeader(http.StatusNoContent)
	}
}

func getVideoDuration(input string) (float64, error) {
	cmd := exec.Command(
		"ffprobe",
		"-v", "error",
		"-show_entries", "format=duration",
		"-of", "default=noprint_wrappers=1:nokey=1",
		input,
	)

	out, err := cmd.Output()
	if err != nil {
		return 0, err
	}

	return strconv.ParseFloat(strings.TrimSpace(string(out)), 64)
}

func Stream(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/stream/")
	clean := filepath.Clean(path)

	if strings.Contains(clean, "..") {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	full := filepath.Join(VIDEOPATH, clean)

	if _, err := os.Stat(full); err != nil {
		http.NotFound(w, r)
		return
	}

	http.ServeFile(w, r, full)
}

func UploadStartHandler(storage *sqlite.Storage) http.HandlerFunc {

	return func(w http.ResponseWriter, r *http.Request) {

		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		id := uuid.New().String()

		dir := filepath.Join(VIDEOPATH, id, "chunks")

		if err := os.MkdirAll(dir, 0755); err != nil {
			http.Error(w, "cannot create upload dir", http.StatusInternalServerError)
			return
		}

		err := storage.CreateVideo(id, "", "uploading", 0)
		if err != nil {
			http.Error(w, "cannot create video record", http.StatusInternalServerError)
			return
		}

		resp := map[string]string{
			"id": id,
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}
}

func UploadChunkHandler() http.HandlerFunc {

	return func(w http.ResponseWriter, r *http.Request) {

		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		err := r.ParseMultipartForm(32 << 20)
		if err != nil {
			http.Error(w, "multipart parse error", 400)
			return
		}

		id := r.FormValue("id")
		indexStr := r.FormValue("index")

		if id == "" || indexStr == "" {
			http.Error(w, "missing params", 400)
			return
		}

		index, err := strconv.Atoi(indexStr)
		if err != nil || index < 0 {
			http.Error(w, "invalid chunk index", 400)
			return
		}

		file, _, err := r.FormFile("chunk")
		if err != nil {
			http.Error(w, "chunk missing", 400)
			return
		}
		defer file.Close()

		dir := filepath.Join(VIDEOPATH, id, "chunks")

		if err := os.MkdirAll(dir, 0755); err != nil {
			http.Error(w, "cannot create dir", 500)
			return
		}

		partPath := filepath.Join(dir, fmt.Sprintf("%d.part", index))

		// если chunk уже существует — пропускаем
		if _, err := os.Stat(partPath); err == nil {
			w.Write([]byte("ok"))
			return
		}

		out, err := os.Create(partPath)
		if err != nil {
			http.Error(w, "cannot create chunk", 500)
			return
		}
		defer out.Close()

		_, err = io.Copy(out, file)
		if err != nil {
			http.Error(w, "cannot save chunk", 500)
			return
		}

		w.Write([]byte("ok"))
	}
}

func UploadFinishHandler(storage *sqlite.Storage) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req struct {
			ID          string `json:"id"`
			Filename    string `json:"filename"`
			TotalChunks int    `json:"total_chunks"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "bad request", 400)
			return
		}

		if req.TotalChunks <= 0 {
			http.Error(w, "invalid chunk count", 400)
			return
		}

		dir := filepath.Join(VIDEOPATH, req.ID)
		chunks := filepath.Join(dir, "chunks")
		input := filepath.Join(dir, "input.mp4")
		tmp := filepath.Join(dir, "input.tmp")

		// --- собираем чанки ---
		out, err := os.Create(tmp)
		if err != nil {
			http.Error(w, "cannot create tmp file", 500)
			return
		}
		buf := make([]byte, 1024*1024)
		for i := 0; i < req.TotalChunks; i++ {
			part := filepath.Join(chunks, fmt.Sprintf("%d.part", i))
			if _, err := os.Stat(part); err != nil {
				out.Close()
				os.Remove(tmp)
				http.Error(w, "missing chunk "+strconv.Itoa(i), 400)
				return
			}
			in, _ := os.Open(part)
			io.CopyBuffer(out, in, buf)
			in.Close()
		}
		out.Close()

		// --- перемещаем в input ---
		if err := os.Rename(tmp, input); err != nil {
			os.Remove(tmp)
			http.Error(w, "finalize failed", 500)
			return
		}
		os.RemoveAll(chunks)

		// --- сохраняем запись в БД ---
		if err := storage.SetVideoUploaded(req.ID, req.Filename); err != nil {
			http.Error(w, "db error", 500)
			return
		}

		// --- проверяем, аудио или видео ---
		ext := strings.ToLower(filepath.Ext(req.Filename))
		isAudio := ext == ".mp3" || ext == ".wav" || ext == ".flac"

		if isAudio {
			tmpVideo := filepath.Join(dir, "tmp_input.mp4")

			// --- пытаемся извлечь обложку из аудио ---
			cover := filepath.Join(dir, "cover.jpg")
			extractCmd := exec.Command("ffmpeg", "-y", "-i", input, "-an", "-vcodec", "copy", cover)
			if _, err := extractCmd.CombinedOutput(); err != nil || !fileExists(cover) {
				// если извлечение не удалось, используем дефолт
				cover = getDefaultCover()
				if !fileExists(cover) {
					log.Println("default cover missing:", cover)
					storage.SetVideoError(req.ID)
					http.Error(w, "default cover missing", 500)
					return
				}
			}

			// --- длительность аудио ---
			duration, err := getAudioDuration(input)
			if err != nil {
				duration = 5
			}

			log.Println("Using cover:", cover)

			// --- создаём видео с одним кадром ---
			cmd := exec.Command("ffmpeg",
				"-y",
				"-loop", "1",
				"-i", cover,
				"-i", input,
				"-c:v", "libx264",
				"-t", fmt.Sprintf("%.2f", duration),
				"-pix_fmt", "yuv420p",
				"-c:a", "aac",
				tmpVideo,
			)
			out, err := cmd.CombinedOutput()
			if err != nil {
				log.Println("audio→video failed:", string(out), err)
				storage.SetVideoError(req.ID)
				http.Error(w, "audio→video failed", 500)
				return
			}

			// --- заменяем оригинальный input.mp4 ---
			os.Remove(input)
			if err := os.Rename(tmpVideo, input); err != nil {
				log.Println("rename tmp_input.mp4 failed:", err)
				storage.SetVideoError(req.ID)
				http.Error(w, "rename failed", 500)
				return
			}

			// --- создаём thumbnail для аудио ---
			thumbPath := filepath.Join(dir, "thumb.jpg")
			thumbCmd := exec.Command("ffmpeg", "-y", "-i", cover, "-frames:v", "1", "-q:v", "2", thumbPath)
			if out, err := thumbCmd.CombinedOutput(); err != nil {
				log.Println("thumbnail failed:", string(out), err)
				storage.SetVideoError(req.ID)
				http.Error(w, "thumbnail failed", 500)
				return
			}

			// --- удаляем временную cover.jpg если была создана ---
			if cover != getDefaultCover() {
				os.Remove(cover)
			}
		} else {
			// --- thumbnail для видео ---
			thumbPath := filepath.Join(dir, "thumb.jpg")
			thumbCmd := exec.Command("ffmpeg", "-y", "-ss", "0", "-i", input, "-frames:v", "1", "-q:v", "2", thumbPath)
			if out, err := thumbCmd.CombinedOutput(); err != nil {
				log.Println("thumbnail failed:", string(out), err)
				storage.SetVideoError(req.ID)
				http.Error(w, "thumbnail failed", 500)
				return
			}
		}

		// --- обновляем описание асинхронно ---
		go func() {
			desc, err := GetVideoDescription(input)
			if err == nil && desc != "" {
				storage.SetVideoDescription(req.ID, desc)
			}
		}()

		w.Write([]byte("ok"))
	}
}

// --- вспомогательные функции ---
func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func getAudioDuration(path string) (float64, error) {
	cmd := exec.Command(
		"ffprobe",
		"-v", "error",
		"-show_entries", "format=duration",
		"-of", "default=noprint_wrappers=1:nokey=1",
		path,
	)
	out, err := cmd.Output()
	if err != nil {
		return 0, err
	}
	return strconv.ParseFloat(strings.TrimSpace(string(out)), 64)
}

func getDefaultCover() string {
	return filepath.Join(STATICPATH, "def.jpg")
}
