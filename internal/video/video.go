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
				StreamURL: "/api/stream/" + v.ID + "/index.m3u8", // путь к HLS
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

func PublishHandler(storage *sqlite.Storage) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := r.FormValue("id")
		title := r.FormValue("title")
		thumbTime := r.FormValue("thumb_time")

		if id == "" || title == "" || thumbTime == "" {
			http.Error(w, "missing params", http.StatusBadRequest)
			return
		}

		dir := filepath.Join("videos", id)
		input := filepath.Join(dir, "input.mp4")

		// Обновляем запись в БД через метод Storage
		if err := storage.SetVideoProcessing(id, title); err != nil {
			http.Error(w, "cannot update video", http.StatusInternalServerError)
			return
		}

		// Запускаем транскодинг асинхронно
		go func() {
			err := Transcode(storage, id, input, dir, thumbTime)
			if err != nil {
				fmt.Println("TRANSCODE FAILED:", err)
			}
		}()

		w.Write([]byte("ok"))
	}
}

func Transcode(storage *sqlite.Storage, id, input, dir, thumbTime string) error {
	// 1) транскодинг в HLS
	cmd := exec.Command("ffmpeg",
		"-i", input,
		"-c:v", "libx264",
		"-c:a", "aac",
		"-b:a", "128k",
		"-preset", "veryfast",
		"-hls_time", "4",
		"-hls_playlist_type", "vod",
		"-hls_segment_filename", filepath.Join(dir, "seg%03d.ts"),
		filepath.Join(dir, "index.m3u8"),
	)

	stdout, _ := cmd.StdoutPipe()
	stderr, _ := cmd.StderrPipe()
	if err := cmd.Start(); err != nil {
		storage.SetVideoError(id)
		return err
	}

	// Можно читать stdout/stderr асинхронно (прогресс)
	go func() { io.Copy(io.Discard, stdout) }()
	go func() { io.Copy(io.Discard, stderr) }()

	if err := cmd.Wait(); err != nil {
		storage.SetVideoError(id)
		return err
	}

	// 2) thumbnail
	thumbPath := filepath.Join(dir, "thumb.jpg")
	thumbCmd := exec.Command("ffmpeg",
		"-ss", thumbTime,
		"-i", input,
		"-frames:v", "1",
		"-q:v", "2",
		thumbPath,
	)
	if out, err := thumbCmd.CombinedOutput(); err != nil {
		fmt.Println("THUMB ERROR:", string(out))
		storage.SetVideoError(id)
		return err
	}

	// 3) audio extraction
	audioPath := filepath.Join(dir, "audio.mp3")
	audioCmd := exec.Command("ffmpeg",
		"-i", input,
		"-q:a", "0",
		"-map", "a",
		audioPath,
	)
	if out, err := audioCmd.CombinedOutput(); err != nil {
		fmt.Println("AUDIO ERROR:", string(out))
		// не критично, продолжаем
	}

	// 4) удаляем исходник
	os.Remove(input)

	// 5) сохраняем thumbnail и ставим ready
	storage.SetVideoReadyWithThumbnail(id, "/api/stream/"+id+"/thumb.jpg")

	return nil
}

func GetVideoHandler(storage *sqlite.Storage) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := strings.TrimPrefix(r.URL.Path, "/api/video/")

		v, err := storage.GetVideo(id)
		if err != nil {
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}
		if v == nil {
			http.NotFound(w, r)
			return
		}

		// Формируем ответ для фронтенда
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
		http.Error(w, "forbidden", 403)
		return
	}

	http.ServeFile(w, r, filepath.Join("videos", clean))
}
