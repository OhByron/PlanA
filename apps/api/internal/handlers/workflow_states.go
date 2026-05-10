package handlers

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/OhByron/PlanA/internal/auth"
)

// WorkflowStateHandlers manages org-level workflow state definitions.
type WorkflowStateHandlers struct {
	db DBPOOL
}

func NewWorkflowStateHandlers(db DBPOOL) *WorkflowStateHandlers {
	return &WorkflowStateHandlers{db: db}
}

// ---------- Response types ----------

type WorkflowState struct {
	ID         string    `json:"id"`
	OrgID      string    `json:"org_id"`
	Name       string    `json:"name"`
	Slug       string    `json:"slug"`
	Color      string    `json:"color"`
	Position   int       `json:"position"`
	IsInitial  bool      `json:"is_initial"`
	IsTerminal bool      `json:"is_terminal"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// ---------- Helpers ----------

func (h *WorkflowStateHandlers) requireOrgAdmin(ctx context.Context, w http.ResponseWriter, orgID, userID string) bool {
	var role string
	err := h.db.QueryRow(ctx,
		`SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2`,
		orgID, userID).Scan(&role)
	if err != nil {
		writeError(w, http.StatusForbidden, "forbidden", "Access denied")
		return false
	}
	if role != "admin" {
		writeError(w, http.StatusForbidden, "forbidden", "Only org admins can manage workflow states")
		return false
	}
	return true
}

// ---------- List ----------

func (h *WorkflowStateHandlers) List(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "orgID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	if !requireOrgMember(r.Context(), h.db, w, orgID, claims.UserID) {
		return
	}

	rows, err := h.db.Query(r.Context(),
		`SELECT id, org_id, name, slug, color, position, is_initial, is_terminal, created_at, updated_at
		   FROM workflow_states WHERE org_id = $1 ORDER BY position`, orgID)
	if err != nil {
		slog.Error("workflow_states.List: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list workflow states")
		return
	}
	defer rows.Close()

	states := []WorkflowState{}
	for rows.Next() {
		var s WorkflowState
		if err := rows.Scan(&s.ID, &s.OrgID, &s.Name, &s.Slug, &s.Color, &s.Position,
			&s.IsInitial, &s.IsTerminal, &s.CreatedAt, &s.UpdatedAt); err != nil {
			slog.Error("workflow_states.List: scan failed", "error", err)
			continue
		}
		states = append(states, s)
	}
	writeJSON(w, http.StatusOK, states)
}

// ---------- Create ----------

type createWorkflowStateRequest struct {
	Name     string `json:"name"`
	Slug     string `json:"slug"`
	Color    string `json:"color"`
	Position int    `json:"position"`
}

func (h *WorkflowStateHandlers) Create(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "orgID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !h.requireOrgAdmin(r.Context(), w, orgID, claims.UserID) {
		return
	}

	var body createWorkflowStateRequest
	if !readJSON(w, r, &body) {
		return
	}

	if body.Name == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "name is required")
		return
	}
	if body.Slug == "" {
		body.Slug = slugify(body.Name)
	}
	if body.Color == "" {
		body.Color = "#6B7280"
	}

	// Shift existing states at or above the target position
	_, _ = h.db.Exec(r.Context(),
		`UPDATE workflow_states SET position = position + 1
		  WHERE org_id = $1 AND position >= $2`,
		orgID, body.Position)

	var s WorkflowState
	err := h.db.QueryRow(r.Context(),
		`INSERT INTO workflow_states (org_id, name, slug, color, position)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, org_id, name, slug, color, position, is_initial, is_terminal, created_at, updated_at`,
		orgID, body.Name, body.Slug, body.Color, body.Position,
	).Scan(&s.ID, &s.OrgID, &s.Name, &s.Slug, &s.Color, &s.Position,
		&s.IsInitial, &s.IsTerminal, &s.CreatedAt, &s.UpdatedAt)
	if err != nil {
		slog.Error("workflow_states.Create: insert failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to create workflow state")
		return
	}

	writeJSON(w, http.StatusCreated, s)
}

// ---------- Update ----------

type updateWorkflowStateRequest struct {
	Name  *string `json:"name"`
	Color *string `json:"color"`
}

func (h *WorkflowStateHandlers) Update(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "orgID")
	stateID := chi.URLParam(r, "stateID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !h.requireOrgAdmin(r.Context(), w, orgID, claims.UserID) {
		return
	}

	// Cannot modify initial/terminal state slugs
	var isInitial, isTerminal bool
	err := h.db.QueryRow(r.Context(),
		`SELECT is_initial, is_terminal FROM workflow_states WHERE id = $1 AND org_id = $2`,
		stateID, orgID).Scan(&isInitial, &isTerminal)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "Workflow state not found")
		return
	}

	var body updateWorkflowStateRequest
	if !readJSON(w, r, &body) {
		return
	}

	fields := []string{}
	args := []any{}
	argN := 1

	if body.Name != nil {
		if (isInitial || isTerminal) && *body.Name != "" {
			// Allow renaming display name but not slug for bookends
		}
		fields = append(fields, fmt.Sprintf("name = $%d", argN))
		args = append(args, *body.Name)
		argN++
	}
	if body.Color != nil {
		fields = append(fields, fmt.Sprintf("color = $%d", argN))
		args = append(args, *body.Color)
		argN++
	}

	if len(fields) == 0 {
		writeError(w, http.StatusBadRequest, "validation_error", "No fields to update")
		return
	}

	args = append(args, stateID, orgID)
	query := fmt.Sprintf(
		`UPDATE workflow_states SET %s WHERE id = $%d AND org_id = $%d
		 RETURNING id, org_id, name, slug, color, position, is_initial, is_terminal, created_at, updated_at`,
		joinFields(fields), argN, argN+1)

	var s WorkflowState
	err = h.db.QueryRow(r.Context(), query, args...).Scan(
		&s.ID, &s.OrgID, &s.Name, &s.Slug, &s.Color, &s.Position,
		&s.IsInitial, &s.IsTerminal, &s.CreatedAt, &s.UpdatedAt)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "Workflow state not found")
		return
	}
	writeJSON(w, http.StatusOK, s)
}

// ---------- Delete ----------

func (h *WorkflowStateHandlers) Delete(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "orgID")
	stateID := chi.URLParam(r, "stateID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !h.requireOrgAdmin(r.Context(), w, orgID, claims.UserID) {
		return
	}

	// Cannot delete initial or terminal states
	var isInitial, isTerminal bool
	err := h.db.QueryRow(r.Context(),
		`SELECT is_initial, is_terminal FROM workflow_states WHERE id = $1 AND org_id = $2`,
		stateID, orgID).Scan(&isInitial, &isTerminal)
	if err != nil {
		slog.Error("workflow_states.Delete: lookup failed", "error", err, "stateID", stateID, "orgID", orgID)
		writeError(w, http.StatusNotFound, "not_found", "Workflow state not found")
		return
	}
	if isInitial || isTerminal {
		writeError(w, http.StatusForbidden, "forbidden", "Cannot delete Backlog or Done states")
		return
	}

	// Check if any work items use this state
	var itemCount int
	_ = h.db.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM work_items WHERE workflow_state_id = $1`, stateID).Scan(&itemCount)
	if itemCount > 0 {
		writeError(w, http.StatusConflict, "in_use",
			fmt.Sprintf("Cannot delete: %d work item(s) are in this state. Reassign them first.", itemCount))
		return
	}

	// Get position before deleting
	var position int
	_ = h.db.QueryRow(r.Context(),
		`SELECT position FROM workflow_states WHERE id = $1`, stateID).Scan(&position)

	// Clear any project FK references to this state
	_, _ = h.db.Exec(r.Context(),
		`UPDATE projects SET pr_open_transition_state_id = NULL WHERE pr_open_transition_state_id = $1`, stateID)
	_, _ = h.db.Exec(r.Context(),
		`UPDATE projects SET pr_merge_transition_state_id = NULL WHERE pr_merge_transition_state_id = $1`, stateID)
	// Clear project workflow state subsets
	_, _ = h.db.Exec(r.Context(),
		`DELETE FROM project_workflow_states WHERE workflow_state_id = $1`, stateID)

	tag, err := h.db.Exec(r.Context(),
		`DELETE FROM workflow_states WHERE id = $1 AND org_id = $2`, stateID, orgID)
	if err != nil {
		slog.Error("workflow_states.Delete: exec failed", "error", err)
		writeError(w, http.StatusConflict, "delete_failed", fmt.Sprintf("Cannot delete: %v", err))
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "not_found", "Workflow state not found")
		return
	}

	// Close the gap in positions
	_, _ = h.db.Exec(r.Context(),
		`UPDATE workflow_states SET position = position - 1
		  WHERE org_id = $1 AND position > $2`, orgID, position)

	w.WriteHeader(http.StatusNoContent)
}

// ---------- Reorder ----------

type reorderRequest struct {
	StateIDs []string `json:"state_ids"`
}

func (h *WorkflowStateHandlers) Reorder(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "orgID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !h.requireOrgAdmin(r.Context(), w, orgID, claims.UserID) {
		return
	}

	var body reorderRequest
	if !readJSON(w, r, &body) {
		return
	}

	if len(body.StateIDs) < 2 {
		writeError(w, http.StatusBadRequest, "validation_error", "At least 2 states required")
		return
	}

	// Validate bookends: first must be initial, last must be terminal.
	// Surface DB errors as 500 rather than misreporting them as validation failures.
	var firstInitial, lastTerminal bool
	if err := h.db.QueryRow(r.Context(),
		`SELECT is_initial FROM workflow_states WHERE id = $1 AND org_id = $2`,
		body.StateIDs[0], orgID).Scan(&firstInitial); err != nil {
		slog.Error("workflow_states.Reorder: first-state lookup failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to validate workflow states")
		return
	}
	if err := h.db.QueryRow(r.Context(),
		`SELECT is_terminal FROM workflow_states WHERE id = $1 AND org_id = $2`,
		body.StateIDs[len(body.StateIDs)-1], orgID).Scan(&lastTerminal); err != nil {
		slog.Error("workflow_states.Reorder: last-state lookup failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to validate workflow states")
		return
	}

	if !firstInitial {
		writeError(w, http.StatusBadRequest, "validation_error", "First state must be Backlog (initial)")
		return
	}
	if !lastTerminal {
		writeError(w, http.StatusBadRequest, "validation_error", "Last state must be Done (terminal)")
		return
	}

	tx, err := h.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to start transaction")
		return
	}
	defer tx.Rollback(r.Context())

	// Temporarily set all positions to negative to avoid unique constraint violations
	_, err = tx.Exec(r.Context(),
		`UPDATE workflow_states SET position = -(position + 1000) WHERE org_id = $1`, orgID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to reorder")
		return
	}

	for i, stateID := range body.StateIDs {
		tag, err := tx.Exec(r.Context(),
			`UPDATE workflow_states SET position = $1 WHERE id = $2 AND org_id = $3`,
			i, stateID, orgID)
		if err != nil || tag.RowsAffected() == 0 {
			writeError(w, http.StatusBadRequest, "validation_error", fmt.Sprintf("State %s not found in this org", stateID))
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to commit reorder")
		return
	}

	// Return updated list
	h.List(w, r)
}

// ---------- Project workflow states ----------

// ProjectWorkflowStateHandlers manages which org states a project uses.
type ProjectWorkflowStateHandlers struct {
	db DBPOOL
}

func NewProjectWorkflowStateHandlers(db DBPOOL) *ProjectWorkflowStateHandlers {
	return &ProjectWorkflowStateHandlers{db: db}
}

// List returns the project's active workflow states.
// If the project has a custom subset, return those. Otherwise return all org states.
func (h *ProjectWorkflowStateHandlers) List(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	states, err := getProjectWorkflowStates(r.Context(), h.db, projectID)
	if err != nil {
		slog.Error("project_workflow.List: failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list workflow states")
		return
	}
	writeJSON(w, http.StatusOK, states)
}

// SetSubset replaces the project's state subset.
func (h *ProjectWorkflowStateHandlers) SetSubset(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}
	if !checkProjectAdmin(r.Context(), h.db, projectID, claims.UserID) {
		writeError(w, http.StatusForbidden, "forbidden", "Only project admins can configure workflow states")
		return
	}

	var body struct {
		StateIDs []string `json:"state_ids"`
	}
	if !readJSON(w, r, &body) {
		return
	}

	// Empty array means "inherit all org states"
	tx, err := h.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to start transaction")
		return
	}
	defer tx.Rollback(r.Context())

	_, _ = tx.Exec(r.Context(),
		`DELETE FROM project_workflow_states WHERE project_id = $1`, projectID)

	if len(body.StateIDs) > 0 {
		// Validate that initial and terminal states are included
		orgID, err := getOrgIDForProject(r.Context(), h.db, projectID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "db_error", "Failed to resolve org")
			return
		}

		var initialID, terminalID string
		_ = h.db.QueryRow(r.Context(),
			`SELECT id FROM workflow_states WHERE org_id = $1 AND is_initial = true`, orgID).Scan(&initialID)
		_ = h.db.QueryRow(r.Context(),
			`SELECT id FROM workflow_states WHERE org_id = $1 AND is_terminal = true`, orgID).Scan(&terminalID)

		hasInitial, hasTerminal := false, false
		for _, id := range body.StateIDs {
			if id == initialID {
				hasInitial = true
			}
			if id == terminalID {
				hasTerminal = true
			}
		}
		if !hasInitial || !hasTerminal {
			writeError(w, http.StatusBadRequest, "validation_error", "Subset must include Backlog and Done states")
			return
		}

		for i, stateID := range body.StateIDs {
			_, err := tx.Exec(r.Context(),
				`INSERT INTO project_workflow_states (project_id, workflow_state_id, position)
				 VALUES ($1, $2, $3)`, projectID, stateID, i)
			if err != nil {
				writeError(w, http.StatusBadRequest, "validation_error", "Invalid state ID: "+stateID)
				return
			}
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to save subset")
		return
	}

	// Return updated list
	h.List(w, r)
}

// ---------- Shared helpers (used by other handlers) ----------

// getProjectWorkflowStates returns the workflow states for a project.
// If the project has a custom subset, returns those. Otherwise returns all org states.
func getProjectWorkflowStates(ctx interface {
	Value(any) any
	Deadline() (time.Time, bool)
	Done() <-chan struct{}
	Err() error
}, db DBPOOL, projectID string) ([]WorkflowState, error) {
	// Check for custom subset first
	rows, err := db.Query(ctx,
		`SELECT ws.id, ws.org_id, ws.name, ws.slug, ws.color, pws.position,
		        ws.is_initial, ws.is_terminal, ws.created_at, ws.updated_at
		   FROM project_workflow_states pws
		   JOIN workflow_states ws ON ws.id = pws.workflow_state_id
		  WHERE pws.project_id = $1
		  ORDER BY pws.position`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var states []WorkflowState
	for rows.Next() {
		var s WorkflowState
		if err := rows.Scan(&s.ID, &s.OrgID, &s.Name, &s.Slug, &s.Color, &s.Position,
			&s.IsInitial, &s.IsTerminal, &s.CreatedAt, &s.UpdatedAt); err != nil {
			return nil, err
		}
		states = append(states, s)
	}

	if len(states) > 0 {
		return states, nil
	}

	// Fall back to all org states
	orgID, err := getOrgIDForProject(ctx, db, projectID)
	if err != nil {
		return nil, err
	}

	rows2, err := db.Query(ctx,
		`SELECT id, org_id, name, slug, color, position, is_initial, is_terminal, created_at, updated_at
		   FROM workflow_states WHERE org_id = $1 ORDER BY position`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows2.Close()

	for rows2.Next() {
		var s WorkflowState
		if err := rows2.Scan(&s.ID, &s.OrgID, &s.Name, &s.Slug, &s.Color, &s.Position,
			&s.IsInitial, &s.IsTerminal, &s.CreatedAt, &s.UpdatedAt); err != nil {
			return nil, err
		}
		states = append(states, s)
	}
	return states, nil
}

// getOrgIDForProject resolves the org ID from a project via the teams table.
func getOrgIDForProject(ctx interface {
	Value(any) any
	Deadline() (time.Time, bool)
	Done() <-chan struct{}
	Err() error
}, db DBPOOL, projectID string) (string, error) {
	var orgID string
	err := db.QueryRow(ctx,
		`SELECT t.organization_id FROM projects p JOIN teams t ON t.id = p.team_id WHERE p.id = $1`,
		projectID).Scan(&orgID)
	if err != nil {
		return "", fmt.Errorf("resolve org for project %s: %w", projectID, err)
	}
	return orgID, nil
}

// getTerminalStateID returns the terminal (Done) state ID for an org.
func getTerminalStateID(ctx interface {
	Value(any) any
	Deadline() (time.Time, bool)
	Done() <-chan struct{}
	Err() error
}, db DBPOOL, orgID string) (string, error) {
	var id string
	err := db.QueryRow(ctx,
		`SELECT id FROM workflow_states WHERE org_id = $1 AND is_terminal = true`, orgID).Scan(&id)
	return id, err
}

// getInitialStateID returns the initial (Backlog) state ID for an org.
func getInitialStateID(ctx interface {
	Value(any) any
	Deadline() (time.Time, bool)
	Done() <-chan struct{}
	Err() error
}, db DBPOOL, orgID string) (string, error) {
	var id string
	err := db.QueryRow(ctx,
		`SELECT id FROM workflow_states WHERE org_id = $1 AND is_initial = true`, orgID).Scan(&id)
	return id, err
}

// joinFields is a helper to join SQL SET fields.
func joinFields(fields []string) string {
	result := ""
	for i, f := range fields {
		if i > 0 {
			result += ", "
		}
		result += f
	}
	return result
}
