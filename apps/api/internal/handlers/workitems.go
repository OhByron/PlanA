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
	PointsUsed    *int            `json:"points_used"`
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

// qeGateCheck enforces the QE workflow gate: items assigned to a QE role cannot
// close unless test results exist and all pass. This prevents premature closure
// before testing is complete.
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
		status, priority, assignee_id, story_points, points_used, labels, order_index,
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
			&wi.Status, &wi.Priority, &wi.AssigneeID, &wi.StoryPoints, &wi.PointsUsed, &wi.Labels, &wi.OrderIndex,
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
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
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

	// Item numbers are incremented in a separate UPDATE (not a DB sequence) so each
	// project has its own independent counter starting at 1 (e.g. PROJ-1, PROJ-2).
	var itemNumber int
	err := h.db.QueryRow(r.Context(),
		`UPDATE projects SET item_counter = item_counter + 1 WHERE id = $1 RETURNING item_counter`,
		projectID).Scan(&itemNumber)
	if err != nil {
		slog.Error("workitems.Create: failed to increment item counter", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to create work item")
		return
	}

	// If no epic_id provided, assign to the project's first epic (default epic).
	// If the item has a parent, inherit the parent's epic_id.
	epicID := body.EpicID
	if epicID == nil || *epicID == "" {
		if body.ParentID != nil && *body.ParentID != "" {
			// Inherit from parent
			var parentEpicID *string
			h.db.QueryRow(r.Context(),
				`SELECT epic_id FROM work_items WHERE id = $1`, *body.ParentID,
			).Scan(&parentEpicID)
			epicID = parentEpicID
		}
		if epicID == nil || *epicID == "" {
			// Fall back to the project's first (default) epic
			var defaultEpicID string
			if err := h.db.QueryRow(r.Context(),
				`SELECT id FROM epics WHERE project_id = $1 ORDER BY created_at LIMIT 1`,
				projectID).Scan(&defaultEpicID); err == nil {
				epicID = &defaultEpicID
			}
		}
	}

	var wi WorkItem
	err = h.db.QueryRow(r.Context(),
		`INSERT INTO work_items (project_id, epic_id, parent_id, type, title, description,
			priority, assignee_id, story_points, labels, order_index, created_by, item_number, source_test_result_id)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
		 RETURNING id, item_number, project_id, epic_id, parent_id, type, title, description,
			status, priority, assignee_id, story_points, points_used, labels, order_index,
			is_blocked, blocked_reason, source_test_result_id, created_by, created_at, updated_at`,
		projectID, epicID, body.ParentID, body.Type, body.Title, body.Description,
		priority, body.AssigneeID, body.StoryPoints, labels, orderIndex, claims.UserID, itemNumber, body.SourceTestResultID,
	).Scan(
		&wi.ID, &wi.ItemNumber, &wi.ProjectID, &wi.EpicID, &wi.ParentID, &wi.Type, &wi.Title, &wi.Description,
		&wi.Status, &wi.Priority, &wi.AssigneeID, &wi.StoryPoints, &wi.PointsUsed, &wi.Labels, &wi.OrderIndex,
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
			status, priority, assignee_id, story_points, points_used, labels, order_index,
			is_blocked, blocked_reason, source_test_result_id, created_by, created_at, updated_at
		 FROM work_items WHERE id = $1`, workItemID,
	).Scan(
		&wi.ID, &wi.ItemNumber, &wi.ProjectID, &wi.EpicID, &wi.ParentID, &wi.Type, &wi.Title, &wi.Description,
		&wi.Status, &wi.Priority, &wi.AssigneeID, &wi.StoryPoints, &wi.PointsUsed, &wi.Labels, &wi.OrderIndex,
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
	PointsUsed    *int             `json:"points_used"`
	Labels        *[]string        `json:"labels"`
	OrderIndex    *float64         `json:"order_index"`
	IsBlocked     *bool            `json:"is_blocked"`
	BlockedReason *string          `json:"blocked_reason"`
}

// Update patches a work item by ID using dynamic SET clause.
func (h *WorkItemHandlers) Update(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	workItemID := chi.URLParam(r, "workItemID")
	if workItemID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "workItemID is required")
		return
	}
	projectID := resolveProjectID(r.Context(), h.db, workItemID)
	if projectID == "" || !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
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
		if *body.EpicID == "" {
			fields = append(fields, fmt.Sprintf("epic_id = NULL"))
		} else {
			fields = append(fields, fmt.Sprintf("epic_id = $%d", argN))
			args = append(args, *body.EpicID)
			argN++
		}
	}
	if body.ParentID != nil {
		if *body.ParentID == "" {
			fields = append(fields, fmt.Sprintf("parent_id = NULL"))
		} else {
			fields = append(fields, fmt.Sprintf("parent_id = $%d", argN))
			args = append(args, *body.ParentID)
			argN++
		}
	}
	if body.AssigneeID != nil {
		if *body.AssigneeID == "" {
			fields = append(fields, fmt.Sprintf("assignee_id = NULL"))
		} else {
			fields = append(fields, fmt.Sprintf("assignee_id = $%d", argN))
			args = append(args, *body.AssigneeID)
			argN++
		}
	}
	if body.StoryPoints != nil {
		fields = append(fields, fmt.Sprintf("story_points = $%d", argN))
		args = append(args, *body.StoryPoints)
		argN++
	}
	if body.PointsUsed != nil {
		fields = append(fields, fmt.Sprintf("points_used = $%d", argN))
		args = append(args, *body.PointsUsed)
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

		// Story completion gate: a story with child tasks cannot be moved to "done"
		// manually if any child task is not done/cancelled.
		if *body.Status == "done" {
			var itemType string
			h.db.QueryRow(r.Context(), `SELECT type FROM work_items WHERE id = $1`, workItemID).Scan(&itemType)
			if itemType == "story" {
				var incompleteChildren int
				if err := h.db.QueryRow(r.Context(),
					`SELECT COUNT(*) FROM work_items
					 WHERE parent_id = $1 AND status NOT IN ('done', 'cancelled')`,
					workItemID).Scan(&incompleteChildren); err != nil {
					slog.Warn("workitems.Update: child-check query failed", "error", err)
				}
				if incompleteChildren > 0 {
					writeError(w, http.StatusUnprocessableEntity, "incomplete_subtasks",
						fmt.Sprintf("Cannot mark story as done — %d subtask(s) still incomplete", incompleteChildren))
					return
				}
			}
		}

		// QE status gate: QE-assigned items require linked test results that all pass before moving to Done.
		if *body.Status == "done" {
			var totalResults, failedResults int
			if err := h.db.QueryRow(r.Context(),
				`SELECT
					COUNT(*),
					COUNT(*) FILTER (WHERE status IN ('fail', 'error'))
				 FROM test_results
				 WHERE work_item_id = $1
				    OR ($2::uuid IS NOT NULL AND work_item_id = $2)`,
				workItemID, parentID,
			).Scan(&totalResults, &failedResults); err != nil {
				slog.Warn("workitems.Update: QE gate test-results query failed", "error", err)
			}

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
			status, priority, assignee_id, story_points, points_used, labels, order_index,
			is_blocked, blocked_reason, source_test_result_id, created_by, created_at, updated_at`,
		strings.Join(fields, ", "), argN,
	)

	var wi WorkItem
	err := h.db.QueryRow(r.Context(), query, args...).Scan(
		&wi.ID, &wi.ItemNumber, &wi.ProjectID, &wi.EpicID, &wi.ParentID, &wi.Type, &wi.Title, &wi.Description,
		&wi.Status, &wi.Priority, &wi.AssigneeID, &wi.StoryPoints, &wi.PointsUsed, &wi.Labels, &wi.OrderIndex,
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

	// Record each status transition with its point value so the burndown chart can
	// reconstruct remaining work per day without scanning the full work-item history.
	if body.Status != nil && *body.Status != oldStatus {
		var sprintID *string
		if err := h.db.QueryRow(r.Context(),
			`SELECT sprint_id FROM sprint_items WHERE work_item_id = $1 LIMIT 1`,
			workItemID).Scan(&sprintID); err != nil && !errors.Is(err, pgx.ErrNoRows) {
			slog.Warn("workitems.Update: sprint lookup for status-change log failed", "error", err)
		}
		// Use points_used (actual effort) when transitioning to done; otherwise use estimate.
		statusChangePoints := wi.StoryPoints
		if *body.Status == "done" && wi.PointsUsed != nil {
			statusChangePoints = wi.PointsUsed
		}
		_, err := h.db.Exec(r.Context(),
			`INSERT INTO status_changes (work_item_id, sprint_id, old_status, new_status, points)
			 VALUES ($1, $2, $3, $4, $5)`,
			workItemID, sprintID, oldStatus, *body.Status, statusChangePoints)
		if err != nil {
			slog.Error("workitems.Update: failed to log status change", "error", err)
		}
		// Notify assignee of status change
		if wi.AssigneeID != nil {
			NotifyStatusChange(r.Context(), h.db, *wi.AssigneeID, wi.Title, *body.Status, claims.UserID, wi.ID)
		}

		// Default points_used to story_points when moving to done (if not explicitly set)
		if *body.Status == "done" && wi.PointsUsed == nil && wi.StoryPoints != nil {
			h.db.Exec(r.Context(),
				`UPDATE work_items SET points_used = story_points WHERE id = $1 AND points_used IS NULL`,
				workItemID)
			wi.PointsUsed = wi.StoryPoints
		}

		// Auto-promote parent story: when a task moves to done, check if all
		// sibling tasks under the same parent are now done/cancelled. If so,
		// automatically move the parent story to done.
		if *body.Status == "done" && wi.ParentID != nil {
			var incompleteCount int
			if err := h.db.QueryRow(r.Context(),
				`SELECT COUNT(*) FROM work_items
				 WHERE parent_id = $1 AND id != $2 AND status NOT IN ('done', 'cancelled')`,
				*wi.ParentID, workItemID,
			).Scan(&incompleteCount); err != nil {
				slog.Warn("workitems.Update: sibling-check failed", "error", err)
			}
			if incompleteCount == 0 {
				// All siblings done — auto-promote the parent
				var parentStatus string
				h.db.QueryRow(r.Context(),
					`SELECT status FROM work_items WHERE id = $1`, *wi.ParentID,
				).Scan(&parentStatus)
				if parentStatus != "done" && parentStatus != "cancelled" {
					h.db.Exec(r.Context(),
						`UPDATE work_items SET status = 'done', updated_at = NOW(),
						 points_used = COALESCE(points_used, story_points)
						 WHERE id = $1`,
						*wi.ParentID)
					// Log the parent status change too
					var parentSprintID *string
					if err := h.db.QueryRow(r.Context(),
						`SELECT sprint_id FROM sprint_items WHERE work_item_id = $1 LIMIT 1`,
						*wi.ParentID).Scan(&parentSprintID); err != nil {
						// no sprint — that's fine
					}
					var parentPoints *int
					h.db.QueryRow(r.Context(),
						`SELECT story_points FROM work_items WHERE id = $1`, *wi.ParentID,
					).Scan(&parentPoints)
					h.db.Exec(r.Context(),
						`INSERT INTO status_changes (work_item_id, sprint_id, old_status, new_status, points)
						 VALUES ($1, $2, $3, 'done', $4)`,
						*wi.ParentID, parentSprintID, parentStatus, parentPoints)
					slog.Info("workitems.Update: auto-promoted parent story to done",
						"parentID", *wi.ParentID, "triggeredBy", workItemID)
				}
			}
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
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	workItemID := chi.URLParam(r, "workItemID")
	if workItemID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "workItemID is required")
		return
	}
	projectID := resolveProjectID(r.Context(), h.db, workItemID)
	if projectID == "" || !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
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
