package handlers

import (
	"log/slog"
	"net/http"
	"time"


	"github.com/OhByron/ProjectA/internal/auth"
)

type NotificationHandlers struct {
	db DBPOOL
}

func NewNotificationHandlers(db DBPOOL) *NotificationHandlers {
	return &NotificationHandlers{db: db}
}

type notificationResponse struct {
	ID         string     `json:"id"`
	UserID     string     `json:"user_id"`
	Type       string     `json:"type"`
	WorkItemID *string    `json:"work_item_id"`
	ActorID    *string    `json:"actor_id"`
	Data       any        `json:"data"`
	ReadAt     *time.Time `json:"read_at"`
	CreatedAt  time.Time  `json:"created_at"`
}

// List returns unread notifications for the current user.
func (h *NotificationHandlers) List(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFromContext(r.Context())

	rows, err := h.db.Query(r.Context(), `
		SELECT id, user_id, type, work_item_id, actor_id, data, read_at, created_at
		FROM notifications
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT 50`, claims.UserID)
	if err != nil {
		slog.Error("notifications.List: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list notifications")
		return
	}
	defer rows.Close()

	notifs := []notificationResponse{}
	for rows.Next() {
		var n notificationResponse
		if err := rows.Scan(&n.ID, &n.UserID, &n.Type, &n.WorkItemID, &n.ActorID, &n.Data, &n.ReadAt, &n.CreatedAt); err != nil {
			slog.Error("notifications.List: scan failed", "error", err)
			writeError(w, http.StatusInternalServerError, "db_error", "Failed to read notification")
			return
		}
		notifs = append(notifs, n)
	}
	if err := rows.Err(); err != nil {
		slog.Error("notifications.List: rows error", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list notifications")
		return
	}

	writeJSON(w, http.StatusOK, notifs)
}

// UnreadCount returns the count of unread notifications.
func (h *NotificationHandlers) UnreadCount(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFromContext(r.Context())

	var count int
	err := h.db.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
		claims.UserID).Scan(&count)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to count notifications")
		return
	}

	writeJSON(w, http.StatusOK, map[string]int{"count": count})
}

// MarkAllRead marks all unread notifications as read.
func (h *NotificationHandlers) MarkAllRead(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFromContext(r.Context())

	_, err := h.db.Exec(r.Context(),
		`UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL`,
		claims.UserID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to mark notifications read")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
