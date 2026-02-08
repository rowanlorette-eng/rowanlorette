package video

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"umbrella/internal/storage/sqlite"

	"github.com/google/uuid"
)

type VideoResponse struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Status    string `json:"status"`
	StreamURL string `json:"stream_url"`
	Thumbnail string `json:"thumbnail"`
	Progress  int    `json:"progress"`
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

		w.Write([]byte(id))
	}
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
	// 1) HLS
	cmd := exec.Command("ffmpeg",
		"-y",
		"-i", input,
		"-c:v", "libx264",
		"-c:a", "aac",
		"-preset", "veryfast",
		"-hls_time", "4",
		"-hls_playlist_type", "vod",
		"-hls_segment_filename", filepath.Join(dir, "seg%03d.ts"),
		filepath.Join(dir, "index.m3u8"),
	)

	out, err := cmd.CombinedOutput()
	if err != nil {
		storage.SetVideoError(id)
		return fmt.Errorf("ffmpeg HLS failed: %w\n%s", err, string(out))
	}

	// 2) Thumbnail
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
		return fmt.Errorf("ffmpeg thumb failed: %w\n%s", err, string(out))
	}

	if _, err := os.Stat(thumbPath); err != nil {
		storage.SetVideoError(id)
		return fmt.Errorf("thumbnail not created: %w", err)
	}

	// 3) Audio (не критично)
	audioCmd := exec.Command("ffmpeg",
		"-y",
		"-i", input,
		"-q:a", "0",
		"-map", "a",
		filepath.Join(dir, "audio.mp3"),
	)
	audioCmd.CombinedOutput() // ошибки логируем, но не падаем

	// 4) Удаляем исходник
	_ = os.Remove(input)

	// 5) READY
	if err := storage.SetVideoReadyWithThumbnail(
		id,
		"/api/stream/"+id+"/thumb.jpg",
	); err != nil {
		return fmt.Errorf("SetVideoReadyWithThumbnail failed: %w", err)
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

		resp := VideoResponse{
			ID:        v.ID,
			Title:     v.Title,
			Status:    v.Status,
			Thumbnail: v.Thumbnail,
			Progress:  v.Progress,
			StreamURL: "/api/stream/" + v.ID,
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}
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
