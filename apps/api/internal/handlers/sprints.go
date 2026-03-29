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

// Sprint represents a sprint row returned to clients.
type Sprint struct {
	ID        string     `json:"id"`
	ProjectID string     `json:"project_id"`
	Name      string     `json:"name"`
	Goal      *string    `json:"goal"`
	StartDate *time.Time `json:"start_date"`
	EndDate   *time.Time `json:"end_date"`
	Status    string     `json:"status"`
	Velocity  *int       `json:"velocity"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}

// SprintHandlers handles CRUD for sprints within a project.
type SprintHandlers struct {
	db *pgxpool.Pool
}

func NewSprintHandlers(db *pgxpool.Pool) *SprintHandlers { return &SprintHandlers{db: db} }

// List returns all sprints for a given project.
func (h *SprintHandlers) List(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "projectID is required")
		return
	}

	rows, err := h.db.Query(r.Context(),
		`SELECT id, project_id, name, goal, start_date, end_date, status, velocity, created_at, updated_at
		 FROM sprints WHERE project_id = $1 ORDER BY created_at`, projectID)
	if err != nil {
		slog.Error("sprints.List: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list sprints")
		return
	}
	defer rows.Close()

	sprints := []Sprint{}
	for rows.Next() {
		var s Sprint
		if err := rows.Scan(&s.ID, &s.ProjectID, &s.Name, &s.Goal, &s.StartDate, &s.EndDate, &s.Status, &s.Velocity, &s.CreatedAt, &s.UpdatedAt); err != nil {
			slog.Error("sprints.List: scan failed", "error", err)
			writeError(w, http.StatusInternalServerError, "db_error", "Failed to read sprint row")
			return
		}
		sprints = append(sprints, s)
	}
	if err := rows.Err(); err != nil {
		slog.Error("sprints.List: rows iteration error", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list sprints")
		return
	}

	writeJSON(w, http.StatusOK, sprints)
}

// createSprintRequest is the JSON body for creating a sprint.
type createSprintRequest struct {
	Name      string  `json:"name"`
	Goal      *string `json:"goal"`
	StartDate *string `json:"start_date"`
	EndDate   *string `json:"end_date"`
	Status    *string `json:"status"`
}

// Create inserts a new sprint under the given project.
func (h *SprintHandlers) Create(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "projectID is required")
		return
	}

	var body createSprintRequest
	if !readJSON(w, r, &body) {
		return
	}
	if body.Name == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "name is required")
		return
	}

	var startDate *time.Time
	if body.StartDate != nil {
		t, err := time.Parse("2006-01-02", *body.StartDate)
		if err != nil {
			writeError(w, http.StatusBadRequest, "validation_error", "start_date must be YYYY-MM-DD")
			return
		}
		startDate = &t
	}

	var endDate *time.Time
	if body.EndDate != nil {
		t, err := time.Parse("2006-01-02", *body.EndDate)
		if err != nil {
			writeError(w, http.StatusBadRequest, "validation_error", "end_date must be YYYY-MM-DD")
			return
		}
		endDate = &t
	}

	status := "planned"
	if body.Status != nil && *body.Status != "" {
		status = *body.Status
	}

	var s Sprint
	err := h.db.QueryRow(r.Context(),
		`INSERT INTO sprints (project_id, name, goal, start_date, end_date, status)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, project_id, name, goal, start_date, end_date, status, velocity, created_at, updated_at`,
		projectID, body.Name, body.Goal, startDate, endDate, status,
	).Scan(&s.ID, &s.ProjectID, &s.Name, &s.Goal, &s.StartDate, &s.EndDate, &s.Status, &s.Velocity, &s.CreatedAt, &s.UpdatedAt)
	if err != nil {
		slog.Error("sprints.Create: insert failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to create sprint")
		return
	}

	writeJSON(w, http.StatusCreated, s)
}

// updateSprintRequest is the JSON body for patching a sprint.
type updateSprintRequest struct {
	Name      *string `json:"name"`
	Goal      *string `json:"goal"`
	StartDate *string `json:"start_date"`
	EndDate   *string `json:"end_date"`
	Status    *string `json:"status"`
	Velocity  *int    `json:"velocity"`
}

// Update patches a sprint by ID using dynamic SET clause for partial updates.
func (h *SprintHandlers) Update(w http.ResponseWriter, r *http.Request) {
	sprintID := chi.URLParam(r, "sprintID")
	if sprintID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "sprintID is required")
		return
	}

	var body updateSprintRequest
	if !readJSON(w, r, &body) {
		return
	}

	setClauses := []string{}
	args := []any{}
	argPos := 1

	if body.Name != nil {
		setClauses = append(setClauses, fmt.Sprintf("name = $%d", argPos))
		args = append(args, *body.Name)
		argPos++
	}
	if body.Goal != nil {
		setClauses = append(setClauses, fmt.Sprintf("goal = $%d", argPos))
		args = append(args, *body.Goal)
		argPos++
	}
	if body.StartDate != nil {
		t, err := time.Parse("2006-01-02", *body.StartDate)
		if err != nil {
			writeError(w, http.StatusBadRequest, "validation_error", "start_date must be YYYY-MM-DD")
			return
		}
		setClauses = append(setClauses, fmt.Sprintf("start_date = $%d", argPos))
		args = append(args, t)
		argPos++
	}
	if body.EndDate != nil {
		t, err := time.Parse("2006-01-02", *body.EndDate)
		if err != nil {
			writeError(w, http.StatusBadRequest, "validation_error", "end_date must be YYYY-MM-DD")
			return
		}
		setClauses = append(setClauses, fmt.Sprintf("end_date = $%d", argPos))
		args = append(args, t)
		argPos++
	}
	if body.Status != nil {
		setClauses = append(setClauses, fmt.Sprintf("status = $%d", argPos))
		args = append(args, *body.Status)
		argPos++
	}
	if body.Velocity != nil {
		setClauses = append(setClauses, fmt.Sprintf("velocity = $%d", argPos))
		args = append(args, *body.Velocity)
		argPos++
	}

	if len(setClauses) == 0 {
		writeError(w, http.StatusBadRequest, "validation_error", "No fields to update")
		return
	}

	setClauses = append(setClauses, "updated_at = NOW()")
	args = append(args, sprintID)

	query := fmt.Sprintf(
		`UPDATE sprints SET %s WHERE id = $%d
		 RETURNING id, project_id, name, goal, start_date, end_date, status, velocity, created_at, updated_at`,
		strings.Join(setClauses, ", "), argPos,
	)

	var s Sprint
	err := h.db.QueryRow(r.Context(), query, args...).Scan(
		&s.ID, &s.ProjectID, &s.Name, &s.Goal, &s.StartDate, &s.EndDate, &s.Status, &s.Velocity, &s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "Sprint not found")
			return
		}
		slog.Error("sprints.Update: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to update sprint")
		return
	}

	writeJSON(w, http.StatusOK, s)
}

// Delete removes a sprint by ID.
func (h *SprintHandlers) Delete(w http.ResponseWriter, r *http.Request) {
	sprintID := chi.URLParam(r, "sprintID")
	if sprintID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "sprintID is required")
		return
	}

	tag, err := h.db.Exec(r.Context(), `DELETE FROM sprints WHERE id = $1`, sprintID)
	if err != nil {
		slog.Error("sprints.Delete: exec failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to delete sprint")
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "not_found", "Sprint not found")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
