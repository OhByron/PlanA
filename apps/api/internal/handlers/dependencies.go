package handlers

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/OhByron/ProjectA/internal/auth"
)

type DependencyHandlers struct {
	db *pgxpool.Pool
}

func NewDependencyHandlers(db *pgxpool.Pool) *DependencyHandlers {
	return &DependencyHandlers{db: db}
}

type dependencyResponse struct {
	ID        string    `json:"id"`
	SourceID  string    `json:"source_id"`
	TargetID  string    `json:"target_id"`
	Type      string    `json:"type"`
	CreatedBy string    `json:"created_by"`
	CreatedAt time.Time `json:"created_at"`
	// Include target/source work item title for display
	TargetTitle string `json:"target_title"`
	TargetType  string `json:"target_type"`
}

// List returns all dependencies where the given work item is source OR target.
// For source items: returns the dependency as-is (type = "depends_on" or "relates_to")
// For target items: returns with direction="incoming" so the UI can show "depended on by"
func (h *DependencyHandlers) List(w http.ResponseWriter, r *http.Request) {
	workItemID := chi.URLParam(r, "workItemID")

	rows, err := h.db.Query(r.Context(), `
		SELECT d.id, d.source_id, d.target_id, d.type, d.created_by, d.created_at,
		       wi.title, wi.type
		FROM work_item_dependencies d
		JOIN work_items wi ON wi.id = CASE
			WHEN d.source_id = $1 THEN d.target_id
			ELSE d.source_id
		END
		WHERE d.source_id = $1 OR d.target_id = $1
		ORDER BY d.created_at`, workItemID)
	if err != nil {
		slog.Error("dependencies.List: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list dependencies")
		return
	}
	defer rows.Close()

	deps := []dependencyResponse{}
	for rows.Next() {
		var d dependencyResponse
		if err := rows.Scan(&d.ID, &d.SourceID, &d.TargetID, &d.Type, &d.CreatedBy, &d.CreatedAt, &d.TargetTitle, &d.TargetType); err != nil {
			slog.Error("dependencies.List: scan failed", "error", err)
			writeError(w, http.StatusInternalServerError, "db_error", "Failed to read dependency")
			return
		}
		deps = append(deps, d)
	}
	if err := rows.Err(); err != nil {
		slog.Error("dependencies.List: rows error", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list dependencies")
		return
	}

	writeJSON(w, http.StatusOK, deps)
}

type createDependencyRequest struct {
	TargetID string `json:"target_id"`
	Type     string `json:"type"`
}

// Create adds a dependency from the current work item to a target.
func (h *DependencyHandlers) Create(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	workItemID := chi.URLParam(r, "workItemID")

	var body createDependencyRequest
	if !readJSON(w, r, &body) {
		return
	}
	if body.TargetID == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "target_id is required")
		return
	}
	if body.Type != "depends_on" && body.Type != "relates_to" {
		writeError(w, http.StatusBadRequest, "validation_error", "type must be 'depends_on' or 'relates_to'")
		return
	}
	if body.TargetID == workItemID {
		writeError(w, http.StatusBadRequest, "validation_error", "Cannot create dependency to self")
		return
	}

	var d dependencyResponse
	err := h.db.QueryRow(r.Context(), `
		INSERT INTO work_item_dependencies (source_id, target_id, type, created_by)
		VALUES ($1, $2, $3, $4)
		RETURNING id, source_id, target_id, type, created_by, created_at`,
		workItemID, body.TargetID, body.Type, claims.UserID,
	).Scan(&d.ID, &d.SourceID, &d.TargetID, &d.Type, &d.CreatedBy, &d.CreatedAt)
	if err != nil {
		slog.Error("dependencies.Create: insert failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to create dependency")
		return
	}

	// Fetch target title for the response
	_ = h.db.QueryRow(r.Context(), `SELECT title, type FROM work_items WHERE id = $1`, body.TargetID).Scan(&d.TargetTitle, &d.TargetType)

	writeJSON(w, http.StatusCreated, d)
}

// ListByProject returns all dependencies for work items in a project.
// GET /api/projects/{projectID}/dependencies
func (h *DependencyHandlers) ListByProject(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")

	rows, err := h.db.Query(r.Context(), `
		SELECT d.id, d.source_id, d.target_id, d.type, d.created_by, d.created_at,
		       wt.title, wt.type
		FROM work_item_dependencies d
		JOIN work_items ws ON ws.id = d.source_id
		JOIN work_items wt ON wt.id = d.target_id
		WHERE ws.project_id = $1 OR wt.project_id = $1
		ORDER BY d.created_at`, projectID)
	if err != nil {
		slog.Error("dependencies.ListByProject: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list dependencies")
		return
	}
	defer rows.Close()

	deps := []dependencyResponse{}
	for rows.Next() {
		var d dependencyResponse
		if err := rows.Scan(&d.ID, &d.SourceID, &d.TargetID, &d.Type, &d.CreatedBy, &d.CreatedAt, &d.TargetTitle, &d.TargetType); err != nil {
			slog.Error("dependencies.ListByProject: scan failed", "error", err)
			writeError(w, http.StatusInternalServerError, "db_error", "Failed to read dependency")
			return
		}
		deps = append(deps, d)
	}
	if err := rows.Err(); err != nil {
		slog.Error("dependencies.ListByProject: rows error", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list dependencies")
		return
	}

	writeJSON(w, http.StatusOK, deps)
}

// Delete removes a dependency by ID.
func (h *DependencyHandlers) Delete(w http.ResponseWriter, r *http.Request) {
	depID := chi.URLParam(r, "depID")

	tag, err := h.db.Exec(r.Context(), `DELETE FROM work_item_dependencies WHERE id = $1`, depID)
	if err != nil {
		slog.Error("dependencies.Delete: exec failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to delete dependency")
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "not_found", "Dependency not found")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
