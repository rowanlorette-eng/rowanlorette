package sqlite

import (
	"database/sql"
	"errors"
	"fmt"

	_ "modernc.org/sqlite"
)

type Storage struct {
	DB *sql.DB
}

type Video struct {
	ID          string
	Title       string
	Status      string
	Thumbnail   string
	Description string
	Progress    int
	Stage       string
	Width       int
	Height      int
}

// Инициализация базы
func Init(storagePath string) (*Storage, error) {
	db, err := sql.Open("sqlite", storagePath)
	if err != nil {
		return nil, fmt.Errorf("init: failed to open sqlite database at %s: %w", storagePath, err)
	}

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("init: failed to ping sqlite database at %s: %w", storagePath, err)
	}

	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS videos (
	id TEXT PRIMARY KEY,
	title TEXT,
	status TEXT,
	thumbnail TEXT,
	description TEXT,
	progress INTEGER DEFAULT 0,
	stage TEXT DEFAULT '',
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)`); err != nil {
		return nil, fmt.Errorf("init: failed to create videos table in sqlite database at %s: %w", storagePath, err)
	}

	return &Storage{DB: db}, nil
}

// Метод для получения списка видео
func (s *Storage) ListVideos(limit, offset int) ([]Video, error) {
	rows, err := s.DB.Query(`
		SELECT id, title, status, thumbnail, progress
		FROM videos
		WHERE status = 'ready'
		ORDER BY created_at DESC
		LIMIT ? OFFSET ?
	`, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("ListVideos query failed: %w", err)
	}
	defer rows.Close()

	var videos []Video
	for rows.Next() {
		var v Video
		if err := rows.Scan(&v.ID, &v.Title, &v.Status, &v.Thumbnail, &v.Progress); err != nil {
			return nil, fmt.Errorf("ListVideos scan failed: %w", err)
		}
		videos = append(videos, v)
	}

	return videos, nil
}

func (s *Storage) SetVideoStage(id, stage string, progress int) error {
	_, err := s.DB.Exec(`
		UPDATE videos
		SET stage = ?, progress = ?
		WHERE id = ?
	`, stage, progress, id)

	if err != nil {
		fmt.Println("SetVideoStage ERROR:", err)
	}

	return err
}

// Возвращает одно видео по ID
func (s *Storage) GetVideo(id string) (*Video, error) {
	var desc sql.NullString
	var stage sql.NullString
	var thumb sql.NullString

	row := s.DB.QueryRow(`
		SELECT title, status, thumbnail, description, progress, stage
		FROM videos
		WHERE id = ?
	`, id)

	var v Video
	v.ID = id

	err := row.Scan(&v.Title, &v.Status, &thumb, &desc, &v.Progress, &stage)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("GetVideo scan failed: %w", err)
	}

	if thumb.Valid {
		v.Thumbnail = thumb.String
	}

	if desc.Valid {
		v.Description = desc.String
	}

	if stage.Valid {
		v.Stage = stage.String
	}

	return &v, nil
}

// Возвращает случайное видео с статусом "ready"
func (s *Storage) GetRandomVideoID() (string, error) {
	var id string
	row := s.DB.QueryRow(`
		SELECT id
		FROM videos
		WHERE status = 'ready'
		ORDER BY RANDOM()
		LIMIT 1
	`)
	err := row.Scan(&id)
	if err != nil {
		if err == sql.ErrNoRows {
			return "", nil // нет видео
		}
		return "", fmt.Errorf("GetRandomVideoID scan failed: %w", err)
	}
	return id, nil
}

// Создаёт новую запись видео в базе
func (s *Storage) CreateVideo(id, title, status string, progress int) error {
	_, err := s.DB.Exec(`
		INSERT INTO videos(id, title, status, progress)
		VALUES(?, ?, ?, ?)
	`, id, title, status, progress)
	if err != nil {
		return fmt.Errorf("CreateVideo failed: %w", err)
	}
	return nil
}

// Обновляет видео перед началом транскодинга: title, status и progress
func (s *Storage) SetVideoProcessing(id, title string) error {
	_, err := s.DB.Exec(`
		UPDATE videos
		SET title = ?, status = 'processing', progress = 0, stage = 'init'
		WHERE id = ?
	`, title, id)

	if err != nil {
		return fmt.Errorf("SetVideoProcessing failed: %w", err)
	}
	return nil
}

// Устанавливает статус видео в "error"
func (s *Storage) SetVideoError(id string) error {
	_, err := s.DB.Exec(`UPDATE videos SET status='error' WHERE id=?`, id)
	if err != nil {
		return fmt.Errorf("SetVideoError failed: %w", err)
	}
	return nil
}

func (s *Storage) SetVideoDescription(id, description string) error {
	res, err := s.DB.Exec(`UPDATE videos SET description=? WHERE id=?`, description, id)
	if err != nil {
		return fmt.Errorf("SetVideoDescription failed: %w", err)
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return fmt.Errorf("video not found: id=%s", id)
	}

	return nil
}

func (s *Storage) DeleteVideo(id string) error {
	res, err := s.DB.Exec(`DELETE FROM videos WHERE id=?`, id)
	if err != nil {
		return err
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return fmt.Errorf("video with id %s not found", id)
	}

	return nil
}

// Устанавливает статус "ready" и путь к thumbnail
func (s *Storage) SetVideoReadyWithThumbnail(id, thumbPath string) error {
	_, err := s.DB.Exec(`
		UPDATE videos
		SET status='ready', thumbnail=?
		WHERE id=?
	`, thumbPath, id)
	if err != nil {
		return fmt.Errorf("SetVideoReadyWithThumbnail failed: %w", err)
	}
	return nil
}

func (s *Storage) SetVideoUploaded(id, filename string) error {
	_, err := s.DB.Exec(`
		UPDATE videos
		SET title = ?, status = 'uploaded'
		WHERE id = ?
	`, filename, id)

	if err != nil {
		return fmt.Errorf("SetVideoUploaded failed: %w", err)
	}

	return nil
}

func (s *Storage) SetVideoMeta(id string, width, height int) error {
	_, err := s.DB.Exec(`
        UPDATE videos
        SET width = ?, height = ?
        WHERE id = ?
    `, width, height, id)

	return err
}
