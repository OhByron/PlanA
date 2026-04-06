package handlers

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/OhByron/PlanA/internal/auth"
)

// containerDepResponse is the shared response shape for epic and sprint dependencies.
type containerDepResponse struct {
	ID        string    `json:"id"`
	SourceID  string    `json:"source_id"`
	TargetID  string    `json:"target_id"`
	Type      string    `json:"type"`
	Strength  string    `json:"strength"`
	CreatedBy string    `json:"created_by"`
	CreatedAt time.Time `json:"created_at"`
}

type createContainerDepRequest struct {
	TargetID string `json:"target_id"`
	Type     string `json:"type"`
	Strength string `json:"strength"`
}

// ---- Epic Dependencies ----

type EpicDepHandlers struct{ db DBPOOL }

func NewEpicDepHandlers(db DBPOOL) *EpicDepHandlers { return &EpicDepHandlers{db: db} }

// ListByProject returns all epic dependencies for epics in a project.
func (h *EpicDepHandlers) ListByProject(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")

	rows, err := h.db.Query(r.Context(), `
		SELECT d.id, d.source_id, d.target_id, d.type, d.strength, d.created_by, d.created_at
		FROM epic_dependencies d
		JOIN epics es ON es.id = d.source_id
		WHERE es.project_id = $1
		ORDER BY d.created_at`, projectID)
	if err != nil {
		slog.Error("epicDeps.ListByProject: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list epic dependencies")
		return
	}
	defer rows.Close()

	deps := []containerDepResponse{}
	for rows.Next() {
		var d containerDepResponse
		if err := rows.Scan(&d.ID, &d.SourceID, &d.TargetID, &d.Type, &d.Strength, &d.CreatedBy, &d.CreatedAt); err != nil {
			slog.Error("epicDeps.ListByProject: scan failed", "error", err)
			continue
		}
		deps = append(deps, d)
	}

	writeJSON(w, http.StatusOK, deps)
}

// Create adds an epic dependency.
func (h *EpicDepHandlers) Create(w http.ResponseWriter, r *http.Request) {
	epicID := chi.URLParam(r, "epicID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	var body createContainerDepRequest
	if !readJSON(w, r, &body) {
		return
	}
	if body.TargetID == "" || (body.Type != "depends_on" && body.Type != "relates_to") {
		writeError(w, http.StatusBadRequest, "validation_error", "target_id and valid type required")
		return
	}
	if body.TargetID == epicID {
		writeError(w, http.StatusBadRequest, "validation_error", "Cannot depend on self")
		return
	}
	if body.Strength == "" {
		body.Strength = "hard"
	}

	var d containerDepResponse
	err := h.db.QueryRow(r.Context(), `
		INSERT INTO epic_dependencies (source_id, target_id, type, strength, created_by)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, source_id, target_id, type, strength, created_by, created_at`,
		epicID, body.TargetID, body.Type, body.Strength, claims.UserID,
	).Scan(&d.ID, &d.SourceID, &d.TargetID, &d.Type, &d.Strength, &d.CreatedBy, &d.CreatedAt)
	if err != nil {
		slog.Error("epicDeps.Create: insert failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to create epic dependency")
		return
	}

	writeJSON(w, http.StatusCreated, d)
}

// Delete removes an epic dependency by ID.
func (h *EpicDepHandlers) Delete(w http.ResponseWriter, r *http.Request) {
	depID := chi.URLParam(r, "depID")
	tag, err := h.db.Exec(r.Context(), `DELETE FROM epic_dependencies WHERE id = $1`, depID)
	if err != nil {
		slog.Error("epicDeps.Delete: exec failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to delete epic dependency")
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "not_found", "Dependency not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---- Sprint Dependencies ----

type SprintDepHandlers struct{ db DBPOOL }

func NewSprintDepHandlers(db DBPOOL) *SprintDepHandlers { return &SprintDepHandlers{db: db} }

// ListByProject returns all sprint dependencies for sprints in a project.
func (h *SprintDepHandlers) ListByProject(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")

	rows, err := h.db.Query(r.Context(), `
		SELECT d.id, d.source_id, d.target_id, d.type, d.strength, d.created_by, d.created_at
		FROM sprint_dependencies d
		JOIN sprints s ON s.id = d.source_id
		WHERE s.project_id = $1
		ORDER BY d.created_at`, projectID)
	if err != nil {
		slog.Error("sprintDeps.ListByProject: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list sprint dependencies")
		return
	}
	defer rows.Close()

	deps := []containerDepResponse{}
	for rows.Next() {
		var d containerDepResponse
		if err := rows.Scan(&d.ID, &d.SourceID, &d.TargetID, &d.Type, &d.Strength, &d.CreatedBy, &d.CreatedAt); err != nil {
			slog.Error("sprintDeps.ListByProject: scan failed", "error", err)
			continue
		}
		deps = append(deps, d)
	}

	writeJSON(w, http.StatusOK, deps)
}

// Create adds a sprint dependency.
func (h *SprintDepHandlers) Create(w http.ResponseWriter, r *http.Request) {
	sprintID := chi.URLParam(r, "sprintID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	var body createContainerDepRequest
	if !readJSON(w, r, &body) {
		return
	}
	if body.TargetID == "" || (body.Type != "depends_on" && body.Type != "relates_to") {
		writeError(w, http.StatusBadRequest, "validation_error", "target_id and valid type required")
		return
	}
	if body.TargetID == sprintID {
		writeError(w, http.StatusBadRequest, "validation_error", "Cannot depend on self")
		return
	}
	if body.Strength == "" {
		body.Strength = "hard"
	}

	var d containerDepResponse
	err := h.db.QueryRow(r.Context(), `
		INSERT INTO sprint_dependencies (source_id, target_id, type, strength, created_by)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, source_id, target_id, type, strength, created_by, created_at`,
		sprintID, body.TargetID, body.Type, body.Strength, claims.UserID,
	).Scan(&d.ID, &d.SourceID, &d.TargetID, &d.Type, &d.Strength, &d.CreatedBy, &d.CreatedAt)
	if err != nil {
		slog.Error("sprintDeps.Create: insert failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to create sprint dependency")
		return
	}

	writeJSON(w, http.StatusCreated, d)
}

// Delete removes a sprint dependency by ID.
func (h *SprintDepHandlers) Delete(w http.ResponseWriter, r *http.Request) {
	depID := chi.URLParam(r, "depID")
	tag, err := h.db.Exec(r.Context(), `DELETE FROM sprint_dependencies WHERE id = $1`, depID)
	if err != nil {
		slog.Error("sprintDeps.Delete: exec failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to delete sprint dependency")
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "not_found", "Dependency not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
