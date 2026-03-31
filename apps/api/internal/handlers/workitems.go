package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/OhByron/ProjectA/internal/auth"
)

// WorkItem represents a work_items row returned to clients.
type WorkItem struct {
	ID            string          `json:"id"`
	ItemNumber    *int            `json:"item_number"`
	ProjectID     string          `json:"project_id"`
	EpicID        *string         `json:"epic_id"`
	ParentID      *string         `json:"parent_id"`
	Type          string          `json:"type"`
	Title         string          `json:"title"`
	Description   json.RawMessage `json:"description"`
	Status        string          `json:"status"`
	Priority      string          `json:"priority"`
	AssigneeID    *string         `json:"assignee_id"`
	StoryPoints   *int            `json:"story_points"`
	Labels        []string        `json:"labels"`
	OrderIndex    float64         `json:"order_index"`
	IsBlocked          bool            `json:"is_blocked"`
	BlockedReason      *string         `json:"blocked_reason"`
	SourceTestResultID *string         `json:"source_test_result_id"`
	CreatedBy          string          `json:"created_by"`
	CreatedAt          time.Time       `json:"created_at"`
	UpdatedAt          time.Time       `json:"updated_at"`
}

// WorkItemHandlers handles CRUD for stories, bugs, and tasks within a project.
type WorkItemHandlers struct {
	db DBPOOL
}

func NewWorkItemHandlers(db DBPOOL) *WorkItemHandlers { return &WorkItemHandlers{db: db} }

// qeGateCheck validates whether a QE-assigned work item can move to Done.
// Returns ("", "") if the gate passes, or (code, message) if blocked.
func qeGateCheck(jobRole string, totalResults, failedResults int) (code string, message string) {
	if jobRole != "qe" {
		return "", ""
	}
	if totalResults == 0 {
		return "qe_gate_no_results",
			"QE items require at least one linked test result before moving to Done"
	}
	if failedResults > 0 {
		return "qe_gate_failing_tests",
			fmt.Sprintf("Cannot close: %d test(s) still failing. Resolve defects and retest before moving to Done", failedResults)
	}
	return "", ""
}

// List returns all work items for a given project, with optional filters.
func (h *WorkItemHandlers) List(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "projectID is required")
		return
	}

	pp := parsePagination(r)

	where := "WHERE project_id = $1"
	args := []any{projectID}
	argN := 2

	if v := r.URL.Query().Get("type"); v != "" {
		where += fmt.Sprintf(" AND type = $%d", argN)
		args = append(args, v)
		argN++
	}
	if v := r.URL.Query().Get("status"); v != "" {
		where += fmt.Sprintf(" AND status = $%d", argN)
		args = append(args, v)
		argN++
	}
	if v := r.URL.Query().Get("epic_id"); v != "" {
		where += fmt.Sprintf(" AND epic_id = $%d", argN)
		args = append(args, v)
		argN++
	}
	if v := r.URL.Query().Get("assignee_id"); v != "" {
		where += fmt.Sprintf(" AND assignee_id = $%d", argN)
		args = append(args, v)
		argN++
	}

	// Count total matching rows.
	var total int
	err := h.db.QueryRow(r.Context(), "SELECT COUNT(*) FROM work_items "+where, args...).Scan(&total)
	if err != nil {
		slog.Error("workitems.List: count query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list work items")
		return
	}

	query := fmt.Sprintf(`SELECT id, item_number, project_id, epic_id, parent_id, type, title, description,
		status, priority, assignee_id, story_points, labels, order_index,
		is_blocked, blocked_reason, source_test_result_id, created_by, created_at, updated_at
		FROM work_items %s ORDER BY order_index, created_at LIMIT $%d OFFSET $%d`, where, argN, argN+1)
	args = append(args, pp.PageSize, pp.Offset)

	rows, err := h.db.Query(r.Context(), query, args...)
	if err != nil {
		slog.Error("workitems.List: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list work items")
		return
	}
	defer rows.Close()

	items := []WorkItem{}
	for rows.Next() {
		var wi WorkItem
		if err := rows.Scan(
			&wi.ID, &wi.ItemNumber, &wi.ProjectID, &wi.EpicID, &wi.ParentID, &wi.Type, &wi.Title, &wi.Description,
			&wi.Status, &wi.Priority, &wi.AssigneeID, &wi.StoryPoints, &wi.Labels, &wi.OrderIndex,
			&wi.IsBlocked, &wi.BlockedReason, &wi.SourceTestResultID, &wi.CreatedBy, &wi.CreatedAt, &wi.UpdatedAt,
		); err != nil {
			slog.Error("workitems.List: scan failed", "error", err)
			writeError(w, http.StatusInternalServerError, "db_error", "Failed to read work item row")
			return
		}
		if wi.Labels == nil {
			wi.Labels = []string{}
		}
		items = append(items, wi)
	}
	if err := rows.Err(); err != nil {
		slog.Error("workitems.List: rows iteration error", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list work items")
		return
	}

	writeJSON(w, http.StatusOK, paginatedResponse{Items: items, Total: total, Page: pp.Page, PageSize: pp.PageSize})
}

// createWorkItemRequest is the JSON body for creating a work item.
type createWorkItemRequest struct {
	Type               string          `json:"type"`
	Title              string          `json:"title"`
	Description        json.RawMessage `json:"description"`
	EpicID             *string         `json:"epic_id"`
	ParentID           *string         `json:"parent_id"`
	Priority           *string         `json:"priority"`
	AssigneeID         *string         `json:"assignee_id"`
	StoryPoints        *int            `json:"story_points"`
	Labels             []string        `json:"labels"`
	OrderIndex         *float64        `json:"order_index"`
	SourceTestResultID *string         `json:"source_test_result_id"`
}

// Create inserts a new work item under the given project.
func (h *WorkItemHandlers) Create(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "projectID is required")
		return
	}

	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	var body createWorkItemRequest
	if !readJSON(w, r, &body) {
		return
	}
	if body.Type == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "type is required")
		return
	}
	if body.Title == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "title is required")
		return
	}

	priority := "medium"
	if body.Priority != nil && *body.Priority != "" {
		priority = *body.Priority
	}

	labels := body.Labels
	if labels == nil {
		labels = []string{}
	}

	var orderIndex float64
	if body.OrderIndex != nil {
		orderIndex = *body.OrderIndex
	}

	// Atomically increment the project's item counter to get a sequential number.
	var itemNumber int
	err := h.db.QueryRow(r.Context(),
		`UPDATE projects SET item_counter = item_counter + 1 WHERE id = $1 RETURNING item_counter`,
		projectID).Scan(&itemNumber)
	if err != nil {
		slog.Error("workitems.Create: failed to increment item counter", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to create work item")
		return
	}

	var wi WorkItem
	err = h.db.QueryRow(r.Context(),
		`INSERT INTO work_items (project_id, epic_id, parent_id, type, title, description,
			priority, assignee_id, story_points, labels, order_index, created_by, item_number, source_test_result_id)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
		 RETURNING id, item_number, project_id, epic_id, parent_id, type, title, description,
			status, priority, assignee_id, story_points, labels, order_index,
			is_blocked, blocked_reason, source_test_result_id, created_by, created_at, updated_at`,
		projectID, body.EpicID, body.ParentID, body.Type, body.Title, body.Description,
		priority, body.AssigneeID, body.StoryPoints, labels, orderIndex, claims.UserID, itemNumber, body.SourceTestResultID,
	).Scan(
		&wi.ID, &wi.ItemNumber, &wi.ProjectID, &wi.EpicID, &wi.ParentID, &wi.Type, &wi.Title, &wi.Description,
		&wi.Status, &wi.Priority, &wi.AssigneeID, &wi.StoryPoints, &wi.Labels, &wi.OrderIndex,
		&wi.IsBlocked, &wi.BlockedReason, &wi.SourceTestResultID, &wi.CreatedBy, &wi.CreatedAt, &wi.UpdatedAt,
	)
	if err != nil {
		slog.Error("workitems.Create: insert failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to create work item")
		return
	}

	if wi.Labels == nil {
		wi.Labels = []string{}
	}

	writeJSON(w, http.StatusCreated, wi)
}

// Get returns a single work item by ID.
func (h *WorkItemHandlers) Get(w http.ResponseWriter, r *http.Request) {
	workItemID := chi.URLParam(r, "workItemID")
	if workItemID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "workItemID is required")
		return
	}

	var wi WorkItem
	err := h.db.QueryRow(r.Context(),
		`SELECT id, item_number, project_id, epic_id, parent_id, type, title, description,
			status, priority, assignee_id, story_points, labels, order_index,
			is_blocked, blocked_reason, source_test_result_id, created_by, created_at, updated_at
		 FROM work_items WHERE id = $1`, workItemID,
	).Scan(
		&wi.ID, &wi.ItemNumber, &wi.ProjectID, &wi.EpicID, &wi.ParentID, &wi.Type, &wi.Title, &wi.Description,
		&wi.Status, &wi.Priority, &wi.AssigneeID, &wi.StoryPoints, &wi.Labels, &wi.OrderIndex,
		&wi.IsBlocked, &wi.BlockedReason, &wi.SourceTestResultID, &wi.CreatedBy, &wi.CreatedAt, &wi.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "Work item not found")
			return
		}
		slog.Error("workitems.Get: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to get work item")
		return
	}

	if wi.Labels == nil {
		wi.Labels = []string{}
	}

	writeJSON(w, http.StatusOK, wi)
}

// updateWorkItemRequest is the JSON body for patching a work item.
type updateWorkItemRequest struct {
	Title         *string          `json:"title"`
	Description   *json.RawMessage `json:"description"`
	Type          *string          `json:"type"`
	Status        *string          `json:"status"`
	Priority      *string          `json:"priority"`
	EpicID        *string          `json:"epic_id"`
	ParentID      *string          `json:"parent_id"`
	AssigneeID    *string          `json:"assignee_id"`
	StoryPoints   *int             `json:"story_points"`
	Labels        *[]string        `json:"labels"`
	OrderIndex    *float64         `json:"order_index"`
	IsBlocked     *bool            `json:"is_blocked"`
	BlockedReason *string          `json:"blocked_reason"`
}

// Update patches a work item by ID using dynamic SET clause.
func (h *WorkItemHandlers) Update(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFromContext(r.Context())
	workItemID := chi.URLParam(r, "workItemID")
	if workItemID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "workItemID is required")
		return
	}

	var body updateWorkItemRequest
	if !readJSON(w, r, &body) {
		return
	}

	fields := []string{}
	args := []any{}
	argN := 1

	if body.Title != nil {
		fields = append(fields, fmt.Sprintf("title = $%d", argN))
		args = append(args, *body.Title)
		argN++
	}
	if body.Description != nil {
		fields = append(fields, fmt.Sprintf("description = $%d", argN))
		args = append(args, *body.Description)
		argN++
	}
	if body.Type != nil {
		fields = append(fields, fmt.Sprintf("type = $%d", argN))
		args = append(args, *body.Type)
		argN++
	}
	if body.Status != nil {
		fields = append(fields, fmt.Sprintf("status = $%d", argN))
		args = append(args, *body.Status)
		argN++
	}
	if body.Priority != nil {
		fields = append(fields, fmt.Sprintf("priority = $%d", argN))
		args = append(args, *body.Priority)
		argN++
	}
	if body.EpicID != nil {
		fields = append(fields, fmt.Sprintf("epic_id = $%d", argN))
		args = append(args, *body.EpicID)
		argN++
	}
	if body.ParentID != nil {
		fields = append(fields, fmt.Sprintf("parent_id = $%d", argN))
		args = append(args, *body.ParentID)
		argN++
	}
	if body.AssigneeID != nil {
		fields = append(fields, fmt.Sprintf("assignee_id = $%d", argN))
		args = append(args, *body.AssigneeID)
		argN++
	}
	if body.StoryPoints != nil {
		fields = append(fields, fmt.Sprintf("story_points = $%d", argN))
		args = append(args, *body.StoryPoints)
		argN++
	}
	if body.Labels != nil {
		fields = append(fields, fmt.Sprintf("labels = $%d", argN))
		args = append(args, *body.Labels)
		argN++
	}
	if body.OrderIndex != nil {
		fields = append(fields, fmt.Sprintf("order_index = $%d", argN))
		args = append(args, *body.OrderIndex)
		argN++
	}
	if body.IsBlocked != nil {
		fields = append(fields, fmt.Sprintf("is_blocked = $%d", argN))
		args = append(args, *body.IsBlocked)
		argN++
	}
	if body.BlockedReason != nil {
		fields = append(fields, fmt.Sprintf("blocked_reason = $%d", argN))
		args = append(args, *body.BlockedReason)
		argN++
	}

	if len(fields) == 0 {
		writeError(w, http.StatusBadRequest, "validation_error", "No fields to update")
		return
	}

	// Capture old status (and QE gate fields) before update.
	var oldStatus string
	if body.Status != nil {
		var assigneeID *string
		var parentID *string
		var jobRole string
		err := h.db.QueryRow(r.Context(),
			`SELECT w.status, w.assignee_id, w.parent_id, COALESCE(pm.job_role, '')
			 FROM work_items w
			 LEFT JOIN project_members pm ON pm.id = w.assignee_id
			 WHERE w.id = $1`, workItemID,
		).Scan(&oldStatus, &assigneeID, &parentID, &jobRole)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			slog.Error("workitems.Update: pre-check query failed", "error", err)
		}

		// QE status gate: QE-assigned items require linked test results that all pass before moving to Done.
		if *body.Status == "done" {
			var totalResults, failedResults int
			_ = h.db.QueryRow(r.Context(),
				`SELECT
					COUNT(*),
					COUNT(*) FILTER (WHERE status IN ('fail', 'error'))
				 FROM test_results
				 WHERE work_item_id = $1
				    OR ($2::uuid IS NOT NULL AND work_item_id = $2)`,
				workItemID, parentID,
			).Scan(&totalResults, &failedResults)

			if code, msg := qeGateCheck(jobRole, totalResults, failedResults); code != "" {
				writeError(w, http.StatusUnprocessableEntity, code, msg)
				return
			}
		}
	}

	// Always update updated_at.
	fields = append(fields, "updated_at = NOW()")

	args = append(args, workItemID)
	query := fmt.Sprintf(
		`UPDATE work_items SET %s WHERE id = $%d
		 RETURNING id, item_number, project_id, epic_id, parent_id, type, title, description,
			status, priority, assignee_id, story_points, labels, order_index,
			is_blocked, blocked_reason, source_test_result_id, created_by, created_at, updated_at`,
		strings.Join(fields, ", "), argN,
	)

	var wi WorkItem
	err := h.db.QueryRow(r.Context(), query, args...).Scan(
		&wi.ID, &wi.ItemNumber, &wi.ProjectID, &wi.EpicID, &wi.ParentID, &wi.Type, &wi.Title, &wi.Description,
		&wi.Status, &wi.Priority, &wi.AssigneeID, &wi.StoryPoints, &wi.Labels, &wi.OrderIndex,
		&wi.IsBlocked, &wi.BlockedReason, &wi.SourceTestResultID, &wi.CreatedBy, &wi.CreatedAt, &wi.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "Work item not found")
			return
		}
		slog.Error("workitems.Update: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to update work item")
		return
	}

	if wi.Labels == nil {
		wi.Labels = []string{}
	}

	// Log status change for burndown tracking.
	if body.Status != nil && *body.Status != oldStatus {
		var sprintID *string
		_ = h.db.QueryRow(r.Context(),
			`SELECT sprint_id FROM sprint_items WHERE work_item_id = $1 LIMIT 1`,
			workItemID).Scan(&sprintID)
		_, err := h.db.Exec(r.Context(),
			`INSERT INTO status_changes (work_item_id, sprint_id, old_status, new_status, points)
			 VALUES ($1, $2, $3, $4, $5)`,
			workItemID, sprintID, oldStatus, *body.Status, wi.StoryPoints)
		if err != nil {
			slog.Error("workitems.Update: failed to log status change", "error", err)
		}
		// Notify assignee of status change
		if wi.AssigneeID != nil {
			NotifyStatusChange(r.Context(), h.db, *wi.AssigneeID, wi.Title, *body.Status, claims.UserID, wi.ID)
		}
	}

	// Notify new assignee when assignment changes
	if body.AssigneeID != nil && wi.AssigneeID != nil {
		NotifyAssignee(r.Context(), h.db, *wi.AssigneeID, wi.Title, claims.UserID, wi.ID)
	}

	writeJSON(w, http.StatusOK, wi)
}

// Delete removes a work item by ID.
func (h *WorkItemHandlers) Delete(w http.ResponseWriter, r *http.Request) {
	workItemID := chi.URLParam(r, "workItemID")
	if workItemID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "workItemID is required")
		return
	}

	tag, err := h.db.Exec(r.Context(), `DELETE FROM work_items WHERE id = $1`, workItemID)
	if err != nil {
		slog.Error("workitems.Delete: exec failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to delete work item")
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "not_found", "Work item not found")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
