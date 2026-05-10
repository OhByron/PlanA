package handlers

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/OhByron/PlanA/internal/auth"
)

type DependencyHandlers struct {
	db DBPOOL
}

func NewDependencyHandlers(db DBPOOL) *DependencyHandlers {
	return &DependencyHandlers{db: db}
}

type dependencyResponse struct {
	ID          string    `json:"id"`
	SourceID    string    `json:"source_id"`
	TargetID    string    `json:"target_id"`
	Type        string    `json:"type"`
	Strength    string    `json:"strength"`
	CreatedBy   string    `json:"created_by"`
	CreatedAt   time.Time `json:"created_at"`
	TargetTitle string    `json:"target_title"`
	TargetType  string    `json:"target_type"`
}

// List returns all dependencies where the given work item is source OR target.
// For source items: returns the dependency as-is (type = "depends_on" or "relates_to")
// For target items: returns with direction="incoming" so the UI can show "depended on by"
func (h *DependencyHandlers) List(w http.ResponseWriter, r *http.Request) {
	workItemID := chi.URLParam(r, "workItemID")

	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	projectID := resolveProjectID(r.Context(), h.db, workItemID)
	if projectID == "" {
		writeError(w, http.StatusNotFound, "not_found", "Work item not found")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	rows, err := h.db.Query(r.Context(), `
		SELECT d.id, d.source_id, d.target_id, d.type, d.strength, d.created_by, d.created_at,
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
		if err := rows.Scan(&d.ID, &d.SourceID, &d.TargetID, &d.Type, &d.Strength, &d.CreatedBy, &d.CreatedAt, &d.TargetTitle, &d.TargetType); err != nil {
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
	Strength string `json:"strength"`
}

// Create adds a dependency from the current work item to a target.
func (h *DependencyHandlers) Create(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	workItemID := chi.URLParam(r, "workItemID")

	projectID := resolveProjectID(r.Context(), h.db, workItemID)
	if projectID == "" || !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

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
	if body.Strength == "" {
		body.Strength = "hard"
	}
	if body.Strength != "hard" && body.Strength != "soft" {
		writeError(w, http.StatusBadRequest, "validation_error", "strength must be 'hard' or 'soft'")
		return
	}
	if body.TargetID == workItemID {
		writeError(w, http.StatusBadRequest, "validation_error", "Cannot create dependency to self")
		return
	}

	// Prevent dependencies between a parent and its direct children.
	// A task cannot depend on its own parent story (or vice versa).
	var sourceParent, targetParent *string
	h.db.QueryRow(r.Context(), `SELECT parent_id FROM work_items WHERE id = $1`, workItemID).Scan(&sourceParent)
	h.db.QueryRow(r.Context(), `SELECT parent_id FROM work_items WHERE id = $1`, body.TargetID).Scan(&targetParent)
	if (sourceParent != nil && *sourceParent == body.TargetID) || (targetParent != nil && *targetParent == workItemID) {
		writeError(w, http.StatusBadRequest, "validation_error", "Cannot create a dependency between a parent and its own child")
		return
	}

	var d dependencyResponse
	err := h.db.QueryRow(r.Context(), `
		INSERT INTO work_item_dependencies (source_id, target_id, type, strength, created_by)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, source_id, target_id, type, strength, created_by, created_at`,
		workItemID, body.TargetID, body.Type, body.Strength, claims.UserID,
	).Scan(&d.ID, &d.SourceID, &d.TargetID, &d.Type, &d.Strength, &d.CreatedBy, &d.CreatedAt)
	if err != nil {
		slog.Error("dependencies.Create: insert failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to create dependency")
		return
	}

	// Fetch target title for the response
	if err := h.db.QueryRow(r.Context(), `SELECT title, type FROM work_items WHERE id = $1`, body.TargetID).Scan(&d.TargetTitle, &d.TargetType); err != nil {
		slog.Warn("dependencies.Create: target title lookup failed", "targetID", body.TargetID, "error", err)
	}

	writeJSON(w, http.StatusCreated, d)
}

// ListByProject returns all dependencies for work items in a project.
// GET /api/projects/{projectID}/dependencies
func (h *DependencyHandlers) ListByProject(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")

	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	rows, err := h.db.Query(r.Context(), `
		SELECT d.id, d.source_id, d.target_id, d.type, d.strength, d.created_by, d.created_at,
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
		if err := rows.Scan(&d.ID, &d.SourceID, &d.TargetID, &d.Type, &d.Strength, &d.CreatedBy, &d.CreatedAt, &d.TargetTitle, &d.TargetType); err != nil {
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

	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	projectID := resolveDependencyProjectID(r.Context(), h.db, depID)
	if projectID == "" || !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

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

// --- Bulk commit for dependency graph ---

type bulkDependencyItem struct {
	SourceID string `json:"source_id"`
	TargetID string `json:"target_id"`
	Type     string `json:"type"`
	Strength string `json:"strength"`
}

type bulkCommitRequest struct {
	Create []bulkDependencyItem `json:"create"`
	Delete []string             `json:"delete"`
}

type bulkCommitResponse struct {
	Created int                  `json:"created"`
	Deleted int                  `json:"deleted"`
	Deps    []dependencyResponse `json:"deps"`
}

// BulkCommit atomically creates and deletes dependencies in a single transaction.
// POST /api/projects/{projectID}/dependencies/bulk
func (h *DependencyHandlers) BulkCommit(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")

	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	var body bulkCommitRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "Invalid request body")
		return
	}

	// Validate items
	for i, item := range body.Create {
		if item.SourceID == "" || item.TargetID == "" {
			writeError(w, http.StatusBadRequest, "validation_error", "create item must have source_id and target_id")
			return
		}
		if item.SourceID == item.TargetID {
			writeError(w, http.StatusBadRequest, "validation_error", "Cannot create dependency to self")
			return
		}
		if item.Type != "depends_on" && item.Type != "relates_to" {
			writeError(w, http.StatusBadRequest, "validation_error", "type must be 'depends_on' or 'relates_to'")
			return
		}
		if item.Strength == "" {
			body.Create[i].Strength = "hard"
		} else if item.Strength != "hard" && item.Strength != "soft" {
			writeError(w, http.StatusBadRequest, "validation_error", "strength must be 'hard' or 'soft'")
			return
		}
	}

	// Pre-check: reject parent-child dependencies
	for _, item := range body.Create {
		if item.Type != "depends_on" {
			continue
		}
		var srcParent, tgtParent *string
		h.db.QueryRow(r.Context(), `SELECT parent_id FROM work_items WHERE id = $1`, item.SourceID).Scan(&srcParent)
		h.db.QueryRow(r.Context(), `SELECT parent_id FROM work_items WHERE id = $1`, item.TargetID).Scan(&tgtParent)
		if (srcParent != nil && *srcParent == item.TargetID) || (tgtParent != nil && *tgtParent == item.SourceID) {
			writeError(w, http.StatusBadRequest, "validation_error",
				"Cannot create a dependency between a parent and its own child")
			return
		}
	}

	ctx := r.Context()
	tx, err := h.db.Begin(ctx)
	if err != nil {
		slog.Error("dependencies.BulkCommit: begin tx failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to start transaction")
		return
	}
	defer tx.Rollback(ctx)

	// Delete requested dependencies
	deleted := 0
	for _, depID := range body.Delete {
		tag, err := tx.Exec(ctx,
			`DELETE FROM work_item_dependencies WHERE id = $1
			 AND (source_id IN (SELECT id FROM work_items WHERE project_id = $2)
			   OR target_id IN (SELECT id FROM work_items WHERE project_id = $2))`,
			depID, projectID)
		if err != nil {
			slog.Error("dependencies.BulkCommit: delete failed", "depID", depID, "error", err)
			writeError(w, http.StatusInternalServerError, "db_error", "Failed to delete dependency")
			return
		}
		deleted += int(tag.RowsAffected())
	}

	// Create new dependencies
	created := 0
	for _, item := range body.Create {
		tag, err := tx.Exec(ctx,
			`INSERT INTO work_item_dependencies (source_id, target_id, type, strength, created_by)
			 VALUES ($1, $2, $3, $4, $5)
			 ON CONFLICT (source_id, target_id, type) DO NOTHING`,
			item.SourceID, item.TargetID, item.Type, item.Strength, claims.UserID)
		if err != nil {
			slog.Error("dependencies.BulkCommit: insert failed", "error", err)
			writeError(w, http.StatusInternalServerError, "db_error", "Failed to create dependency")
			return
		}
		created += int(tag.RowsAffected())
	}

	// Check for circular dependencies among depends_on edges
	var cyclePath []string
	err = tx.QueryRow(ctx, `
		WITH RECURSIVE dep_chain AS (
			SELECT source_id, target_id, ARRAY[source_id] AS path
			FROM work_item_dependencies
			WHERE type = 'depends_on'
			  AND source_id IN (SELECT id FROM work_items WHERE project_id = $1)
			UNION ALL
			SELECT d.source_id, d.target_id, dc.path || d.source_id
			FROM work_item_dependencies d
			JOIN dep_chain dc ON d.source_id = dc.target_id
			WHERE NOT d.source_id = ANY(dc.path)
			  AND d.type = 'depends_on'
		)
		SELECT path || target_id FROM dep_chain WHERE target_id = ANY(path) LIMIT 1
	`, projectID).Scan(&cyclePath)

	if err == nil && len(cyclePath) > 0 {
		// Cycle detected — rollback
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{
			"code":    "circular_dependency",
			"message": "Committing these dependencies would create a circular dependency",
			"cycle":   cyclePath,
		})
		return
	}

	if err := tx.Commit(ctx); err != nil {
		slog.Error("dependencies.BulkCommit: commit failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to commit transaction")
		return
	}

	// Return updated project dependencies
	rows, err := h.db.Query(ctx, `
		SELECT d.id, d.source_id, d.target_id, d.type, d.strength, d.created_by, d.created_at,
		       wt.title, wt.type
		FROM work_item_dependencies d
		JOIN work_items ws ON ws.id = d.source_id
		JOIN work_items wt ON wt.id = d.target_id
		WHERE ws.project_id = $1 OR wt.project_id = $1
		ORDER BY d.created_at`, projectID)
	if err != nil {
		slog.Error("dependencies.BulkCommit: list failed", "error", err)
		writeJSON(w, http.StatusOK, bulkCommitResponse{Created: created, Deleted: deleted, Deps: []dependencyResponse{}})
		return
	}
	defer rows.Close()

	deps := []dependencyResponse{}
	for rows.Next() {
		var d dependencyResponse
		if err := rows.Scan(&d.ID, &d.SourceID, &d.TargetID, &d.Type, &d.Strength, &d.CreatedBy, &d.CreatedAt, &d.TargetTitle, &d.TargetType); err != nil {
			slog.Error("dependencies.BulkCommit: scan failed", "error", err)
			continue
		}
		deps = append(deps, d)
	}

	writeJSON(w, http.StatusOK, bulkCommitResponse{Created: created, Deleted: deleted, Deps: deps})
}
