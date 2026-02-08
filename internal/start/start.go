package start

import (
	"log"
	"net/http"
	"umbrella/internal/config"
	"umbrella/internal/storage/sqlite"
	"umbrella/internal/video"
)

func Start_server() {
	cfg := config.MustLoad()
	videoDataBase := cfg.StoragePath
	Static := cfg.Static
	addr := cfg.HTTPServer.Address
	port := cfg.HTTPServer.Port

	storage, err := sqlite.Init(videoDataBase)
	if err != nil {
		log.Fatalf("failed to init storage: %v", err)
	}

	mux := http.NewServeMux()
	// static
	mux.Handle("/", http.FileServer(http.Dir(Static)))

	Register(mux, storage)

	log.Println("http://" + addr + ":" + port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}

func Register(mux *http.ServeMux, storage *sqlite.Storage) {
	mux.HandleFunc("/watch", serveWatch)
	mux.HandleFunc("/home", serveHome)

	mux.HandleFunc("/api/videos", video.ListVideos(storage))
	mux.HandleFunc("/api/random", video.RandomVideoHandler(storage))
	mux.HandleFunc("/api/upload", video.UploadHandler(storage))
	mux.HandleFunc("/api/publish", video.PublishHandler(storage))
	mux.HandleFunc("/api/video/", video.GetVideoHandler(storage))
	mux.HandleFunc("/api/stream/", video.Stream)
}

func serveWatch(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, "static/watch.html")
}
func serveHome(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, "static/index.html")
}
