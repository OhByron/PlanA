package handlers

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/OhByron/ProjectA/internal/auth"
)

// UserHandlers handles requests for the authenticated user's own profile.
type UserHandlers struct {
	db   *pgxpool.Pool
	auth *auth.Service
}

func NewUserHandlers(db *pgxpool.Pool, authSvc *auth.Service) *UserHandlers {
	return &UserHandlers{db: db, auth: authSvc}
}

type meResponse struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	AvatarURL *string   `json:"avatar_url"`
	CreatedAt time.Time `json:"created_at"`
}

// Me returns the profile of the currently authenticated user.
func (h *UserHandlers) Me(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFromContext(r.Context())

	var resp meResponse
	err := h.db.QueryRow(r.Context(), `
		SELECT id, email, name, avatar_url, created_at
		FROM users
		WHERE id = $1
	`, claims.UserID).Scan(&resp.ID, &resp.Email, &resp.Name, &resp.AvatarURL, &resp.CreatedAt)
	if err != nil {
		slog.Error("me: db query failed", "error", err, "user_id", claims.UserID)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to fetch user profile")
		return
	}

	writeJSON(w, http.StatusOK, resp)
}

// MyWorkItems returns all active work items assigned to the current user.
func (h *UserHandlers) MyWorkItems(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFromContext(r.Context())

	rows, err := h.db.Query(r.Context(), `
		SELECT id, project_id, epic_id, parent_id, type, title, description,
		       status, priority, assignee_id, story_points, labels, order_index,
		       is_blocked, blocked_reason, created_by, created_at, updated_at
		  FROM work_items
		 WHERE assignee_id = $1
		   AND status NOT IN ('done', 'cancelled')
		 ORDER BY CASE priority
		     WHEN 'urgent' THEN 0
		     WHEN 'high' THEN 1
		     WHEN 'medium' THEN 2
		     WHEN 'low' THEN 3
		 END, created_at`, claims.UserID)
	if err != nil {
		slog.Error("users.MyWorkItems: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list work items")
		return
	}
	defer rows.Close()

	items := []WorkItem{}
	for rows.Next() {
		var wi WorkItem
		if err := rows.Scan(
			&wi.ID, &wi.ProjectID, &wi.EpicID, &wi.ParentID, &wi.Type, &wi.Title, &wi.Description,
			&wi.Status, &wi.Priority, &wi.AssigneeID, &wi.StoryPoints, &wi.Labels, &wi.OrderIndex,
			&wi.IsBlocked, &wi.BlockedReason, &wi.CreatedBy, &wi.CreatedAt, &wi.UpdatedAt,
		); err != nil {
			slog.Error("users.MyWorkItems: scan failed", "error", err)
			writeError(w, http.StatusInternalServerError, "db_error", "Failed to read work item row")
			return
		}
		if wi.Labels == nil {
			wi.Labels = []string{}
		}
		items = append(items, wi)
	}
	if err := rows.Err(); err != nil {
		slog.Error("users.MyWorkItems: rows iteration error", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list work items")
		return
	}

	writeJSON(w, http.StatusOK, items)
}
