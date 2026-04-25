package upload

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

// ===== КАЧЕСТВА =====

var VIDEOPATH = config.CFG.VideosPath
var STATICPATH = config.CFG.StaticPath
var MODE = config.CFG.FFmpegProfile

func init() {
	mime.AddExtensionType(".m3u8", "application/vnd.apple.mpegurl")
	mime.AddExtensionType(".ts", "video/mp2t")
}

type Quality struct {
	ID     string // "1080"
	Label  string // "1080p"
	Height int    // 1080
}

var AllQualities = []Quality{
	{"4320", "4320p", 4320},
	{"2160", "2160p", 2160},
	{"1440", "1440p", 1440},
	{"1080", "1080p", 1080},
	{"720", "720p", 720},
	{"480", "480p", 480},
	{"360", "360p", 360},
	{"240", "240p", 240},
	{"144", "144p", 144},
}

func writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{
		"error": msg,
	})
}

// ===== API ОТВЕТ =====

type StageDTO struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}
type VideoAPIResponse struct {
	Stages       []StageDTO `json:"stages"`
	CurrentStage string     `json:"current_stage"`
	Status       string     `json:"status"`
	Progress     int        `json:"progress"`
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
		"-preset", "slow",
		"-crf", "18",
		"-maxrate", "20M",
		"-bufsize", "40M",
	},

	// === Intel iGPU (QSV) ===
	// HW-декодер убран, остаются только кодек и output options
	"intel": {
		"-c:v", "h264_qsv",
	},

	// === NVIDIA GPU (NVENC) ===
	"nvidia": {
		"-c:v", "h264_nvenc",
		"-preset", "p5",
		"-rc", "vbr",
		"-cq", "19",
		"-b:v", "0",
		"-maxrate", "25M",
		"-bufsize", "50M",
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

func selectQualitiesByHeight(h int) []Quality {
	if h <= 0 {
		return nil
	}

	result := make([]Quality, 0, len(AllQualities))

	// берём только те качества, которые <= исходного видео
	for _, q := range AllQualities {
		if q.Height <= h {
			result = append(result, q)
		}
	}

	// если вдруг ничего не подошло (очень маленькое видео, например 100p)
	if len(result) == 0 {
		return []Quality{
			{
				ID:     strconv.Itoa(h),
				Label:  fmt.Sprintf("%dp", h),
				Height: h,
			},
		}
	}

	return result
}

func getVideoResolution(input string) (width int, height int, err error) {
	cmd := exec.Command(
		"ffprobe",
		"-v", "error",
		"-select_streams", "v:0",
		"-show_entries", "stream=width,height",
		"-of", "csv=p=0:s=x",
		input,
	)

	out, err := cmd.Output()
	if err != nil {
		return 0, 0, err
	}

	parts := strings.Split(strings.TrimSpace(string(out)), "x")
	if len(parts) != 2 {
		return 0, 0, fmt.Errorf("invalid resolution output: %s", string(out))
	}

	w, err := strconv.Atoi(parts[0])
	if err != nil {
		return 0, 0, err
	}

	h, err := strconv.Atoi(parts[1])
	if err != nil {
		return 0, 0, err
	}

	log.Println("VIDEO RESOLUTION:", w, "x", h)

	return w, h, nil
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

func PublishHandler(storage *sqlite.Storage) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}

		id := r.FormValue("id")
		title := r.FormValue("title")
		thumbTime := r.FormValue("thumb_time")

		if id == "" || title == "" || thumbTime == "" {
			writeJSONError(w, http.StatusBadRequest, "missing parameters")
			return
		}

		dir := filepath.Join(VIDEOPATH, id)
		input := filepath.Join(dir, "input.mp4")

		if _, err := os.Stat(input); err != nil {
			writeJSONError(w, http.StatusBadRequest, "input video not found")
			return
		}

		// обновляем статус
		if err := storage.SetVideoProcessing(id, title); err != nil {
			writeJSONError(w, http.StatusInternalServerError, err.Error())
			return
		}

		// запускаем pipeline
		go func() {
			err := Transcode(storage, id, input, dir, thumbTime)
			if err != nil {
				log.Println("TRANSCODE ERROR:", err)
				storage.SetVideoError(id)
			}
		}()

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

		width, height, err := getVideoResolution(input)
		if err != nil {
			log.Println("ffprobe resolution error:", err)
			height = 1080
			width = 1920
		}

		if err := storage.SetVideoMeta(req.ID, width, height); err != nil {
			log.Println("SetVideoMeta error:", err)
		}

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
				"-c:a", "copy",
				"-map_metadata", "1",
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
			// --- извлекаем description из исходного аудио ---
			desc, err := GetVideoDescription(input)
			if err != nil {
				log.Println("metadata read error for audio:", err)
			} else if desc != "" {
				if err := storage.SetVideoDescription(req.ID, desc); err != nil {
					log.Println("cannot save description for audio:", err)
				}
			}
		}()

		w.Write([]byte("ok"))
	}
}

func VideoStatusHandler(storage *sqlite.Storage) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {

		id := strings.TrimPrefix(r.URL.Path, "/api/video-status/")
		id = strings.TrimSpace(id)

		if id == "" {
			writeJSONError(w, http.StatusBadRequest, "missing id")
			return
		}

		v, err := storage.GetVideo(id)
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		if v == nil {
			writeJSONError(w, http.StatusNotFound, "not found")
			return
		}

		// =========================
		// ВАЖНО: БЕЗ ffprobe в status
		// =========================
		// fallback значение (если файл ещё не готов или метаданные не известны)
		// если видео уже готово — можно попытаться аккуратно определить размер,
		// но ТОЛЬКО если input существует
		// --- фикс: учитываем текущую стадию ---
		maxHeight := v.Height

		// если уже есть текущая стадия (например "1440")
		if v.Stage != "" {
			if h, err := strconv.Atoi(v.Stage); err == nil {
				if h > maxHeight {
					maxHeight = h
				}
			}
		}
		if maxHeight == 0 {
			maxHeight = 1080
		}
		// генерируем стадии
		qualities := selectQualitiesByHeight(maxHeight)

		stages := make([]StageDTO, 0, len(qualities))
		for _, q := range qualities {
			stages = append(stages, StageDTO{
				ID:    q.ID,
				Label: q.Label,
			})
		}

		current := v.Stage
		if current == "" && len(qualities) > 0 {
			current = qualities[0].ID
		}

		resp := VideoAPIResponse{
			Stages:       stages,
			CurrentStage: current,
			Status:       v.Status,
			Progress:     v.Progress,
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}
}

func Transcode(storage *sqlite.Storage, id, input, dir, thumbTime string) error {
	// --- validate input ---
	if !fileExists(input) {
		storage.SetVideoError(id)
		return fmt.Errorf("input file not found")
	}

	// --- normalize thumb time ---
	duration, err := getVideoDuration(input)
	if err == nil {
		if t, err := strconv.ParseFloat(thumbTime, 64); err == nil {
			if t < 0 {
				t = 0
			}
			if t > duration-1 {
				t = duration - 1
			}
			thumbTime = fmt.Sprintf("%.2f", t)
		}
	}

	// --- detect video params ---
	width, height, err := getVideoResolution(input)
	if err != nil {
		storage.SetVideoError(id)
		return fmt.Errorf("ffprobe failed: %w", err)
	}

	log.Println("VIDEO:", width, "x", height)

	// выбираем профиль кодирования
	profile, ok := ffmpegVideoArgs[MODE]
	if !ok {
		log.Println("Unknown MODE, fallback to cpu:", MODE)
		profile = ffmpegVideoArgs["cpu"]
	}

	log.Println("PROFILE:", profile)

	// выбираем качества
	qualities := selectQualitiesByHeight(height)

	// обработка всех качеств
	for i, q := range qualities {

		progress := 10 + int(float64(i+1)/float64(len(qualities))*80)
		storage.SetVideoStage(id, q.ID, progress)

		outDir := filepath.Join(dir, q.ID)
		if err := os.MkdirAll(outDir, 0755); err != nil {
			return err
		}

		args := []string{
			"-y",
			"-i", input,
			"-vf", fmt.Sprintf("scale=-2:%d", q.Height),
		}

		args = append(args, profile...)

		args = append(args,
			"-c:a", "copy",
			"-pix_fmt", "yuv420p",
			"-hls_time", "4",
			"-hls_playlist_type", "vod",
			"-hls_segment_filename", filepath.Join(outDir, "seg%03d.ts"),
			filepath.Join(outDir, "index.m3u8"),
		)

		if err := runFFmpeg(args); err != nil {
			log.Println("GPU failed → fallback CPU:", q.ID)

			fallback := []string{
				"-y",
				"-i", input,
				"-vf", fmt.Sprintf("scale=-2:%d", q.Height),
			}

			fallback = append(fallback, ffmpegVideoArgs["cpu"]...)
			fallback = append(fallback,
				"-c:a", "copy",
				"-pix_fmt", "yuv420p",
				"-hls_time", "4",
				"-hls_playlist_type", "vod",
				"-hls_segment_filename", filepath.Join(outDir, "seg%03d.ts"),
				filepath.Join(outDir, "index.m3u8"),
			)

			if err := runFFmpeg(fallback); err != nil {
				storage.SetVideoError(id)
				return fmt.Errorf("failed quality %s", q.ID)
			}
		}
	}

	// =======================
	// 🎯 master playlist
	// =======================
	masterPath := filepath.Join(dir, "master.m3u8")

	f, err := os.Create(masterPath)
	if err != nil {
		return err
	}
	defer f.Close()

	f.WriteString("#EXTM3U\n")

	for _, q := range qualities {
		f.WriteString(fmt.Sprintf(
			"#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=0x%d\n%s/index.m3u8\n",
			q.Height,
			q.ID,
		))
	}

	// =======================
	// 🖼 thumbnail
	// =======================
	thumbPath := filepath.Join(dir, "thumb.jpg")

	cmd := exec.Command(
		"ffmpeg",
		"-y",
		"-ss", thumbTime,
		"-i", input,
		"-frames:v", "1",
		"-q:v", "2",
		thumbPath,
	)

	if out, err := cmd.CombinedOutput(); err != nil {
		log.Println("thumbnail error:", string(out))
		storage.SetVideoError(id)
		return fmt.Errorf("thumbnail failed")
	}

	// cleanup
	defer os.Remove(input)

	last := qualities[len(qualities)-1].ID
	storage.SetVideoStage(id, last, 100)

	if err := storage.SetVideoReadyWithThumbnail(id, "/api/stream/"+id+"/thumb.jpg"); err != nil {
		return err
	}

	return nil
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func getDefaultCover() string {
	return filepath.Join(STATICPATH, "def.jpg")
}

func runFFmpeg(args []string) error {
	cmd := exec.Command("ffmpeg", args...)
	out, err := cmd.CombinedOutput()

	if err != nil {
		log.Println("FFMPEG FAILED")
		log.Println("ARGS:", args)
		log.Println("OUTPUT:", string(out))
		return fmt.Errorf("ffmpeg error: %w", err)
	}

	return nil
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
