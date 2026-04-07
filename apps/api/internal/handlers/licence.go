package handlers

import (
	"log/slog"
	"net/http"

	"github.com/OhByron/PlanA/internal/licence"
)

type LicenceHandlers struct {
	db DBPOOL
}

func NewLicenceHandlers(db DBPOOL) *LicenceHandlers {
	return &LicenceHandlers{db: db}
}

// Get returns the current licence status.
// GET /api/licence
func (h *LicenceHandlers) Get(w http.ResponseWriter, r *http.Request) {
	var key string
	err := h.db.QueryRow(r.Context(),
		`SELECT key FROM app_licence WHERE id = 1`).Scan(&key)
	if err != nil || key == "" {
		writeJSON(w, http.StatusOK, licence.GetInfo(nil, false))
		return
	}

	lic, err := licence.Validate(key)
	if err != nil {
		slog.Warn("licence.Get: validation failed", "error", err)
		writeJSON(w, http.StatusOK, licence.GetInfo(nil, false))
		return
	}

	writeJSON(w, http.StatusOK, licence.GetInfo(lic, true))
}

// Activate accepts a licence key, validates it, and stores it.
// POST /api/licence
func (h *LicenceHandlers) Activate(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Key string `json:"key"`
	}
	if !readJSON(w, r, &body) {
		return
	}

	lic, err := licence.Validate(body.Key)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_licence", "Invalid licence key: "+err.Error())
		return
	}

	// Store the key
	_, err = h.db.Exec(r.Context(),
		`INSERT INTO app_licence (id, key, tier, organisation, expires_at, updated_at)
		 VALUES (1, $1, $2, $3, $4::date, NOW())
		 ON CONFLICT (id) DO UPDATE SET key = $1, tier = $2, organisation = $3, expires_at = $4::date, updated_at = NOW()`,
		body.Key, string(lic.Tier), lic.Organisation, nullableStr(lic.ExpiresAt))
	if err != nil {
		slog.Error("licence.Activate: store failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to store licence")
		return
	}

	slog.Info("licence activated", "tier", lic.Tier, "org", lic.Organisation, "expires", lic.ExpiresAt)
	writeJSON(w, http.StatusOK, licence.GetInfo(lic, true))
}

func nullableStr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
