package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/OhByron/PlanA/internal/auth"
)

// SprintItem represents a sprint_items row returned to clients.
type SprintItem struct {
	SprintID   string    `json:"sprint_id"`
	WorkItemID string    `json:"work_item_id"`
	OrderIndex float64   `json:"order_index"`
	AddedAt    time.Time `json:"added_at"`
}

// SprintItemHandlers handles adding and removing work items from a sprint.
type SprintItemHandlers struct {
	db      DBPOOL
	publish EventPublishFunc
}

func NewSprintItemHandlers(db DBPOOL, publish EventPublishFunc) *SprintItemHandlers {
	return &SprintItemHandlers{db: db, publish: publish}
}

// addSprintItemRequest is the optional JSON body for adding a sprint item.
type addSprintItemRequest struct {
	OrderIndex *float64 `json:"order_index"`
}

// Add places a work item into a sprint.
func (h *SprintItemHandlers) Add(w http.ResponseWriter, r *http.Request) {
	sprintID := chi.URLParam(r, "sprintID")
	if sprintID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "sprintID is required")
		return
	}
	workItemID := chi.URLParam(r, "workItemID")
	if workItemID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "workItemID is required")
		return
	}

	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	projectID := resolveSprintProjectID(r.Context(), h.db, sprintID)
	if projectID == "" || !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	var itemOK bool
	_ = h.db.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM work_items WHERE id = $1 AND project_id = $2)`,
		workItemID, projectID).Scan(&itemOK)
	if !itemOK {
		writeError(w, http.StatusBadRequest, "validation_error", "Work item not found in this project")
		return
	}

	var body addSprintItemRequest
	// Body is optional; ignore decode errors for empty bodies.
	_ = json.NewDecoder(r.Body).Decode(&body)

	orderIndex := float64(0)
	if body.OrderIndex != nil {
		orderIndex = *body.OrderIndex
	}

	var si SprintItem
	err := h.db.QueryRow(r.Context(),
		`INSERT INTO sprint_items (sprint_id, work_item_id, order_index)
		 VALUES ($1, $2, $3)
		 ON CONFLICT DO NOTHING
		 RETURNING sprint_id, work_item_id, order_index, added_at`,
		sprintID, workItemID, orderIndex,
	).Scan(&si.SprintID, &si.WorkItemID, &si.OrderIndex, &si.AddedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusConflict, "conflict", "Work item already in sprint")
			return
		}
		slog.Error("sprint_items.Add: insert failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to add work item to sprint")
		return
	}

	writeJSON(w, http.StatusCreated, si)

	if h.publish != nil {
		h.publish("project:"+projectID, "sprint_item.added", map[string]string{
			"sprint_id": sprintID, "work_item_id": workItemID,
		})
	}
}

// ListItems returns all work items in a sprint with full work item details.
func (h *SprintItemHandlers) ListItems(w http.ResponseWriter, r *http.Request) {
	sprintID := chi.URLParam(r, "sprintID")
	if sprintID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "sprintID is required")
		return
	}

	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	projectID := resolveSprintProjectID(r.Context(), h.db, sprintID)
	if projectID == "" {
		writeError(w, http.StatusNotFound, "not_found", "Sprint not found")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	rows, err := h.db.Query(r.Context(), fmt.Sprintf(`
		SELECT %s
		  FROM sprint_items si
		  JOIN work_items wi ON wi.id = si.work_item_id
		  JOIN workflow_states ws ON ws.id = wi.workflow_state_id
		 WHERE si.sprint_id = $1
		 ORDER BY si.order_index`, workItemColumns), sprintID)
	if err != nil {
		slog.Error("sprint_items.ListItems: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list sprint items")
		return
	}
	defer rows.Close()

	items := []WorkItem{}
	for rows.Next() {
		wi, err := scanWorkItem(rows)
		if err != nil {
			slog.Error("sprint_items.ListItems: scan failed", "error", err)
			writeError(w, http.StatusInternalServerError, "db_error", "Failed to read sprint item row")
			return
		}
		items = append(items, wi)
	}
	if err := rows.Err(); err != nil {
		slog.Error("sprint_items.ListItems: rows iteration error", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list sprint items")
		return
	}

	writeJSON(w, http.StatusOK, items)
}

// Remove pulls a work item out of a sprint (back to backlog).
func (h *SprintItemHandlers) Remove(w http.ResponseWriter, r *http.Request) {
	sprintID := chi.URLParam(r, "sprintID")
	if sprintID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "sprintID is required")
		return
	}
	workItemID := chi.URLParam(r, "workItemID")
	if workItemID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "workItemID is required")
		return
	}

	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	projectID := resolveSprintProjectID(r.Context(), h.db, sprintID)
	if projectID == "" || !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	tag, err := h.db.Exec(r.Context(),
		`DELETE FROM sprint_items WHERE sprint_id = $1 AND work_item_id = $2`,
		sprintID, workItemID)
	if err != nil {
		slog.Error("sprint_items.Remove: exec failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to remove sprint item")
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "not_found", "Sprint item not found")
		return
	}

	w.WriteHeader(http.StatusNoContent)

	if h.publish != nil {
		h.publish("project:"+projectID, "sprint_item.removed", map[string]string{
			"sprint_id": sprintID, "work_item_id": workItemID,
		})
	}
}

// AssignedItemIDs returns the IDs of all work items assigned to any sprint in a project.
// GET /api/projects/{projectID}/sprint-assigned
func (h *SprintItemHandlers) AssignedItemIDs(w http.ResponseWriter, r *http.Request) {
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
		SELECT DISTINCT si.work_item_id
		FROM sprint_items si
		JOIN sprints s ON s.id = si.sprint_id
		WHERE s.project_id = $1`, projectID)
	if err != nil {
		slog.Error("sprint_items.AssignedItemIDs: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list assigned items")
		return
	}
	defer rows.Close()

	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			slog.Error("sprint_items.AssignedItemIDs: scan failed", "error", err)
			writeError(w, http.StatusInternalServerError, "db_error", "Failed to read assigned item")
			return
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		slog.Error("sprint_items.AssignedItemIDs: rows error", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list assigned items")
		return
	}

	writeJSON(w, http.StatusOK, ids)
}
