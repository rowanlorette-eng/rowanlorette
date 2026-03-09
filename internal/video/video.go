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
		dir := filepath.Join("videos", id)
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

		dir := filepath.Join("videos", id)
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
	// --- защита от выбора последнего кадра ---
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
	// --- вспомогательная функция для сборки аргументов FFmpeg ---
	buildArgs := func(mode string) []string {
		args := []string{"-y"}

		// --- HW-ускорение декодера (только для Intel и AMD VAAPI) ---
		switch mode {
		case "intel":
			args = append(args, "-hwaccel", "qsv")
		case "amd_vaapi":
			args = append(args, "-hwaccel", "vaapi", "-hwaccel_device", "/dev/dri/renderD128")
		}

		// --- входной файл ---
		args = append(args, "-i", input)

		// --- кодек и GPU/CPU опции из ffmpegVideoArgs ---
		if opts, ok := ffmpegVideoArgs[mode]; ok {
			args = append(args, opts...)
		} else {
			args = append(args, ffmpegVideoArgs["cpu"]...)
		}

		// --- аудио и HLS ---
		args = append(args,
			"-c:a", "aac",
			"-hls_time", "4",
			"-hls_playlist_type", "vod",
			"-hls_segment_filename", filepath.Join(dir, "seg%03d.ts"),
			filepath.Join(dir, "index.m3u8"),
		)

		return args
	}

	// --- запуск FFmpeg и возврат вывода ---
	runFFmpeg := func(args []string) ([]byte, error) {
		cmd := exec.Command("ffmpeg", args...)
		return cmd.CombinedOutput()
	}

	// --- 1️⃣ Основной HLS транскодинг ---
	out, err := runFFmpeg(buildArgs(MODE))
	if err != nil {
		logLower := strings.ToLower(string(out))
		// --- fallback на CPU, если GPU недоступен ---
		if strings.Contains(logLower, "nvenc") ||
			strings.Contains(logLower, "no capable devices") ||
			strings.Contains(logLower, "driver") ||
			strings.Contains(logLower, "qsv") {
			fmt.Println("GPU unavailable → fallback to CPU")
			out, err = runFFmpeg(buildArgs("cpu"))
		}
	}
	if err != nil {
		storage.SetVideoError(id)
		return fmt.Errorf("ffmpeg HLS failed: %w\n%s", err, string(out))
	}

	// --- 2️⃣ Thumbnail ---
	thumbPath := filepath.Join(dir, "thumb.jpg")
	thumbCmd := exec.Command("ffmpeg",
		"-y",
		"-ss", thumbTime,
		"-i", input,
		"-frames:v", "1",
		"-q:v", "2",
		thumbPath,
	)
	if out, err := thumbCmd.CombinedOutput(); err != nil {
		storage.SetVideoError(id)
		return fmt.Errorf("thumbnail failed: %w\n%s", err, string(out))
	}

	// --- 3️⃣ Audio extract ---
	audioCmd := exec.Command("ffmpeg",
		"-y",
		"-i", input,
		"-q:a", "0",
		"-map", "a",
		filepath.Join(dir, "audio.mp3"),
	)
	audioCmd.Run() // ошибки не критичны

	// --- 4️⃣ Удаляем исходник ---
	_ = os.Remove(input)

	// --- 5️⃣ Обновляем статус в БД ---
	if err := storage.SetVideoReadyWithThumbnail(
		id,
		"/api/stream/"+id+"/thumb.jpg",
	); err != nil {
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

	full := filepath.Join("videos", clean)

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

		dir := filepath.Join("videos", id, "chunks")

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

		dir := filepath.Join("videos", id, "chunks")

		if err := os.MkdirAll(dir, 0755); err != nil {
			http.Error(w, "cannot create dir", 500)
			return
		}

		partPath := filepath.Join(dir, fmt.Sprintf("%d.part", index))

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

		if _, err := io.Copy(out, file); err != nil {
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

		dir := filepath.Join("videos", req.ID)
		chunks := filepath.Join(dir, "chunks")

		input := filepath.Join(dir, "input.mp4")
		tmp := filepath.Join(dir, "input.tmp")

		out, err := os.Create(tmp)
		if err != nil {
			http.Error(w, "cannot create file tmp", 500)
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

			in, err := os.Open(part)
			if err != nil {
				out.Close()
				os.Remove(tmp)
				http.Error(w, "cannot open chunk", 500)
				return
			}
			
			_, err = io.CopyBuffer(out, in, buf)

			in.Close()

			if err != nil {
				out.Close()
				os.Remove(tmp)
				http.Error(w, "merge failed", 500)
				return
			}
		}

		out.Close()

		if err := os.Rename(tmp, input); err != nil {
			os.Remove(tmp)
			http.Error(w, "finalize failed", 500)
			return
		}

		os.RemoveAll(chunks)

		// создаём запись в БД
		if err := storage.SetVideoUploaded(req.ID, req.Filename); err != nil {
			http.Error(w, "db error", 500)
			return
		}

		go func() {

			desc, err := GetVideoDescription(input)

			if err == nil && desc != "" {
				storage.SetVideoDescription(req.ID, desc)
			}

		}()

		w.Write([]byte("ok"))
	}
}
