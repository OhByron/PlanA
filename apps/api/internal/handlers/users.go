package handlers

import (
	"log/slog"
	"net/http"
	"time"


	"github.com/OhByron/ProjectA/internal/auth"
)

// UserHandlers handles requests for the authenticated user's own profile.
type UserHandlers struct {
	db   DBPOOL
	auth *auth.Service
}

func NewUserHandlers(db DBPOOL, authSvc *auth.Service) *UserHandlers {
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

	// Find items assigned to any project_member linked to this user
	// (by user_id match OR email match for admins who aren't formally linked)
	rows, err := h.db.Query(r.Context(), `
		SELECT wi.id, wi.project_id, wi.epic_id, wi.parent_id, wi.type, wi.title, wi.description,
		       wi.status, wi.priority, wi.assignee_id, wi.story_points, wi.labels, wi.order_index,
		       wi.is_blocked, wi.blocked_reason, wi.source_test_result_id, wi.created_by, wi.created_at, wi.updated_at
		  FROM work_items wi
		  JOIN project_members pm ON pm.id = wi.assignee_id
		  JOIN users u ON u.id = $1
		 WHERE (pm.user_id = $1 OR pm.email = u.email)
		   AND wi.status NOT IN ('done', 'cancelled')
		 ORDER BY CASE wi.priority
		     WHEN 'urgent' THEN 0
		     WHEN 'high' THEN 1
		     WHEN 'medium' THEN 2
		     WHEN 'low' THEN 3
		 END, wi.created_at`, claims.UserID)
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
			&wi.IsBlocked, &wi.BlockedReason, &wi.SourceTestResultID, &wi.CreatedBy, &wi.CreatedAt, &wi.UpdatedAt,
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
