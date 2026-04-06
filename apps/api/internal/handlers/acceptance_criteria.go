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

// AcceptanceCriterion represents an acceptance_criteria row returned to clients.
type AcceptanceCriterion struct {
	ID          string    `json:"id"`
	WorkItemID  string    `json:"work_item_id"`
	GivenClause string    `json:"given_clause"`
	WhenClause  string    `json:"when_clause"`
	ThenClause  string    `json:"then_clause"`
	OrderIndex  int       `json:"order_index"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// ACHandlers handles CRUD for BDD acceptance criteria on a work item.
type ACHandlers struct {
	db DBPOOL
}

func NewACHandlers(db DBPOOL) *ACHandlers { return &ACHandlers{db: db} }

// List returns all acceptance criteria for a given work item.
func (h *ACHandlers) List(w http.ResponseWriter, r *http.Request) {
	workItemID := chi.URLParam(r, "workItemID")
	if workItemID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "workItemID is required")
		return
	}

	rows, err := h.db.Query(r.Context(),
		`SELECT id, work_item_id, given_clause, when_clause, then_clause, order_index, created_at, updated_at
		 FROM acceptance_criteria WHERE work_item_id = $1 ORDER BY order_index`, workItemID)
	if err != nil {
		slog.Error("acceptance_criteria.List: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list acceptance criteria")
		return
	}
	defer rows.Close()

	criteria := []AcceptanceCriterion{}
	for rows.Next() {
		var ac AcceptanceCriterion
		if err := rows.Scan(&ac.ID, &ac.WorkItemID, &ac.GivenClause, &ac.WhenClause, &ac.ThenClause, &ac.OrderIndex, &ac.CreatedAt, &ac.UpdatedAt); err != nil {
			slog.Error("acceptance_criteria.List: scan failed", "error", err)
			writeError(w, http.StatusInternalServerError, "db_error", "Failed to read acceptance criterion row")
			return
		}
		criteria = append(criteria, ac)
	}
	if err := rows.Err(); err != nil {
		slog.Error("acceptance_criteria.List: rows iteration error", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list acceptance criteria")
		return
	}

	writeJSON(w, http.StatusOK, criteria)
}

// createACRequest is the JSON body for creating an acceptance criterion.
type createACRequest struct {
	GivenClause string `json:"given_clause"`
	WhenClause  string `json:"when_clause"`
	ThenClause  string `json:"then_clause"`
	OrderIndex  *int   `json:"order_index"`
}

// Create inserts a new acceptance criterion under the given work item.
func (h *ACHandlers) Create(w http.ResponseWriter, r *http.Request) {
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
	projectID := resolveProjectID(r.Context(), h.db, workItemID)
	if projectID == "" || !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	var body createACRequest
	if !readJSON(w, r, &body) {
		return
	}

	orderIndex := 0
	if body.OrderIndex != nil {
		orderIndex = *body.OrderIndex
	}

	var ac AcceptanceCriterion
	err := h.db.QueryRow(r.Context(),
		`INSERT INTO acceptance_criteria (work_item_id, given_clause, when_clause, then_clause, order_index)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, work_item_id, given_clause, when_clause, then_clause, order_index, created_at, updated_at`,
		workItemID, body.GivenClause, body.WhenClause, body.ThenClause, orderIndex,
	).Scan(&ac.ID, &ac.WorkItemID, &ac.GivenClause, &ac.WhenClause, &ac.ThenClause, &ac.OrderIndex, &ac.CreatedAt, &ac.UpdatedAt)
	if err != nil {
		slog.Error("acceptance_criteria.Create: insert failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to create acceptance criterion")
		return
	}

	writeJSON(w, http.StatusCreated, ac)
}

// updateACRequest is the JSON body for patching an acceptance criterion.
type updateACRequest struct {
	GivenClause *string `json:"given_clause"`
	WhenClause  *string `json:"when_clause"`
	ThenClause  *string `json:"then_clause"`
	OrderIndex  *int    `json:"order_index"`
}

// Update patches an acceptance criterion by ID using dynamic SET clause for partial updates.
func (h *ACHandlers) Update(w http.ResponseWriter, r *http.Request) {
	acID := chi.URLParam(r, "acID")
	if acID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "acID is required")
		return
	}

	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	projectID := resolveACProjectID(r.Context(), h.db, acID)
	if projectID == "" || !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	var body updateACRequest
	if !readJSON(w, r, &body) {
		return
	}

	setClauses := []string{}
	args := []any{}
	argPos := 1

	if body.GivenClause != nil {
		setClauses = append(setClauses, fmt.Sprintf("given_clause = $%d", argPos))
		args = append(args, *body.GivenClause)
		argPos++
	}
	if body.WhenClause != nil {
		setClauses = append(setClauses, fmt.Sprintf("when_clause = $%d", argPos))
		args = append(args, *body.WhenClause)
		argPos++
	}
	if body.ThenClause != nil {
		setClauses = append(setClauses, fmt.Sprintf("then_clause = $%d", argPos))
		args = append(args, *body.ThenClause)
		argPos++
	}
	if body.OrderIndex != nil {
		setClauses = append(setClauses, fmt.Sprintf("order_index = $%d", argPos))
		args = append(args, *body.OrderIndex)
		argPos++
	}

	if len(setClauses) == 0 {
		writeError(w, http.StatusBadRequest, "validation_error", "No fields to update")
		return
	}

	setClauses = append(setClauses, "updated_at = NOW()")
	args = append(args, acID)

	query := fmt.Sprintf(
		`UPDATE acceptance_criteria SET %s WHERE id = $%d
		 RETURNING id, work_item_id, given_clause, when_clause, then_clause, order_index, created_at, updated_at`,
		strings.Join(setClauses, ", "), argPos,
	)

	var ac AcceptanceCriterion
	err := h.db.QueryRow(r.Context(), query, args...).Scan(
		&ac.ID, &ac.WorkItemID, &ac.GivenClause, &ac.WhenClause, &ac.ThenClause, &ac.OrderIndex, &ac.CreatedAt, &ac.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "Acceptance criterion not found")
			return
		}
		slog.Error("acceptance_criteria.Update: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to update acceptance criterion")
		return
	}

	writeJSON(w, http.StatusOK, ac)
}

// Delete removes an acceptance criterion by ID.
func (h *ACHandlers) Delete(w http.ResponseWriter, r *http.Request) {
	acID := chi.URLParam(r, "acID")
	if acID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "acID is required")
		return
	}

	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	projectID := resolveACProjectID(r.Context(), h.db, acID)
	if projectID == "" || !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	tag, err := h.db.Exec(r.Context(), `DELETE FROM acceptance_criteria WHERE id = $1`, acID)
	if err != nil {
		slog.Error("acceptance_criteria.Delete: exec failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to delete acceptance criterion")
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "not_found", "Acceptance criterion not found")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
