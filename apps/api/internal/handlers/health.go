package handlers

import (
	"net/http"
	"time"
)

type healthResponse struct {
	Status  string    `json:"status"`
	Version string    `json:"version"`
	Time    time.Time `json:"time"`
}

func Health(w http.ResponseWriter, r *http.Request) {
	resp := healthResponse{
		Status:  "ok",
		Version: "0.1.0",
		Time:    time.Now().UTC(),
	}
	writeJSON(w, http.StatusOK, resp)
}
