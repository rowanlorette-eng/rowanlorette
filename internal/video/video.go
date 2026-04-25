package video

import (
	"encoding/json"
	"fmt"
	"log"
	"mime"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"umbrella/internal/config"
	"umbrella/internal/storage/sqlite"
)

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
	Stage       string `json:"stage"`
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
				StreamURL: "/api/stream/" + v.ID + "/master.m3u8",
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

// Вспомогательная функция для JSON ошибок
func writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{
		"error": msg,
	})
}

func GetVideoHandler(storage *sqlite.Storage) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := strings.TrimPrefix(r.URL.Path, "/api/video/")
		id = strings.TrimSpace(id)

		if id == "" {
			writeJSONError(w, http.StatusBadRequest, "missing video id")
			return
		}

		v, err := storage.GetVideo(id)
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		if v == nil {
			writeJSONError(w, http.StatusNotFound, "video not found")
			return
		}

		// --- FIX: гарантируем stage ---
		stage := v.Stage
		if stage == "" {
			switch v.Status {
			case "processing":
				stage = "init"
			case "ready":
				stage = "done"
			case "error":
				stage = "error"
			default:
				stage = "init"
			}
		}

		resp := VideoResponse{
			ID:          v.ID,
			Title:       v.Title,
			Status:      v.Status,
			Thumbnail:   v.Thumbnail,
			Description: v.Description,
			Progress:    v.Progress,
			Stage:       stage,
			StreamURL:   "/api/stream/" + v.ID + "/master.m3u8",
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

func Stream(w http.ResponseWriter, r *http.Request) {
	// Разрешаем только GET и HEAD (стриминг + preload)
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	const prefix = "/api/stream/"

	// Проверяем корректность маршрута
	if !strings.HasPrefix(r.URL.Path, prefix) {
		http.NotFound(w, r)
		return
	}

	// Получаем относительный путь
	rel := strings.TrimPrefix(r.URL.Path, prefix)

	// Запрещаем пустой путь (иначе уходит в директорию)
	if rel == "" {
		http.NotFound(w, r)
		return
	}

	// Нормализуем URL-путь (важно: path, не filepath)
	rel = path.Clean(rel)

	// Защита от "out of scope"
	if rel == "." || rel == "/" {
		http.NotFound(w, r)
		return
	}

	// Запрещаем абсолютные пути
	if strings.HasPrefix(rel, "/") {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	base := filepath.Clean(VIDEOPATH)
	full := filepath.Join(base, filepath.FromSlash(rel))

	// Жёсткая проверка: нельзя выйти за VIDEOPATH
	relCheck, err := filepath.Rel(base, full)
	if err != nil || strings.HasPrefix(relCheck, "..") {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	// Проверка существования файла
	info, err := os.Stat(full)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	// Запрещаем директории
	if info.IsDir() {
		http.NotFound(w, r)
		return
	}

	// Разрешённые форматы (HLS + видео + превью)
	ext := strings.ToLower(filepath.Ext(info.Name()))
	switch ext {
	case ".mp4", ".webm", ".mov", ".mkv", ".mp3",
		".m3u8", ".ts",
		".jpg", ".jpeg", ".png", ".webp":
	default:
		http.Error(w, "unsupported file type", http.StatusForbidden)
		return
	}

	// MIME-типы для HLS (важно для плееров)
	switch ext {
	case ".m3u8":
		w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
	case ".ts":
		w.Header().Set("Content-Type", "video/mp2t")
	}

	// Поддержка range-запросов (перемотка видео)
	w.Header().Set("Accept-Ranges", "bytes")

	// Безопасная отдача файла с поддержкой range
	f, err := os.Open(full)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer f.Close()

	http.ServeContent(w, r, info.Name(), info.ModTime(), f)
}
