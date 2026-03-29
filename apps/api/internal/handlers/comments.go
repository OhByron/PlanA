package handlers

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/OhByron/ProjectA/internal/auth"
)

// Comment represents a comment row returned to clients.
type Comment struct {
	ID         string          `json:"id"`
	WorkItemID string          `json:"work_item_id"`
	UserID     string          `json:"user_id"`
	Body       json.RawMessage `json:"body"`
	CreatedAt  time.Time       `json:"created_at"`
	UpdatedAt  time.Time       `json:"updated_at"`
}

// CommentHandlers handles threaded comments on work items.
type CommentHandlers struct {
	db *pgxpool.Pool
}

func NewCommentHandlers(db *pgxpool.Pool) *CommentHandlers { return &CommentHandlers{db: db} }

// List returns all comments for a given work item.
func (h *CommentHandlers) List(w http.ResponseWriter, r *http.Request) {
	workItemID := chi.URLParam(r, "workItemID")
	if workItemID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "workItemID is required")
		return
	}

	rows, err := h.db.Query(r.Context(),
		`SELECT id, work_item_id, user_id, body, created_at, updated_at
		 FROM comments WHERE work_item_id = $1 ORDER BY created_at`, workItemID)
	if err != nil {
		slog.Error("comments.List: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list comments")
		return
	}
	defer rows.Close()

	comments := []Comment{}
	for rows.Next() {
		var c Comment
		if err := rows.Scan(&c.ID, &c.WorkItemID, &c.UserID, &c.Body, &c.CreatedAt, &c.UpdatedAt); err != nil {
			slog.Error("comments.List: scan failed", "error", err)
			writeError(w, http.StatusInternalServerError, "db_error", "Failed to read comment row")
			return
		}
		comments = append(comments, c)
	}
	if err := rows.Err(); err != nil {
		slog.Error("comments.List: rows iteration error", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list comments")
		return
	}

	writeJSON(w, http.StatusOK, comments)
}

// createCommentRequest is the JSON body for creating a comment.
type createCommentRequest struct {
	Body json.RawMessage `json:"body"`
}

// Create inserts a new comment under the given work item.
func (h *CommentHandlers) Create(w http.ResponseWriter, r *http.Request) {
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

	var body createCommentRequest
	if !readJSON(w, r, &body) {
		return
	}
	if len(body.Body) == 0 {
		writeError(w, http.StatusBadRequest, "validation_error", "body is required")
		return
	}

	var c Comment
	err := h.db.QueryRow(r.Context(),
		`INSERT INTO comments (work_item_id, user_id, body)
		 VALUES ($1, $2, $3)
		 RETURNING id, work_item_id, user_id, body, created_at, updated_at`,
		workItemID, claims.UserID, body.Body,
	).Scan(&c.ID, &c.WorkItemID, &c.UserID, &c.Body, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		slog.Error("comments.Create: insert failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to create comment")
		return
	}

	writeJSON(w, http.StatusCreated, c)
}

// updateCommentRequest is the JSON body for patching a comment.
type updateCommentRequest struct {
	Body json.RawMessage `json:"body"`
}

// Update patches a comment's body by ID.
func (h *CommentHandlers) Update(w http.ResponseWriter, r *http.Request) {
	commentID := chi.URLParam(r, "commentID")
	if commentID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "commentID is required")
		return
	}

	var body updateCommentRequest
	if !readJSON(w, r, &body) {
		return
	}
	if len(body.Body) == 0 {
		writeError(w, http.StatusBadRequest, "validation_error", "body is required")
		return
	}

	var c Comment
	err := h.db.QueryRow(r.Context(),
		`UPDATE comments SET body = $1, updated_at = NOW()
		 WHERE id = $2
		 RETURNING id, work_item_id, user_id, body, created_at, updated_at`,
		body.Body, commentID,
	).Scan(&c.ID, &c.WorkItemID, &c.UserID, &c.Body, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "Comment not found")
			return
		}
		slog.Error("comments.Update: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to update comment")
		return
	}

	writeJSON(w, http.StatusOK, c)
}

// Delete removes a comment by ID.
func (h *CommentHandlers) Delete(w http.ResponseWriter, r *http.Request) {
	commentID := chi.URLParam(r, "commentID")
	if commentID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "commentID is required")
		return
	}

	tag, err := h.db.Exec(r.Context(), `DELETE FROM comments WHERE id = $1`, commentID)
	if err != nil {
		slog.Error("comments.Delete: exec failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to delete comment")
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "not_found", "Comment not found")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
