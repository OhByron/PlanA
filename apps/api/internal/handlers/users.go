package handlers

import (
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/OhByron/PlanA/internal/auth"
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
	Language  *string   `json:"language"`
	CreatedAt time.Time `json:"created_at"`
}

// Me returns the profile of the currently authenticated user.
func (h *UserHandlers) Me(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	var resp meResponse
	err := h.db.QueryRow(r.Context(), `
		SELECT id, email, name, avatar_url, language, created_at
		FROM users
		WHERE id = $1
	`, claims.UserID).Scan(&resp.ID, &resp.Email, &resp.Name, &resp.AvatarURL, &resp.Language, &resp.CreatedAt)
	if err != nil {
		slog.Error("me: db query failed", "error", err, "user_id", claims.UserID)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to fetch user profile")
		return
	}

	writeJSON(w, http.StatusOK, resp)
}

// MyWorkItems returns all active work items assigned to the current user.
func (h *UserHandlers) MyWorkItems(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	// Find items assigned to any project_member linked to this user
	// (by user_id match OR email match for admins who aren't formally linked)
	rows, err := h.db.Query(r.Context(), fmt.Sprintf(`
		SELECT %s
		  FROM work_items wi
		  JOIN workflow_states ws ON ws.id = wi.workflow_state_id
		  JOIN project_members pm ON pm.id = wi.assignee_id
		  JOIN users u ON u.id = $1
		 WHERE (pm.user_id = $1 OR pm.email = u.email)
		   AND wi.is_cancelled = FALSE AND ws.is_terminal = FALSE
		 ORDER BY CASE wi.priority
		     WHEN 'urgent' THEN 0
		     WHEN 'high' THEN 1
		     WHEN 'medium' THEN 2
		     WHEN 'low' THEN 3
		 END, wi.created_at`, workItemColumns), claims.UserID)
	if err != nil {
		slog.Error("users.MyWorkItems: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list work items")
		return
	}
	defer rows.Close()

	items := []WorkItem{}
	for rows.Next() {
		wi, err := scanWorkItem(rows)
		if err != nil {
			slog.Error("users.MyWorkItems: scan failed", "error", err)
			writeError(w, http.StatusInternalServerError, "db_error", "Failed to read work item row")
			return
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

// UpdatePreferences updates the current user's preferences (e.g., daily digest opt-in).
// PATCH /api/me/preferences
func (h *UserHandlers) UpdatePreferences(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	var body struct {
		DailyDigest *bool   `json:"daily_digest"`
		Language    *string `json:"language"`
	}
	if !readJSON(w, r, &body) {
		return
	}

	if body.DailyDigest != nil {
		_, err := h.db.Exec(r.Context(),
			`UPDATE users SET daily_digest = $1 WHERE id = $2`,
			*body.DailyDigest, claims.UserID)
		if err != nil {
			slog.Error("users.UpdatePreferences: update failed", "error", err)
			writeError(w, http.StatusInternalServerError, "db_error", "Failed to update preferences")
			return
		}
	}

	if body.Language != nil {
		_, err := h.db.Exec(r.Context(),
			`UPDATE users SET language = $1 WHERE id = $2`,
			nilIfEmpty(*body.Language), claims.UserID)
		if err != nil {
			slog.Error("users.UpdatePreferences: language update failed", "error", err)
			writeError(w, http.StatusInternalServerError, "db_error", "Failed to update language preference")
			return
		}
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}
