package video

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
)

var db *sql.DB

func Init(d *sql.DB) {
	db = d
	db.Exec(`CREATE TABLE IF NOT EXISTS videos (
		id TEXT PRIMARY KEY,
		title TEXT,
		status TEXT,
		thumbnail TEXT,
		progress INTEGER DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)`)

	// Миграция: если поля thumbnail нет, добавим
	db.Exec(`ALTER TABLE videos ADD COLUMN thumbnail TEXT`)
	db.Exec(`ALTER TABLE videos ADD COLUMN progress INTEGER DEFAULT 0`)
}

func Register(mux *http.ServeMux) {
	mux.HandleFunc("/watch", serveWatch)

	mux.HandleFunc("/api/videos", listVideos)
	mux.HandleFunc("/api/random", randomVideo)
	mux.HandleFunc("/api/upload", upload)
	mux.HandleFunc("/api/publish", publish)
	mux.HandleFunc("/api/video/", getVideo)
	mux.HandleFunc("/api/stream/", stream)
}

func serveWatch(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, "watch.html")
}

type Video struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Status    string `json:"status"` // uploaded / processing / ready / error
	StreamURL string `json:"stream_url"`
	Thumbnail string `json:"thumbnail"`
	Progress  int    `json:"progress"`
}

func listVideos(w http.ResponseWriter, _ *http.Request) {
	rows, _ := db.Query("SELECT id, title, status, thumbnail, progress FROM videos ORDER BY created_at DESC")
	var res []Video

	for rows.Next() {
		var id, title, status, thumb string
		var progress int
		rows.Scan(&id, &title, &status, &thumb, &progress)
		res = append(res, Video{
			ID:        id,
			Title:     title,
			Status:    status,
			Thumbnail: thumb,
			Progress:  progress,
		})
	}
	json.NewEncoder(w).Encode(res)
}

func randomVideo(w http.ResponseWriter, _ *http.Request) {
	row := db.QueryRow("SELECT id FROM videos WHERE status='ready' ORDER BY RANDOM() LIMIT 1")
	var id string
	err := row.Scan(&id)
	if err != nil {
		http.Error(w, "no videos available", 404)
		return
	}
	w.Write([]byte(id))
}

func upload(w http.ResponseWriter, r *http.Request) {
	file, header, err := r.FormFile("video")
	if err != nil {
		http.Error(w, "file not found", 400)
		return
	}
	defer file.Close()

	id := uuid.New().String()
	dir := filepath.Join("videos", id)
	os.MkdirAll(dir, 0755)

	input := filepath.Join(dir, "input.mp4")
	out, _ := os.Create(input)
	io.Copy(out, file)
	out.Close()

	db.Exec("INSERT INTO videos(id, title, status, progress) VALUES(?, ?, ?, ?)", id, header.Filename, "uploaded", 0)

	w.Write([]byte(id))
}

// publish запускает транскодинг, используя выбранное время для превью
func publish(w http.ResponseWriter, r *http.Request) {
	id := r.FormValue("id")
	title := r.FormValue("title")
	thumbTime := r.FormValue("thumb_time")

	if id == "" || title == "" || thumbTime == "" {
		http.Error(w, "missing params", 400)
		return
	}

	dir := filepath.Join("videos", id)
	input := filepath.Join(dir, "input.mp4")

	// Обновляем title
	db.Exec("UPDATE videos SET title=?, status='processing', progress=0 WHERE id=?", title, id)

	go func() {
		err := transcode(id, input, dir, thumbTime)
		if err != nil {
			fmt.Println("TRANSCODE FAILED:", err)
		}
	}()

	w.Write([]byte("ok"))
}

func transcode(id, input, dir, thumbTime string) error {
	// 1) транскодинг в HLS с прогрессом
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

	// прогресс через stdout
	stdout, _ := cmd.StdoutPipe()
	stderr, _ := cmd.StderrPipe()
	cmd.Start()

	// обновление прогресса "в процессе" (если реально можно)
	go func() {
		buf := make([]byte, 1024)
		for {
			n, _ := stdout.Read(buf)
			if n <= 0 {
				break
			}
			_ = n
		}
	}()

	go func() {
		buf := make([]byte, 1024)
		for {
			n, _ := stderr.Read(buf)
			if n <= 0 {
				break
			}
			_ = n
		}
	}()

	err := cmd.Wait()
	if err != nil {
		db.Exec("UPDATE videos SET status='error' WHERE id=?", id)
		return err
	}

	// 2) thumbnail на выбранном времени
	thumbPath := filepath.Join(dir, "thumb.jpg")
	thumbCmd := exec.Command("ffmpeg",
		"-ss", thumbTime,
		"-i", input,
		"-frames:v", "1",
		"-q:v", "2",
		thumbPath,
	)
	thumbOut, thumbErr := thumbCmd.CombinedOutput()
	if thumbErr != nil {
		fmt.Println("THUMB ERROR:", string(thumbOut))
		db.Exec("UPDATE videos SET status='error' WHERE id=?", id)
		return thumbErr
	}

	// 3) удаляем исходник
	os.Remove(input)

	// 4) сохраняем thumbnail в БД и ставим ready
	db.Exec("UPDATE videos SET status='ready', thumbnail=? WHERE id=?", "/api/stream/"+id+"/thumb.jpg", id)
	return nil
}

func getVideo(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/video/")
	row := db.QueryRow("SELECT title, status, thumbnail, progress FROM videos WHERE id=?", id)
	var title, status, thumb string
	var progress int
	row.Scan(&title, &status, &thumb, &progress)

	if title == "" {
		http.NotFound(w, r)
		return
	}

	v := Video{
		ID:        id,
		Title:     title,
		Status:    status,
		StreamURL: "/api/stream/" + id,
		Thumbnail: thumb,
		Progress:  progress,
	}
	json.NewEncoder(w).Encode(v)
}

func stream(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/stream/")
	clean := filepath.Clean(path)

	if strings.Contains(clean, "..") {
		http.Error(w, "forbidden", 403)
		return
	}

	http.ServeFile(w, r, filepath.Join("videos", clean))
}
