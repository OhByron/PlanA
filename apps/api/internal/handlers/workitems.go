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

	"github.com/OhByron/PlanA/internal/auth"
)

// WorkItem represents a work_items row returned to clients.
type WorkItem struct {
	ID              string          `json:"id"`
	ItemNumber      *int            `json:"item_number"`
	ProjectID       string          `json:"project_id"`
	EpicID          *string         `json:"epic_id"`
	ParentID        *string         `json:"parent_id"`
	Type            string          `json:"type"`
	Title           string          `json:"title"`
	Description     json.RawMessage `json:"description"`
	WorkflowStateID string          `json:"workflow_state_id"`
	IsCancelled     bool            `json:"is_cancelled"`
	// Embedded state info (populated via JOIN)
	StateName          string          `json:"state_name"`
	StateSlug          string          `json:"state_slug"`
	StateColor         string          `json:"state_color"`
	StatePosition      int             `json:"state_position"`
	StateIsTerminal    bool            `json:"state_is_terminal"`
	StateIsInitial     bool            `json:"state_is_initial"`
	Priority           string          `json:"priority"`
	AssigneeID         *string         `json:"assignee_id"`
	StoryPoints        *int            `json:"story_points"`
	PointsUsed         *int            `json:"points_used"`
	Labels             []string        `json:"labels"`
	OrderIndex         float64         `json:"order_index"`
	StartDate          *time.Time      `json:"start_date"`
	DueDate            *time.Time      `json:"due_date"`
	TargetDate         *time.Time      `json:"target_date"`
	PreConditions      json.RawMessage `json:"pre_conditions"`
	PostConditions     json.RawMessage `json:"post_conditions"`
	DesignReady        bool            `json:"design_ready"`
	DesignLink         *string         `json:"design_link"`
	IsBlocked          bool            `json:"is_blocked"`
	BlockedReason      *string         `json:"blocked_reason"`
	SourceTestResultID *string         `json:"source_test_result_id"`
	CreatedBy          string          `json:"created_by"`
	CreatedAt          time.Time       `json:"created_at"`
	UpdatedAt          time.Time       `json:"updated_at"`
}

// workItemColumns is the SELECT column list for work items with state JOIN.
const workItemColumns = `wi.id, wi.item_number, wi.project_id, wi.epic_id, wi.parent_id, wi.type, wi.title, wi.description,
	wi.workflow_state_id, wi.is_cancelled,
	ws.name, ws.slug, ws.color, ws.position, ws.is_terminal, ws.is_initial,
	wi.priority, wi.assignee_id, wi.story_points, wi.points_used, wi.labels, wi.order_index,
	wi.start_date, wi.due_date, wi.target_date, wi.pre_conditions, wi.post_conditions,
	wi.design_ready, wi.design_link, wi.is_blocked, wi.blocked_reason,
	wi.source_test_result_id, wi.created_by, wi.created_at, wi.updated_at`

// scanWorkItem scans a work item row with embedded state info.
func scanWorkItem(row interface{ Scan(dest ...any) error }) (WorkItem, error) {
	var wi WorkItem
	err := row.Scan(
		&wi.ID, &wi.ItemNumber, &wi.ProjectID, &wi.EpicID, &wi.ParentID, &wi.Type, &wi.Title, &wi.Description,
		&wi.WorkflowStateID, &wi.IsCancelled,
		&wi.StateName, &wi.StateSlug, &wi.StateColor, &wi.StatePosition, &wi.StateIsTerminal, &wi.StateIsInitial,
		&wi.Priority, &wi.AssigneeID, &wi.StoryPoints, &wi.PointsUsed, &wi.Labels, &wi.OrderIndex,
		&wi.StartDate, &wi.DueDate, &wi.TargetDate, &wi.PreConditions, &wi.PostConditions,
		&wi.DesignReady, &wi.DesignLink, &wi.IsBlocked, &wi.BlockedReason,
		&wi.SourceTestResultID, &wi.CreatedBy, &wi.CreatedAt, &wi.UpdatedAt,
	)
	if wi.Labels == nil {
		wi.Labels = []string{}
	}
	return wi, err
}

// WorkItemHandlers handles CRUD for stories, bugs, and tasks within a project.
type WorkItemHandlers struct {
	db      DBPOOL
	publish EventPublishFunc
}

func NewWorkItemHandlers(db DBPOOL, publish EventPublishFunc) *WorkItemHandlers {
	return &WorkItemHandlers{db: db, publish: publish}
}

// getWorkItem fetches a single work item with its workflow state info via JOIN.
func (h *WorkItemHandlers) getWorkItem(ctx interface {
	Value(any) any
	Deadline() (time.Time, bool)
	Done() <-chan struct{}
	Err() error
}, id string) (WorkItem, error) {
	row := h.db.QueryRow(ctx,
		fmt.Sprintf(`SELECT %s FROM work_items wi
		 JOIN workflow_states ws ON ws.id = wi.workflow_state_id
		 WHERE wi.id = $1`, workItemColumns), id)
	return scanWorkItem(row)
}

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

	where := "WHERE wi.project_id = $1"
	args := []any{projectID}
	argN := 2

	if v := r.URL.Query().Get("type"); v != "" {
		where += fmt.Sprintf(" AND wi.type = $%d", argN)
		args = append(args, v)
		argN++
	}
	if v := r.URL.Query().Get("status"); v != "" {
		// Support filtering by state slug for backwards compatibility
		where += fmt.Sprintf(" AND wi.workflow_state_id IN (SELECT id FROM workflow_states WHERE slug = $%d)", argN)
		args = append(args, v)
		argN++
	}
	if v := r.URL.Query().Get("workflow_state_id"); v != "" {
		where += fmt.Sprintf(" AND wi.workflow_state_id = $%d", argN)
		args = append(args, v)
		argN++
	}
	if v := r.URL.Query().Get("epic_id"); v != "" {
		where += fmt.Sprintf(" AND wi.epic_id = $%d", argN)
		args = append(args, v)
		argN++
	}
	if v := r.URL.Query().Get("assignee_id"); v != "" {
		where += fmt.Sprintf(" AND wi.assignee_id = $%d", argN)
		args = append(args, v)
		argN++
	}

	// Count total matching rows.
	var total int
	err := h.db.QueryRow(r.Context(),
		"SELECT COUNT(*) FROM work_items wi JOIN workflow_states ws ON ws.id = wi.workflow_state_id "+where, args...).Scan(&total)
	if err != nil {
		slog.Error("workitems.List: count query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list work items")
		return
	}

	query := fmt.Sprintf(`SELECT %s
		FROM work_items wi JOIN workflow_states ws ON ws.id = wi.workflow_state_id
		%s ORDER BY wi.order_index, wi.created_at LIMIT $%d OFFSET $%d`,
		workItemColumns, where, argN, argN+1)
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
		wi, err := scanWorkItem(rows)
		if err != nil {
			slog.Error("workitems.List: scan failed", "error", err)
			writeError(w, http.StatusInternalServerError, "db_error", "Failed to read work item row")
			return
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
	StartDate          *string         `json:"start_date"`
	DueDate            *string         `json:"due_date"`
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
	var inheritedStartDate, inheritedDueDate *time.Time
	if epicID == nil || *epicID == "" {
		if body.ParentID != nil && *body.ParentID != "" {
			// Inherit epic and dates from parent
			var parentEpicID *string
			h.db.QueryRow(r.Context(),
				`SELECT epic_id, start_date, due_date FROM work_items WHERE id = $1`, *body.ParentID,
			).Scan(&parentEpicID, &inheritedStartDate, &inheritedDueDate)
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

	// Resolve dates: explicit request > inherited from parent > nil
	var startDate, dueDate *time.Time
	if body.StartDate != nil && *body.StartDate != "" {
		t, _ := time.Parse("2006-01-02", *body.StartDate)
		startDate = &t
	} else {
		startDate = inheritedStartDate
	}
	if body.DueDate != nil && *body.DueDate != "" {
		t, _ := time.Parse("2006-01-02", *body.DueDate)
		dueDate = &t
	} else {
		dueDate = inheritedDueDate
	}

	// Resolve the initial (backlog) state for this project's org
	orgID, err := getOrgIDForProject(r.Context(), h.db, projectID)
	if err != nil {
		slog.Error("workitems.Create: failed to resolve org", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to create work item")
		return
	}
	initialStateID, err := getInitialStateID(r.Context(), h.db, orgID)
	if err != nil {
		slog.Error("workitems.Create: failed to resolve initial state", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to create work item")
		return
	}

	var insertedID string
	err = h.db.QueryRow(r.Context(),
		`INSERT INTO work_items (project_id, epic_id, parent_id, type, title, description,
			workflow_state_id, priority, assignee_id, story_points, labels, order_index,
			start_date, due_date, created_by, item_number, source_test_result_id)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
		 RETURNING id`,
		projectID, epicID, body.ParentID, body.Type, body.Title, body.Description,
		initialStateID, priority, body.AssigneeID, body.StoryPoints, labels, orderIndex,
		startDate, dueDate, claims.UserID, itemNumber, body.SourceTestResultID,
	).Scan(&insertedID)
	if err != nil {
		slog.Error("workitems.Create: insert failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to create work item")
		return
	}

	// Re-fetch with JOIN to get state info
	wi, err := h.getWorkItem(r.Context(), insertedID)
	if err != nil {
		slog.Error("workitems.Create: re-fetch failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to create work item")
		return
	}

	writeJSON(w, http.StatusCreated, wi)

	if h.publish != nil {
		h.publish("project:"+projectID, "work_item.created", map[string]string{
			"id": wi.ID, "project_id": projectID, "actor_id": claims.UserID,
		})
	}
	wiID := wi.ID
	LogActivity(r.Context(), h.db, projectID, &wiID, nil, nil, claims.UserID, "work_item.created", map[string]any{
		"title": wi.Title, "type": wi.Type,
	})
}

// Get returns a single work item by ID.
func (h *WorkItemHandlers) Get(w http.ResponseWriter, r *http.Request) {
	workItemID := chi.URLParam(r, "workItemID")
	if workItemID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "workItemID is required")
		return
	}

	wi, err := h.getWorkItem(r.Context(), workItemID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "Work item not found")
			return
		}
		slog.Error("workitems.Get: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to get work item")
		return
	}

	writeJSON(w, http.StatusOK, wi)
}

// updateWorkItemRequest is the JSON body for patching a work item.
type updateWorkItemRequest struct {
	Title           *string          `json:"title"`
	Description     *json.RawMessage `json:"description"`
	Type            *string          `json:"type"`
	WorkflowStateID *string          `json:"workflow_state_id"`
	IsCancelled     *bool            `json:"is_cancelled"`
	Priority        *string          `json:"priority"`
	EpicID          *string          `json:"epic_id"`
	ParentID        *string          `json:"parent_id"`
	AssigneeID      *string          `json:"assignee_id"`
	StoryPoints     *int             `json:"story_points"`
	PointsUsed      *int             `json:"points_used"`
	Labels          *[]string        `json:"labels"`
	OrderIndex      *float64         `json:"order_index"`
	StartDate       *string          `json:"start_date"`
	DueDate         *string          `json:"due_date"`
	TargetDate      *string          `json:"target_date"`
	PreConditions   *json.RawMessage `json:"pre_conditions"`
	PostConditions  *json.RawMessage `json:"post_conditions"`
	DesignReady     *bool            `json:"design_ready"`
	DesignLink      *string          `json:"design_link"`
	IsBlocked       *bool            `json:"is_blocked"`
	BlockedReason   *string          `json:"blocked_reason"`
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
	if body.WorkflowStateID != nil {
		fields = append(fields, fmt.Sprintf("workflow_state_id = $%d", argN))
		args = append(args, *body.WorkflowStateID)
		argN++
	}
	if body.IsCancelled != nil {
		fields = append(fields, fmt.Sprintf("is_cancelled = $%d", argN))
		args = append(args, *body.IsCancelled)
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
	if body.StartDate != nil {
		if *body.StartDate == "" {
			fields = append(fields, "start_date = NULL")
		} else {
			t, err := time.Parse("2006-01-02", *body.StartDate)
			if err != nil {
				writeError(w, http.StatusBadRequest, "validation_error", "start_date must be YYYY-MM-DD")
				return
			}
			fields = append(fields, fmt.Sprintf("start_date = $%d", argN))
			args = append(args, t)
			argN++
		}
	}
	if body.DueDate != nil {
		if *body.DueDate == "" {
			fields = append(fields, "due_date = NULL")
		} else {
			t, err := time.Parse("2006-01-02", *body.DueDate)
			if err != nil {
				writeError(w, http.StatusBadRequest, "validation_error", "due_date must be YYYY-MM-DD")
				return
			}
			fields = append(fields, fmt.Sprintf("due_date = $%d", argN))
			args = append(args, t)
			argN++
		}
	}
	if body.TargetDate != nil {
		if *body.TargetDate == "" {
			fields = append(fields, "target_date = NULL")
		} else {
			t, err := time.Parse("2006-01-02", *body.TargetDate)
			if err != nil {
				writeError(w, http.StatusBadRequest, "validation_error", "target_date must be YYYY-MM-DD")
				return
			}
			fields = append(fields, fmt.Sprintf("target_date = $%d", argN))
			args = append(args, t)
			argN++
		}
	}
	if body.PreConditions != nil {
		fields = append(fields, fmt.Sprintf("pre_conditions = $%d", argN))
		args = append(args, *body.PreConditions)
		argN++
	}
	if body.PostConditions != nil {
		fields = append(fields, fmt.Sprintf("post_conditions = $%d", argN))
		args = append(args, *body.PostConditions)
		argN++
	}
	if body.DesignReady != nil {
		fields = append(fields, fmt.Sprintf("design_ready = $%d", argN))
		args = append(args, *body.DesignReady)
		argN++
	}
	if body.DesignLink != nil {
		fields = append(fields, fmt.Sprintf("design_link = $%d", argN))
		args = append(args, *body.DesignLink)
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

	// Capture old state before update for transition logic.
	var oldStateID string
	var oldIsTerminal bool
	if body.WorkflowStateID != nil {
		var assigneeID *string
		var parentID *string
		var jobRole string
		err := h.db.QueryRow(r.Context(),
			`SELECT w.workflow_state_id, ws.is_terminal, w.assignee_id, w.parent_id, COALESCE(pm.job_role, '')
			 FROM work_items w
			 JOIN workflow_states ws ON ws.id = w.workflow_state_id
			 LEFT JOIN project_members pm ON pm.id = w.assignee_id
			 WHERE w.id = $1`, workItemID,
		).Scan(&oldStateID, &oldIsTerminal, &assigneeID, &parentID, &jobRole)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			slog.Error("workitems.Update: pre-check query failed", "error", err)
		}

		// Check if the target state is terminal (done)
		var targetIsTerminal bool
		_ = h.db.QueryRow(r.Context(),
			`SELECT is_terminal FROM workflow_states WHERE id = $1`, *body.WorkflowStateID,
		).Scan(&targetIsTerminal)

		// Story completion gate: a story with child tasks cannot be moved to terminal
		// if any child task is not terminal/cancelled.
		if targetIsTerminal {
			var itemType string
			h.db.QueryRow(r.Context(), `SELECT type FROM work_items WHERE id = $1`, workItemID).Scan(&itemType)
			if itemType == "story" {
				var incompleteChildren int
				if err := h.db.QueryRow(r.Context(),
					`SELECT COUNT(*) FROM work_items wi2
					 JOIN workflow_states ws2 ON ws2.id = wi2.workflow_state_id
					 WHERE wi2.parent_id = $1 AND wi2.is_cancelled = FALSE AND ws2.is_terminal = FALSE`,
					workItemID).Scan(&incompleteChildren); err != nil {
					slog.Warn("workitems.Update: child-check query failed", "error", err)
				}
				if incompleteChildren > 0 {
					writeError(w, http.StatusUnprocessableEntity, "incomplete_subtasks",
						fmt.Sprintf("Cannot mark story as done - %d subtask(s) still incomplete", incompleteChildren))
					return
				}
			}
		}

		// QE status gate: QE-assigned items require linked test results that all pass before moving to terminal.
		if targetIsTerminal {
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
		`UPDATE work_items SET %s WHERE id = $%d RETURNING id`,
		strings.Join(fields, ", "), argN,
	)

	var updatedID string
	err := h.db.QueryRow(r.Context(), query, args...).Scan(&updatedID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "Work item not found")
			return
		}
		slog.Error("workitems.Update: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to update work item")
		return
	}

	// Re-fetch with JOIN to get full state info
	wi, err := h.getWorkItem(r.Context(), updatedID)
	if err != nil {
		slog.Error("workitems.Update: re-fetch failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to update work item")
		return
	}

	// Record state transition for burndown and fire hooks.
	if body.WorkflowStateID != nil && *body.WorkflowStateID != oldStateID {
		var sprintID *string
		if err := h.db.QueryRow(r.Context(),
			`SELECT sprint_id FROM sprint_items WHERE work_item_id = $1 LIMIT 1`,
			workItemID).Scan(&sprintID); err != nil && !errors.Is(err, pgx.ErrNoRows) {
			slog.Warn("workitems.Update: sprint lookup for status-change log failed", "error", err)
		}
		statusChangePoints := wi.StoryPoints
		if wi.StateIsTerminal && wi.PointsUsed != nil {
			statusChangePoints = wi.PointsUsed
		}
		_, err := h.db.Exec(r.Context(),
			`INSERT INTO status_changes (work_item_id, sprint_id, old_state_id, new_state_id, points)
			 VALUES ($1, $2, $3, $4, $5)`,
			workItemID, sprintID, oldStateID, *body.WorkflowStateID, statusChangePoints)
		if err != nil {
			slog.Error("workitems.Update: failed to log status change", "error", err)
		}

		// Notify assignee of state change
		if wi.AssigneeID != nil {
			NotifyStatusChange(r.Context(), h.db, h.publish, *wi.AssigneeID, wi.Title, wi.StateName, claims.UserID, wi.ID)
		}

		// Fire transition hooks for the new state
		h.fireTransitionHooks(r.Context(), wi.WorkflowStateID, workItemID, projectID)

		// Auto-promote parent story: when a task moves to terminal, check if all
		// sibling tasks under the same parent are now terminal/cancelled.
		if wi.StateIsTerminal && wi.ParentID != nil {
			h.autoPromoteParent(r.Context(), *wi.ParentID, workItemID)
		}
	}

	// Notify new assignee when assignment changes
	if body.AssigneeID != nil && wi.AssigneeID != nil {
		NotifyAssignee(r.Context(), h.db, h.publish, *wi.AssigneeID, wi.Title, claims.UserID, wi.ID)
	}

	writeJSON(w, http.StatusOK, wi)

	if h.publish != nil {
		h.publish("project:"+wi.ProjectID, "work_item.updated", map[string]string{
			"id": wi.ID, "project_id": wi.ProjectID, "actor_id": claims.UserID,
		})
	}

	// Log activity with changed fields
	activityChanges := map[string]any{"title": wi.Title}
	if body.WorkflowStateID != nil {
		activityChanges["state"] = map[string]any{"old": oldStateID, "new": *body.WorkflowStateID, "name": wi.StateName}
	}
	if body.AssigneeID != nil {
		activityChanges["assignee"] = map[string]any{"new": *body.AssigneeID}
	}
	if body.Priority != nil {
		activityChanges["priority"] = map[string]any{"new": *body.Priority}
	}
	if body.StoryPoints != nil {
		activityChanges["story_points"] = map[string]any{"new": *body.StoryPoints}
	}
	if body.IsCancelled != nil {
		activityChanges["is_cancelled"] = map[string]any{"new": *body.IsCancelled}
	}
	wiID := wi.ID
	LogActivity(r.Context(), h.db, wi.ProjectID, &wiID, nil, nil, claims.UserID, "work_item.updated", activityChanges)
}

// fireTransitionHooks executes any hooks configured for the given state.
func (h *WorkItemHandlers) fireTransitionHooks(ctx interface {
	Value(any) any
	Deadline() (time.Time, bool)
	Done() <-chan struct{}
	Err() error
}, stateID, workItemID, projectID string) {
	rows, err := h.db.Query(ctx,
		`SELECT config FROM workflow_transition_hooks WHERE trigger_state_id = $1 AND action_type = 'notify_role'`,
		stateID)
	if err != nil {
		return
	}
	defer rows.Close()

	for rows.Next() {
		var configBytes []byte
		if err := rows.Scan(&configBytes); err != nil {
			continue
		}
		var config struct {
			Role string `json:"role"`
		}
		if err := json.Unmarshal(configBytes, &config); err != nil || config.Role == "" {
			continue
		}

		// Find project members with the matching role and notify them
		memberRows, err := h.db.Query(ctx,
			`SELECT user_id FROM project_members WHERE project_id = $1 AND job_role = $2`,
			projectID, config.Role)
		if err != nil {
			continue
		}

		var title string
		_ = h.db.QueryRow(ctx, `SELECT title FROM work_items WHERE id = $1`, workItemID).Scan(&title)

		for memberRows.Next() {
			var userID string
			if err := memberRows.Scan(&userID); err != nil {
				continue
			}
			_, _ = h.db.Exec(ctx,
				`INSERT INTO notifications (user_id, type, message, work_item_id)
				 VALUES ($1, 'status_change', $2, $3)`,
				userID, fmt.Sprintf("Work item '%s' has entered a state requiring your attention.", title), workItemID)
		}
		memberRows.Close()
	}
}

// autoPromoteParent checks if all children of a parent are terminal/cancelled
// and promotes the parent to its org's terminal state if so.
func (h *WorkItemHandlers) autoPromoteParent(ctx interface {
	Value(any) any
	Deadline() (time.Time, bool)
	Done() <-chan struct{}
	Err() error
}, parentID, triggeredBy string) {
	var incompleteCount int
	if err := h.db.QueryRow(ctx,
		`SELECT COUNT(*) FROM work_items wi2
		 JOIN workflow_states ws2 ON ws2.id = wi2.workflow_state_id
		 WHERE wi2.parent_id = $1 AND wi2.id != $2
		   AND wi2.is_cancelled = FALSE AND ws2.is_terminal = FALSE`,
		parentID, triggeredBy,
	).Scan(&incompleteCount); err != nil {
		slog.Warn("workitems.autoPromoteParent: sibling-check failed", "error", err)
		return
	}
	if incompleteCount > 0 {
		return
	}

	// All siblings done - get the parent's org terminal state
	var parentStateID, parentProjectID string
	var parentIsTerminal, parentIsCancelled bool
	h.db.QueryRow(ctx,
		`SELECT workflow_state_id, project_id, is_cancelled FROM work_items WHERE id = $1`, parentID,
	).Scan(&parentStateID, &parentProjectID, &parentIsCancelled)

	if parentIsCancelled {
		return
	}

	_ = h.db.QueryRow(ctx,
		`SELECT ws.is_terminal FROM workflow_states ws WHERE ws.id = $1`, parentStateID,
	).Scan(&parentIsTerminal)
	if parentIsTerminal {
		return
	}

	orgID, err := getOrgIDForProject(ctx, h.db, parentProjectID)
	if err != nil {
		return
	}
	terminalID, err := getTerminalStateID(ctx, h.db, orgID)
	if err != nil {
		return
	}

	h.db.Exec(ctx,
		`UPDATE work_items SET workflow_state_id = $1, updated_at = NOW() WHERE id = $2`,
		terminalID, parentID)

	// Log the parent state change
	var parentSprintID *string
	h.db.QueryRow(ctx,
		`SELECT sprint_id FROM sprint_items WHERE work_item_id = $1 LIMIT 1`, parentID,
	).Scan(&parentSprintID)
	var parentPoints *int
	h.db.QueryRow(ctx,
		`SELECT story_points FROM work_items WHERE id = $1`, parentID,
	).Scan(&parentPoints)
	h.db.Exec(ctx,
		`INSERT INTO status_changes (work_item_id, sprint_id, old_state_id, new_state_id, points)
		 VALUES ($1, $2, $3, $4, $5)`,
		parentID, parentSprintID, parentStateID, terminalID, parentPoints)

	slog.Info("workitems.Update: auto-promoted parent to terminal state",
		"parentID", parentID, "triggeredBy", triggeredBy)
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

	if h.publish != nil {
		h.publish("project:"+projectID, "work_item.deleted", map[string]string{
			"id": workItemID, "project_id": projectID, "actor_id": claims.UserID,
		})
	}
	LogActivity(r.Context(), h.db, projectID, &workItemID, nil, nil, claims.UserID, "work_item.deleted", map[string]any{
		"id": workItemID,
	})
}
