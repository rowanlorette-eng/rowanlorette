package start

import (
	"database/sql"
	"log"
	"net/http"
	"umbrella/video"

	_ "modernc.org/sqlite"
)

func Start_server() {
	db, err := sql.Open("sqlite", "data.db")
	if err != nil {
		log.Fatal(err)
	}

	video.Init(db)

	mux := http.NewServeMux()

	// static
	mux.Handle("/static/",
		http.StripPrefix("/static/",
			http.FileServer(http.Dir("./static"))))

	// video api
	video.Register(mux)

	log.Println("http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", mux))
}
