package handlers

import (
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

const projectColumns = `id, team_id, name, slug, description, methodology,
	status, due_date, contact_name, contact_email, contact_phone,
	sprint_duration_weeks, default_project_months, default_epic_weeks,
	archived_at, retention_days, pr_open_transition_state_id, pr_merge_transition_state_id, created_at, updated_at`

const projectColumnsAliased = `p.id, p.team_id, p.name, p.slug, p.description, p.methodology,
	p.status, p.due_date, p.contact_name, p.contact_email, p.contact_phone,
	p.sprint_duration_weeks, p.default_project_months, p.default_epic_weeks,
	p.archived_at, p.retention_days, p.pr_open_transition_state_id, p.pr_merge_transition_state_id, p.created_at, p.updated_at`

// Project represents a project row returned to clients.
type Project struct {
	ID                       string     `json:"id"`
	TeamID                   string     `json:"team_id"`
	Name                     string     `json:"name"`
	Slug                     string     `json:"slug"`
	Description              *string    `json:"description"`
	Methodology              string     `json:"methodology"`
	Status                   *string    `json:"status"`
	DueDate                  *time.Time `json:"due_date"`
	ContactName              *string    `json:"contact_name"`
	ContactEmail             *string    `json:"contact_email"`
	ContactPhone             *string    `json:"contact_phone"`
	SprintDurationWeeks      int        `json:"sprint_duration_weeks"`
	DefaultProjectMonths     int        `json:"default_project_months"`
	DefaultEpicWeeks         int        `json:"default_epic_weeks"`
	ArchivedAt               *time.Time `json:"archived_at"`
	RetentionDays            int        `json:"retention_days"`
	PROpenTransitionStateID  *string    `json:"pr_open_transition_state_id"`
	PRMergeTransitionStateID *string    `json:"pr_merge_transition_state_id"`
	CreatedAt                time.Time  `json:"created_at"`
	UpdatedAt                time.Time  `json:"updated_at"`
}

func (p *Project) scanFields() []any {
	return []any{
		&p.ID, &p.TeamID, &p.Name, &p.Slug, &p.Description, &p.Methodology,
		&p.Status, &p.DueDate, &p.ContactName, &p.ContactEmail, &p.ContactPhone,
		&p.SprintDurationWeeks, &p.DefaultProjectMonths, &p.DefaultEpicWeeks,
		&p.ArchivedAt, &p.RetentionDays, &p.PROpenTransitionStateID, &p.PRMergeTransitionStateID,
		&p.CreatedAt, &p.UpdatedAt,
	}
}

// ProjectHandlers handles CRUD for projects within a team.
type ProjectHandlers struct {
	db DBPOOL
}

func NewProjectHandlers(db DBPOOL) *ProjectHandlers { return &ProjectHandlers{db: db} }

// List returns all projects for a given team, scoped to the user's access.
// Org admins see all projects; other users only see projects they're a member of.
func (h *ProjectHandlers) List(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	teamID := chi.URLParam(r, "teamID")
	if teamID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "teamID is required")
		return
	}

	includeArchived := r.URL.Query().Get("include_archived") == "true"
	archiveFilter := ""
	if !includeArchived {
		archiveFilter = "AND p.archived_at IS NULL"
	}
	rows, err := h.db.Query(r.Context(),
		fmt.Sprintf(`SELECT %s FROM projects p
		 WHERE p.team_id = $1 %s
		   AND (
		     EXISTS(SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $2)
		     OR EXISTS(SELECT 1 FROM organization_members om
		               JOIN teams t ON t.organization_id = om.organization_id
		               WHERE t.id = p.team_id AND om.user_id = $2 AND om.role = 'admin')
		   )
		 ORDER BY p.created_at`, projectColumnsAliased, archiveFilter), teamID, claims.UserID)
	if err != nil {
		slog.Error("projects.List: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list projects")
		return
	}
	defer rows.Close()

	projects := []Project{}
	for rows.Next() {
		var p Project
		if err := rows.Scan(p.scanFields()...); err != nil {
			slog.Error("projects.List: scan failed", "error", err)
			writeError(w, http.StatusInternalServerError, "db_error", "Failed to read project row")
			return
		}
		projects = append(projects, p)
	}
	if err := rows.Err(); err != nil {
		slog.Error("projects.List: rows iteration error", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list projects")
		return
	}

	writeJSON(w, http.StatusOK, projects)
}

type createProjectRequest struct {
	Name         string  `json:"name"`
	Description  *string `json:"description"`
	Methodology  *string `json:"methodology"`
	DueDate      *string `json:"due_date"`
	ContactName  *string `json:"contact_name"`
	ContactEmail *string `json:"contact_email"`
	ContactPhone *string `json:"contact_phone"`
}

// Create inserts a new project under the given team.
func (h *ProjectHandlers) Create(w http.ResponseWriter, r *http.Request) {
	teamID := chi.URLParam(r, "teamID")
	if teamID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "teamID is required")
		return
	}

	var body createProjectRequest
	if !readJSON(w, r, &body) {
		return
	}
	if body.Name == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "name is required")
		return
	}

	slug := slugify(body.Name)
	methodology := "scrum"
	if body.Methodology != nil && *body.Methodology != "" {
		methodology = *body.Methodology
	}

	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	var p Project
	err := h.db.QueryRow(r.Context(),
		fmt.Sprintf(`INSERT INTO projects (team_id, name, slug, description, methodology,
			due_date, contact_name, contact_email, contact_phone)
		 VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8, $9)
		 RETURNING %s`, projectColumns),
		teamID, body.Name, slug, body.Description, methodology,
		body.DueDate, body.ContactName, body.ContactEmail, body.ContactPhone,
	).Scan(p.scanFields()...)
	if err != nil {
		slog.Error("projects.Create: insert failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to create project")
		return
	}

	// Auto-create a default epic so the project has a home for stories/tasks
	var itemNumber int
	if err := h.db.QueryRow(r.Context(),
		`UPDATE projects SET item_counter = item_counter + 1 WHERE id = $1 RETURNING item_counter`,
		p.ID).Scan(&itemNumber); err != nil {
		slog.Warn("projects.Create: item counter increment for default epic failed", "error", err)
	}
	if _, err := h.db.Exec(r.Context(),
		`INSERT INTO epics (project_id, title, description, status, priority, created_by, item_number)
		 VALUES ($1, $2, $3, 'open', 'medium', $4, $5)`,
		p.ID, p.Name, "Default epic for "+p.Name, claims.UserID, itemNumber); err != nil {
		slog.Error("projects.Create: auto-create default epic failed", "error", err)
	}

	// Auto-add creator as a project member (PM role)
	var userName, userEmail string
	if err := h.db.QueryRow(r.Context(),
		`SELECT name, email FROM users WHERE id = $1`, claims.UserID,
	).Scan(&userName, &userEmail); err != nil {
		slog.Warn("projects.Create: user lookup for auto-member failed", "userID", claims.UserID, "error", err)
	}
	if _, err := h.db.Exec(r.Context(),
		`INSERT INTO project_members (project_id, user_id, name, email, job_role)
		 VALUES ($1, $2, $3, $4, 'pm')
		 ON CONFLICT DO NOTHING`,
		p.ID, claims.UserID, userName, userEmail); err != nil {
		slog.Error("projects.Create: auto-add creator as member failed", "error", err)
	}

	writeJSON(w, http.StatusCreated, p)
}

// Get returns a single project by ID, verifying the user has access.
func (h *ProjectHandlers) Get(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	projectID := chi.URLParam(r, "projectID")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "projectID is required")
		return
	}

	var p Project
	err := h.db.QueryRow(r.Context(),
		fmt.Sprintf(`SELECT %s FROM projects p
		 WHERE p.id = $1
		   AND (
		     EXISTS(SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $2)
		     OR EXISTS(SELECT 1 FROM organization_members om
		               JOIN teams t ON t.organization_id = om.organization_id
		               WHERE t.id = p.team_id AND om.user_id = $2 AND om.role = 'admin')
		   )`, projectColumnsAliased), projectID, claims.UserID,
	).Scan(p.scanFields()...)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "Project not found")
			return
		}
		slog.Error("projects.Get: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to get project")
		return
	}

	writeJSON(w, http.StatusOK, p)
}

type updateProjectRequest struct {
	Name                     *string `json:"name"`
	Description              *string `json:"description"`
	Methodology              *string `json:"methodology"`
	Status                   *string `json:"status"`
	DueDate                  *string `json:"due_date"`
	ContactName              *string `json:"contact_name"`
	ContactEmail             *string `json:"contact_email"`
	ContactPhone             *string `json:"contact_phone"`
	SprintDurationWeeks      *int    `json:"sprint_duration_weeks"`
	DefaultProjectMonths     *int    `json:"default_project_months"`
	DefaultEpicWeeks         *int    `json:"default_epic_weeks"`
	RetentionDays            *int    `json:"retention_days"`
	PROpenTransitionStateID  *string `json:"pr_open_transition_state_id"`
	PRMergeTransitionStateID *string `json:"pr_merge_transition_state_id"`
}

func (h *ProjectHandlers) Update(w http.ResponseWriter, r *http.Request) {
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

	var body updateProjectRequest
	if !readJSON(w, r, &body) {
		return
	}

	fields := []string{}
	args := []any{}
	argN := 1

	if body.Name != nil {
		fields = append(fields, fmt.Sprintf("name = $%d", argN))
		args = append(args, *body.Name)
		argN++
		fields = append(fields, fmt.Sprintf("slug = $%d", argN))
		args = append(args, slugify(*body.Name))
		argN++
	}
	for _, f := range []struct {
		col string
		val *string
	}{
		{"description", body.Description},
		{"methodology", body.Methodology},
		{"status", body.Status},
		{"contact_name", body.ContactName},
		{"contact_email", body.ContactEmail},
		{"contact_phone", body.ContactPhone},
	} {
		if f.val != nil {
			fields = append(fields, fmt.Sprintf("%s = $%d", f.col, argN))
			args = append(args, *f.val)
			argN++
		}
	}
	if body.DueDate != nil {
		fields = append(fields, fmt.Sprintf("due_date = $%d::date", argN))
		args = append(args, *body.DueDate)
		argN++
	}
	if body.SprintDurationWeeks != nil {
		fields = append(fields, fmt.Sprintf("sprint_duration_weeks = $%d", argN))
		args = append(args, *body.SprintDurationWeeks)
		argN++
	}
	if body.DefaultProjectMonths != nil {
		fields = append(fields, fmt.Sprintf("default_project_months = $%d", argN))
		args = append(args, *body.DefaultProjectMonths)
		argN++
	}
	if body.DefaultEpicWeeks != nil {
		fields = append(fields, fmt.Sprintf("default_epic_weeks = $%d", argN))
		args = append(args, *body.DefaultEpicWeeks)
		argN++
	}
	if body.RetentionDays != nil {
		fields = append(fields, fmt.Sprintf("retention_days = $%d", argN))
		args = append(args, *body.RetentionDays)
		argN++
	}
	if body.PROpenTransitionStateID != nil {
		if *body.PROpenTransitionStateID == "" {
			fields = append(fields, "pr_open_transition_state_id = NULL")
		} else {
			fields = append(fields, fmt.Sprintf("pr_open_transition_state_id = $%d", argN))
			args = append(args, *body.PROpenTransitionStateID)
			argN++
		}
	}
	if body.PRMergeTransitionStateID != nil {
		if *body.PRMergeTransitionStateID == "" {
			fields = append(fields, "pr_merge_transition_state_id = NULL")
		} else {
			fields = append(fields, fmt.Sprintf("pr_merge_transition_state_id = $%d", argN))
			args = append(args, *body.PRMergeTransitionStateID)
			argN++
		}
	}

	if len(fields) == 0 {
		writeError(w, http.StatusBadRequest, "validation_error", "No fields to update")
		return
	}

	fields = append(fields, "updated_at = NOW()")
	args = append(args, projectID)

	query := fmt.Sprintf(
		`UPDATE projects SET %s WHERE id = $%d RETURNING %s`,
		strings.Join(fields, ", "), argN, projectColumns)

	var p Project
	err := h.db.QueryRow(r.Context(), query, args...).Scan(p.scanFields()...)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "Project not found")
			return
		}
		slog.Error("projects.Update: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to update project")
		return
	}

	writeJSON(w, http.StatusOK, p)
}

// Delete removes a project by ID.
func (h *ProjectHandlers) Delete(w http.ResponseWriter, r *http.Request) {
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

	tag, err := h.db.Exec(r.Context(), `DELETE FROM projects WHERE id = $1`, projectID)
	if err != nil {
		slog.Error("projects.Delete: exec failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to delete project")
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "not_found", "Project not found")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Archive soft-deletes a project by setting archived_at.
func (h *ProjectHandlers) Archive(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	var p Project
	err := h.db.QueryRow(r.Context(),
		fmt.Sprintf(`UPDATE projects SET archived_at = NOW(), updated_at = NOW() WHERE id = $1 AND archived_at IS NULL RETURNING %s`, projectColumns),
		projectID,
	).Scan(p.scanFields()...)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "Project not found or already archived")
			return
		}
		slog.Error("projects.Archive: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to archive project")
		return
	}

	writeJSON(w, http.StatusOK, p)
}

// Unarchive restores an archived project.
func (h *ProjectHandlers) Unarchive(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	var p Project
	err := h.db.QueryRow(r.Context(),
		fmt.Sprintf(`UPDATE projects SET archived_at = NULL, updated_at = NOW() WHERE id = $1 AND archived_at IS NOT NULL RETURNING %s`, projectColumns),
		projectID,
	).Scan(p.scanFields()...)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "Project not found or not archived")
			return
		}
		slog.Error("projects.Unarchive: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to unarchive project")
		return
	}

	writeJSON(w, http.StatusOK, p)
}
