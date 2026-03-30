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

	"github.com/OhByron/ProjectA/internal/auth"
)

// Epic represents an epic row returned to clients.
type Epic struct {
	ID           string    `json:"id"`
	ProjectID    string    `json:"project_id"`
	Title        string    `json:"title"`
	Description  *string   `json:"description"`
	Status       string    `json:"status"`
	Priority     string    `json:"priority"`
	OrderIndex   float64   `json:"order_index"`
	InitiativeID *string   `json:"initiative_id"`
	AssigneeID   *string   `json:"assignee_id"`
	CreatedBy    string    `json:"created_by"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// EpicHandlers handles CRUD for epics within a project.
type EpicHandlers struct {
	db *pgxpool.Pool
}

func NewEpicHandlers(db *pgxpool.Pool) *EpicHandlers { return &EpicHandlers{db: db} }

// List returns all epics for a given project.
func (h *EpicHandlers) List(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "projectID is required")
		return
	}

	pp := parsePagination(r)

	// Count total matching rows.
	var total int
	err := h.db.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM epics WHERE project_id = $1`, projectID).Scan(&total)
	if err != nil {
		slog.Error("epics.List: count query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list epics")
		return
	}

	rows, err := h.db.Query(r.Context(),
		`SELECT id, project_id, title, description, status, priority, order_index, initiative_id, assignee_id, created_by, created_at, updated_at
		 FROM epics WHERE project_id = $1 ORDER BY order_index, created_at LIMIT $2 OFFSET $3`, projectID, pp.PageSize, pp.Offset)
	if err != nil {
		slog.Error("epics.List: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list epics")
		return
	}
	defer rows.Close()

	epics := []Epic{}
	for rows.Next() {
		var e Epic
		if err := rows.Scan(&e.ID, &e.ProjectID, &e.Title, &e.Description, &e.Status, &e.Priority, &e.OrderIndex, &e.InitiativeID, &e.AssigneeID, &e.CreatedBy, &e.CreatedAt, &e.UpdatedAt); err != nil {
			slog.Error("epics.List: scan failed", "error", err)
			writeError(w, http.StatusInternalServerError, "db_error", "Failed to read epic row")
			return
		}
		epics = append(epics, e)
	}
	if err := rows.Err(); err != nil {
		slog.Error("epics.List: rows iteration error", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list epics")
		return
	}

	writeJSON(w, http.StatusOK, paginatedResponse{Items: epics, Total: total, Page: pp.Page, PageSize: pp.PageSize})
}

// createEpicRequest is the JSON body for creating an epic.
type createEpicRequest struct {
	Title        string   `json:"title"`
	Description  *string  `json:"description"`
	Status       *string  `json:"status"`
	Priority     *string  `json:"priority"`
	OrderIndex   *float64 `json:"order_index"`
	InitiativeID *string  `json:"initiative_id"`
	AssigneeID   *string  `json:"assignee_id"`
}

// Create inserts a new epic under the given project.
func (h *EpicHandlers) Create(w http.ResponseWriter, r *http.Request) {
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

	var body createEpicRequest
	if !readJSON(w, r, &body) {
		return
	}
	if body.Title == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "title is required")
		return
	}

	status := "open"
	if body.Status != nil && *body.Status != "" {
		status = *body.Status
	}
	priority := "medium"
	if body.Priority != nil && *body.Priority != "" {
		priority = *body.Priority
	}
	var orderIndex float64
	if body.OrderIndex != nil {
		orderIndex = *body.OrderIndex
	}

	var e Epic
	err := h.db.QueryRow(r.Context(),
		`INSERT INTO epics (project_id, title, description, status, priority, order_index, initiative_id, assignee_id, created_by)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		 RETURNING id, project_id, title, description, status, priority, order_index, initiative_id, assignee_id, created_by, created_at, updated_at`,
		projectID, body.Title, body.Description, status, priority, orderIndex, body.InitiativeID, body.AssigneeID, claims.UserID,
	).Scan(&e.ID, &e.ProjectID, &e.Title, &e.Description, &e.Status, &e.Priority, &e.OrderIndex, &e.InitiativeID, &e.AssigneeID, &e.CreatedBy, &e.CreatedAt, &e.UpdatedAt)
	if err != nil {
		slog.Error("epics.Create: insert failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to create epic")
		return
	}

	writeJSON(w, http.StatusCreated, e)
}

// Get returns a single epic by ID.
func (h *EpicHandlers) Get(w http.ResponseWriter, r *http.Request) {
	epicID := chi.URLParam(r, "epicID")
	if epicID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "epicID is required")
		return
	}

	var e Epic
	err := h.db.QueryRow(r.Context(),
		`SELECT id, project_id, title, description, status, priority, order_index, initiative_id, assignee_id, created_by, created_at, updated_at
		 FROM epics WHERE id = $1`, epicID,
	).Scan(&e.ID, &e.ProjectID, &e.Title, &e.Description, &e.Status, &e.Priority, &e.OrderIndex, &e.InitiativeID, &e.AssigneeID, &e.CreatedBy, &e.CreatedAt, &e.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "Epic not found")
			return
		}
		slog.Error("epics.Get: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to get epic")
		return
	}

	writeJSON(w, http.StatusOK, e)
}

// updateEpicRequest is the JSON body for patching an epic.
type updateEpicRequest struct {
	Title        *string  `json:"title"`
	Description  *string  `json:"description"`
	Status       *string  `json:"status"`
	Priority     *string  `json:"priority"`
	OrderIndex   *float64 `json:"order_index"`
	InitiativeID *string  `json:"initiative_id"`
	AssigneeID   *string  `json:"assignee_id"`
}

// Update patches an epic by ID using dynamic SET clause for partial updates.
func (h *EpicHandlers) Update(w http.ResponseWriter, r *http.Request) {
	epicID := chi.URLParam(r, "epicID")
	if epicID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "epicID is required")
		return
	}

	var body updateEpicRequest
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
	if body.OrderIndex != nil {
		fields = append(fields, fmt.Sprintf("order_index = $%d", argN))
		args = append(args, *body.OrderIndex)
		argN++
	}
	if body.InitiativeID != nil {
		fields = append(fields, fmt.Sprintf("initiative_id = $%d", argN))
		args = append(args, *body.InitiativeID)
		argN++
	}
	if body.AssigneeID != nil {
		fields = append(fields, fmt.Sprintf("assignee_id = $%d", argN))
		args = append(args, *body.AssigneeID)
		argN++
	}

	if len(fields) == 0 {
		writeError(w, http.StatusBadRequest, "validation_error", "No fields to update")
		return
	}

	fields = append(fields, "updated_at = NOW()")
	args = append(args, epicID)

	query := fmt.Sprintf(
		`UPDATE epics SET %s WHERE id = $%d
		 RETURNING id, project_id, title, description, status, priority, order_index, initiative_id, assignee_id, created_by, created_at, updated_at`,
		strings.Join(fields, ", "), argN)

	var e Epic
	err := h.db.QueryRow(r.Context(), query, args...).
		Scan(&e.ID, &e.ProjectID, &e.Title, &e.Description, &e.Status, &e.Priority, &e.OrderIndex, &e.InitiativeID, &e.AssigneeID, &e.CreatedBy, &e.CreatedAt, &e.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "Epic not found")
			return
		}
		slog.Error("epics.Update: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to update epic")
		return
	}

	writeJSON(w, http.StatusOK, e)
}

// Delete removes an epic by ID.
func (h *EpicHandlers) Delete(w http.ResponseWriter, r *http.Request) {
	epicID := chi.URLParam(r, "epicID")
	if epicID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "epicID is required")
		return
	}

	tag, err := h.db.Exec(r.Context(), `DELETE FROM epics WHERE id = $1`, epicID)
	if err != nil {
		slog.Error("epics.Delete: exec failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to delete epic")
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "not_found", "Epic not found")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
