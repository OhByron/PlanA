package handlers

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/OhByron/ProjectA/internal/auth"
)

type EstimationHandlers struct{ db DBPOOL }

func NewEstimationHandlers(db DBPOOL) *EstimationHandlers {
	return &EstimationHandlers{db: db}
}

type voteResponse struct {
	ID         string    `json:"id"`
	MemberID   string    `json:"member_id"`
	MemberName string    `json:"member_name"`
	Value      int       `json:"value"`
	CreatedAt  time.Time `json:"created_at"`
}

type voteRequest struct {
	Value int `json:"value"`
}

// List returns all votes for a work item.
// GET /api/work-items/{workItemID}/votes
func (h *EstimationHandlers) List(w http.ResponseWriter, r *http.Request) {
	workItemID := chi.URLParam(r, "workItemID")

	rows, err := h.db.Query(r.Context(), `
		SELECT v.id, v.member_id, pm.name, v.value, v.created_at
		FROM estimation_votes v
		JOIN project_members pm ON pm.id = v.member_id
		WHERE v.work_item_id = $1
		ORDER BY v.created_at`, workItemID)
	if err != nil {
		slog.Error("estimation.List: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list votes")
		return
	}
	defer rows.Close()

	votes := []voteResponse{}
	for rows.Next() {
		var v voteResponse
		if err := rows.Scan(&v.ID, &v.MemberID, &v.MemberName, &v.Value, &v.CreatedAt); err != nil {
			continue
		}
		votes = append(votes, v)
	}

	writeJSON(w, http.StatusOK, votes)
}

// Vote casts or updates the current user's vote on a work item.
// POST /api/work-items/{workItemID}/votes
func (h *EstimationHandlers) Vote(w http.ResponseWriter, r *http.Request) {
	workItemID := chi.URLParam(r, "workItemID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	projectID := resolveProjectID(r.Context(), h.db, workItemID)
	if projectID == "" || !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	var body voteRequest
	if !readJSON(w, r, &body) {
		return
	}

	// Find the member ID for this user in this project
	var memberID string
	err := h.db.QueryRow(r.Context(),
		`SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2`,
		projectID, claims.UserID).Scan(&memberID)
	if err != nil {
		writeError(w, http.StatusForbidden, "not_member", "You are not a member of this project")
		return
	}

	// Upsert the vote
	var v voteResponse
	err = h.db.QueryRow(r.Context(), `
		INSERT INTO estimation_votes (work_item_id, member_id, value)
		VALUES ($1, $2, $3)
		ON CONFLICT (work_item_id, member_id)
		DO UPDATE SET value = $3, created_at = NOW()
		RETURNING id, member_id, value, created_at`,
		workItemID, memberID, body.Value,
	).Scan(&v.ID, &v.MemberID, &v.Value, &v.CreatedAt)
	if err != nil {
		slog.Error("estimation.Vote: upsert failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to record vote")
		return
	}

	// Fetch member name for response
	h.db.QueryRow(r.Context(), `SELECT name FROM project_members WHERE id = $1`, memberID).Scan(&v.MemberName)

	writeJSON(w, http.StatusOK, v)
}

// Lock accepts the final estimate and writes it to story_points, then clears votes.
// POST /api/work-items/{workItemID}/votes/lock
func (h *EstimationHandlers) Lock(w http.ResponseWriter, r *http.Request) {
	workItemID := chi.URLParam(r, "workItemID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	projectID := resolveProjectID(r.Context(), h.db, workItemID)
	if projectID == "" || !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	var body struct {
		Value int `json:"value"`
	}
	if !readJSON(w, r, &body) {
		return
	}

	// Set story_points and clear votes
	_, err := h.db.Exec(r.Context(),
		`UPDATE work_items SET story_points = $1, updated_at = NOW() WHERE id = $2`,
		body.Value, workItemID)
	if err != nil {
		slog.Error("estimation.Lock: update failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to lock estimate")
		return
	}

	// Clear all votes for this item
	h.db.Exec(r.Context(), `DELETE FROM estimation_votes WHERE work_item_id = $1`, workItemID)

	writeJSON(w, http.StatusOK, map[string]any{"story_points": body.Value, "votes_cleared": true})
}

// Reset clears all votes for a work item without locking.
// DELETE /api/work-items/{workItemID}/votes
func (h *EstimationHandlers) Reset(w http.ResponseWriter, r *http.Request) {
	workItemID := chi.URLParam(r, "workItemID")

	h.db.Exec(r.Context(), `DELETE FROM estimation_votes WHERE work_item_id = $1`, workItemID)
	w.WriteHeader(http.StatusNoContent)
}
