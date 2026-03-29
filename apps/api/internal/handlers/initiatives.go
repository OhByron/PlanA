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

// InitiativeHandlers handles CRUD for cross-team initiatives.
type InitiativeHandlers struct {
	db *pgxpool.Pool
}

func NewInitiativeHandlers(db *pgxpool.Pool) *InitiativeHandlers {
	return &InitiativeHandlers{db: db}
}

type initiativeResponse struct {
	ID             string     `json:"id"`
	OrganizationID string     `json:"organization_id"`
	Title          string     `json:"title"`
	Description    *string    `json:"description"`
	Status         string     `json:"status"`
	Priority       string     `json:"priority"`
	StartDate      *time.Time `json:"start_date"`
	TargetDate     *time.Time `json:"target_date"`
	OrderIndex     float64    `json:"order_index"`
	CreatedBy      string     `json:"created_by"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

type createInitiativeRequest struct {
	Title       string   `json:"title"`
	Description *string  `json:"description"`
	Status      *string  `json:"status"`
	Priority    *string  `json:"priority"`
	StartDate   *string  `json:"start_date"`
	TargetDate  *string  `json:"target_date"`
	OrderIndex  *float64 `json:"order_index"`
}

type updateInitiativeRequest struct {
	Title       *string  `json:"title"`
	Description *string  `json:"description"`
	Status      *string  `json:"status"`
	Priority    *string  `json:"priority"`
	StartDate   *string  `json:"start_date"`
	TargetDate  *string  `json:"target_date"`
	OrderIndex  *float64 `json:"order_index"`
}

// List returns all initiatives for an organisation.
func (h *InitiativeHandlers) List(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "orgID")

	rows, err := h.db.Query(r.Context(),
		`SELECT id, organization_id, title, description, status, priority,
		        start_date, target_date, order_index, created_by, created_at, updated_at
		   FROM initiatives
		  WHERE organization_id = $1
		  ORDER BY order_index, created_at`, orgID)
	if err != nil {
		slog.Error("initiatives.List: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list initiatives")
		return
	}
	defer rows.Close()

	items := make([]initiativeResponse, 0)
	for rows.Next() {
		var i initiativeResponse
		if err := rows.Scan(
			&i.ID, &i.OrganizationID, &i.Title, &i.Description,
			&i.Status, &i.Priority, &i.StartDate, &i.TargetDate,
			&i.OrderIndex, &i.CreatedBy, &i.CreatedAt, &i.UpdatedAt,
		); err != nil {
			slog.Error("initiatives.List: scan failed", "error", err)
			writeError(w, http.StatusInternalServerError, "db_error", "Failed to list initiatives")
			return
		}
		items = append(items, i)
	}
	if err := rows.Err(); err != nil {
		slog.Error("initiatives.List: rows iteration failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list initiatives")
		return
	}

	writeJSON(w, http.StatusOK, items)
}

// Create inserts a new initiative for the organisation.
func (h *InitiativeHandlers) Create(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Missing or invalid authentication")
		return
	}

	orgID := chi.URLParam(r, "orgID")

	var req createInitiativeRequest
	if !readJSON(w, r, &req) {
		return
	}
	if req.Title == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "Title is required")
		return
	}

	var i initiativeResponse
	err := h.db.QueryRow(r.Context(),
		`INSERT INTO initiatives (organization_id, title, description, status, priority, start_date, target_date, order_index, created_by)
		 VALUES ($1, $2, $3, COALESCE($4, 'planned'), COALESCE($5, 'medium'), $6::date, $7::date, COALESCE($8, 0), $9)
		 RETURNING id, organization_id, title, description, status, priority,
		           start_date, target_date, order_index, created_by, created_at, updated_at`,
		orgID, req.Title, req.Description, req.Status, req.Priority,
		req.StartDate, req.TargetDate, req.OrderIndex, claims.UserID,
	).Scan(
		&i.ID, &i.OrganizationID, &i.Title, &i.Description,
		&i.Status, &i.Priority, &i.StartDate, &i.TargetDate,
		&i.OrderIndex, &i.CreatedBy, &i.CreatedAt, &i.UpdatedAt,
	)
	if err != nil {
		slog.Error("initiatives.Create: insert failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to create initiative")
		return
	}

	writeJSON(w, http.StatusCreated, i)
}

// Get returns a single initiative by ID.
func (h *InitiativeHandlers) Get(w http.ResponseWriter, r *http.Request) {
	initiativeID := chi.URLParam(r, "initiativeID")

	var i initiativeResponse
	err := h.db.QueryRow(r.Context(),
		`SELECT id, organization_id, title, description, status, priority,
		        start_date, target_date, order_index, created_by, created_at, updated_at
		   FROM initiatives
		  WHERE id = $1`, initiativeID,
	).Scan(
		&i.ID, &i.OrganizationID, &i.Title, &i.Description,
		&i.Status, &i.Priority, &i.StartDate, &i.TargetDate,
		&i.OrderIndex, &i.CreatedBy, &i.CreatedAt, &i.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "Initiative not found")
			return
		}
		slog.Error("initiatives.Get: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to get initiative")
		return
	}

	writeJSON(w, http.StatusOK, i)
}

// Update patches an initiative using dynamic SET for partial updates.
func (h *InitiativeHandlers) Update(w http.ResponseWriter, r *http.Request) {
	initiativeID := chi.URLParam(r, "initiativeID")

	var req updateInitiativeRequest
	if !readJSON(w, r, &req) {
		return
	}

	fields := []string{}
	args := []any{}
	argN := 1

	if req.Title != nil {
		fields = append(fields, fmt.Sprintf("title = $%d", argN))
		args = append(args, *req.Title)
		argN++
	}
	if req.Description != nil {
		fields = append(fields, fmt.Sprintf("description = $%d", argN))
		args = append(args, *req.Description)
		argN++
	}
	if req.Status != nil {
		fields = append(fields, fmt.Sprintf("status = $%d", argN))
		args = append(args, *req.Status)
		argN++
	}
	if req.Priority != nil {
		fields = append(fields, fmt.Sprintf("priority = $%d", argN))
		args = append(args, *req.Priority)
		argN++
	}
	if req.StartDate != nil {
		fields = append(fields, fmt.Sprintf("start_date = $%d::date", argN))
		args = append(args, *req.StartDate)
		argN++
	}
	if req.TargetDate != nil {
		fields = append(fields, fmt.Sprintf("target_date = $%d::date", argN))
		args = append(args, *req.TargetDate)
		argN++
	}
	if req.OrderIndex != nil {
		fields = append(fields, fmt.Sprintf("order_index = $%d", argN))
		args = append(args, *req.OrderIndex)
		argN++
	}

	if len(fields) == 0 {
		writeError(w, http.StatusBadRequest, "validation_error", "No fields to update")
		return
	}

	fields = append(fields, "updated_at = NOW()")
	args = append(args, initiativeID)

	query := fmt.Sprintf(
		`UPDATE initiatives SET %s WHERE id = $%d
		 RETURNING id, organization_id, title, description, status, priority,
		           start_date, target_date, order_index, created_by, created_at, updated_at`,
		strings.Join(fields, ", "), argN)

	var i initiativeResponse
	err := h.db.QueryRow(r.Context(), query, args...).Scan(
		&i.ID, &i.OrganizationID, &i.Title, &i.Description,
		&i.Status, &i.Priority, &i.StartDate, &i.TargetDate,
		&i.OrderIndex, &i.CreatedBy, &i.CreatedAt, &i.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "Initiative not found")
			return
		}
		slog.Error("initiatives.Update: update failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to update initiative")
		return
	}

	writeJSON(w, http.StatusOK, i)
}

// Delete removes an initiative by ID.
func (h *InitiativeHandlers) Delete(w http.ResponseWriter, r *http.Request) {
	initiativeID := chi.URLParam(r, "initiativeID")

	result, err := h.db.Exec(r.Context(), `DELETE FROM initiatives WHERE id = $1`, initiativeID)
	if err != nil {
		slog.Error("initiatives.Delete: delete failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to delete initiative")
		return
	}

	if result.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "not_found", "Initiative not found")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
