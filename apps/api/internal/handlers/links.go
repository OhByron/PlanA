package handlers

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/OhByron/PlanA/internal/auth"
)

type LinkHandlers struct {
	db DBPOOL
}

func NewLinkHandlers(db DBPOOL) *LinkHandlers {
	return &LinkHandlers{db: db}
}

type linkResponse struct {
	ID         string    `json:"id"`
	WorkItemID string    `json:"work_item_id"`
	Label      string    `json:"label"`
	URL        string    `json:"url"`
	CreatedAt  time.Time `json:"created_at"`
}

// List returns all links for a work item.
func (h *LinkHandlers) List(w http.ResponseWriter, r *http.Request) {
	workItemID := chi.URLParam(r, "workItemID")
	rows, err := h.db.Query(r.Context(),
		`SELECT id, work_item_id, label, url, created_at
		 FROM work_item_links WHERE work_item_id = $1 ORDER BY created_at`, workItemID)
	if err != nil {
		slog.Error("links.List: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list links")
		return
	}
	defer rows.Close()

	links := []linkResponse{}
	for rows.Next() {
		var l linkResponse
		if err := rows.Scan(&l.ID, &l.WorkItemID, &l.Label, &l.URL, &l.CreatedAt); err != nil {
			slog.Error("links.List: scan failed", "error", err)
			writeError(w, http.StatusInternalServerError, "db_error", "Failed to read link")
			return
		}
		links = append(links, l)
	}
	if err := rows.Err(); err != nil {
		slog.Error("links.List: rows error", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list links")
		return
	}
	writeJSON(w, http.StatusOK, links)
}

// Create adds a link to a work item.
func (h *LinkHandlers) Create(w http.ResponseWriter, r *http.Request) {
	workItemID := chi.URLParam(r, "workItemID")

	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	projectID := resolveProjectID(r.Context(), h.db, workItemID)
	if projectID == "" || !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	var body struct {
		Label string `json:"label"`
		URL   string `json:"url"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	if body.Label == "" || body.URL == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "label and url are required")
		return
	}
	var l linkResponse
	err := h.db.QueryRow(r.Context(),
		`INSERT INTO work_item_links (work_item_id, label, url)
		 VALUES ($1, $2, $3) RETURNING id, work_item_id, label, url, created_at`,
		workItemID, body.Label, body.URL).Scan(&l.ID, &l.WorkItemID, &l.Label, &l.URL, &l.CreatedAt)
	if err != nil {
		slog.Error("links.Create: insert failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to create link")
		return
	}
	writeJSON(w, http.StatusCreated, l)
}

// Delete removes a link by ID.
func (h *LinkHandlers) Delete(w http.ResponseWriter, r *http.Request) {
	linkID := chi.URLParam(r, "linkID")

	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	projectID := resolveLinkProjectID(r.Context(), h.db, linkID)
	if projectID == "" || !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	tag, err := h.db.Exec(r.Context(), `DELETE FROM work_item_links WHERE id = $1`, linkID)
	if err != nil {
		slog.Error("links.Delete: exec failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to delete link")
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "not_found", "Link not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
