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
	"github.com/jackc/pgx/v5/pgxpool"
)

const projectMemberColumns = `id, project_id, user_id, name, email, phone, job_role, capacity, created_at, updated_at`

// projectMemberResponse represents a project_members row returned to clients.
type projectMemberResponse struct {
	ID        string    `json:"id"`
	ProjectID string    `json:"project_id"`
	UserID    *string   `json:"user_id"`
	Name      string    `json:"name"`
	Email     *string   `json:"email"`
	Phone     *string   `json:"phone"`
	JobRole   string    `json:"job_role"`
	Capacity  *int      `json:"capacity"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (m *projectMemberResponse) scanFields() []any {
	return []any{
		&m.ID, &m.ProjectID, &m.UserID, &m.Name, &m.Email, &m.Phone, &m.JobRole, &m.Capacity,
		&m.CreatedAt, &m.UpdatedAt,
	}
}

// ProjectMemberHandlers handles CRUD for project members.
type ProjectMemberHandlers struct {
	db *pgxpool.Pool
}

func NewProjectMemberHandlers(db *pgxpool.Pool) *ProjectMemberHandlers {
	return &ProjectMemberHandlers{db: db}
}

// List returns all members for a given project.
func (h *ProjectMemberHandlers) List(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "projectID is required")
		return
	}

	pp := parsePagination(r)

	// Count total matching rows.
	var total int
	err := h.db.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM project_members WHERE project_id = $1`, projectID).Scan(&total)
	if err != nil {
		slog.Error("project_members.List: count query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list project members")
		return
	}

	rows, err := h.db.Query(r.Context(),
		fmt.Sprintf(`SELECT %s FROM project_members WHERE project_id = $1 ORDER BY name LIMIT $2 OFFSET $3`, projectMemberColumns), projectID, pp.PageSize, pp.Offset)
	if err != nil {
		slog.Error("project_members.List: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list project members")
		return
	}
	defer rows.Close()

	members := []projectMemberResponse{}
	for rows.Next() {
		var m projectMemberResponse
		if err := rows.Scan(m.scanFields()...); err != nil {
			slog.Error("project_members.List: scan failed", "error", err)
			writeError(w, http.StatusInternalServerError, "db_error", "Failed to read project member row")
			return
		}
		members = append(members, m)
	}
	if err := rows.Err(); err != nil {
		slog.Error("project_members.List: rows iteration error", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list project members")
		return
	}

	writeJSON(w, http.StatusOK, paginatedResponse{Items: members, Total: total, Page: pp.Page, PageSize: pp.PageSize})
}

type createProjectMemberRequest struct {
	Name     string  `json:"name"`
	Email    *string `json:"email"`
	Phone    *string `json:"phone"`
	JobRole  string  `json:"job_role"`
	Capacity *int    `json:"capacity"`
}

// Create inserts a new member into a project.
func (h *ProjectMemberHandlers) Create(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "projectID is required")
		return
	}

	var body createProjectMemberRequest
	if !readJSON(w, r, &body) {
		return
	}
	if body.Name == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "name is required")
		return
	}
	if body.JobRole == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "job_role is required")
		return
	}

	var m projectMemberResponse
	err := h.db.QueryRow(r.Context(),
		fmt.Sprintf(`INSERT INTO project_members (project_id, name, email, phone, job_role, capacity)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING %s`, projectMemberColumns),
		projectID, body.Name, body.Email, body.Phone, body.JobRole, body.Capacity,
	).Scan(m.scanFields()...)
	if err != nil {
		slog.Error("project_members.Create: insert failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to create project member")
		return
	}

	writeJSON(w, http.StatusCreated, m)
}

type updateProjectMemberRequest struct {
	Name     *string `json:"name"`
	Email    *string `json:"email"`
	Phone    *string `json:"phone"`
	JobRole  *string `json:"job_role"`
	Capacity *int    `json:"capacity"`
}

// Update patches an existing project member.
func (h *ProjectMemberHandlers) Update(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "projectID is required")
		return
	}
	memberID := chi.URLParam(r, "memberID")
	if memberID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "memberID is required")
		return
	}

	var body updateProjectMemberRequest
	if !readJSON(w, r, &body) {
		return
	}

	fields := []string{}
	args := []any{}
	argN := 1

	for _, f := range []struct {
		col string
		val *string
	}{
		{"name", body.Name},
		{"email", body.Email},
		{"phone", body.Phone},
		{"job_role", body.JobRole},
	} {
		if f.val != nil {
			fields = append(fields, fmt.Sprintf("%s = $%d", f.col, argN))
			args = append(args, *f.val)
			argN++
		}
	}
	if body.Capacity != nil {
		fields = append(fields, fmt.Sprintf("capacity = $%d", argN))
		args = append(args, *body.Capacity)
		argN++
	}

	if len(fields) == 0 {
		writeError(w, http.StatusBadRequest, "validation_error", "No fields to update")
		return
	}

	fields = append(fields, "updated_at = NOW()")
	args = append(args, memberID, projectID)

	query := fmt.Sprintf(
		`UPDATE project_members SET %s WHERE id = $%d AND project_id = $%d RETURNING %s`,
		strings.Join(fields, ", "), argN, argN+1, projectMemberColumns)

	var m projectMemberResponse
	err := h.db.QueryRow(r.Context(), query, args...).Scan(m.scanFields()...)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "Project member not found")
			return
		}
		slog.Error("project_members.Update: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to update project member")
		return
	}

	writeJSON(w, http.StatusOK, m)
}

// Delete removes a project member by ID.
func (h *ProjectMemberHandlers) Delete(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "projectID is required")
		return
	}
	memberID := chi.URLParam(r, "memberID")
	if memberID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "memberID is required")
		return
	}

	tag, err := h.db.Exec(r.Context(),
		`DELETE FROM project_members WHERE id = $1 AND project_id = $2`, memberID, projectID)
	if err != nil {
		slog.Error("project_members.Delete: exec failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to delete project member")
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "not_found", "Project member not found")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
