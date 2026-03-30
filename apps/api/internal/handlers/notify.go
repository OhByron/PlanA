package handlers

import (
	"context"
	"encoding/json"
	"log/slog"

	"github.com/jackc/pgx/v5/pgxpool"
)

// CreateNotification inserts a notification for a user. Skips silently if userID is empty.
func CreateNotification(ctx context.Context, db *pgxpool.Pool, userID, notifType string, workItemID, actorID *string, data map[string]string) {
	if userID == "" {
		return
	}
	dataJSON, _ := json.Marshal(data)
	_, err := db.Exec(ctx,
		`INSERT INTO notifications (user_id, type, work_item_id, actor_id, data)
		 VALUES ($1, $2, $3, $4, $5)`,
		userID, notifType, workItemID, actorID, dataJSON)
	if err != nil {
		slog.Error("create notification failed", "error", err, "type", notifType, "user_id", userID)
	}
}

// NotifyAssignee creates an 'assigned' notification. Looks up the project_member's user_id.
func NotifyAssignee(ctx context.Context, db *pgxpool.Pool, memberID, workItemTitle, actorUserID string, workItemID string) {
	var userID *string
	_ = db.QueryRow(ctx, `SELECT user_id FROM project_members WHERE id = $1`, memberID).Scan(&userID)
	if userID == nil {
		return // unregistered member — can't notify
	}
	// Don't notify yourself
	if *userID == actorUserID {
		return
	}
	wiID := workItemID
	CreateNotification(ctx, db, *userID, "assigned", &wiID, &actorUserID, map[string]string{
		"title": workItemTitle,
	})
}

// NotifyStatusChange notifies the assignee that the status of their work item changed.
func NotifyStatusChange(ctx context.Context, db *pgxpool.Pool, assigneeMemberID, workItemTitle, newStatus, actorUserID, workItemID string) {
	if assigneeMemberID == "" {
		return
	}
	var userID *string
	_ = db.QueryRow(ctx, `SELECT user_id FROM project_members WHERE id = $1`, assigneeMemberID).Scan(&userID)
	if userID == nil || *userID == actorUserID {
		return
	}
	wiID := workItemID
	CreateNotification(ctx, db, *userID, "status_changed", &wiID, &actorUserID, map[string]string{
		"title":  workItemTitle,
		"status": newStatus,
	})
}

// NotifyComment notifies the assignee that someone commented on their work item.
func NotifyComment(ctx context.Context, db *pgxpool.Pool, assigneeMemberID, workItemTitle, actorUserID, workItemID string) {
	if assigneeMemberID == "" {
		return
	}
	var userID *string
	_ = db.QueryRow(ctx, `SELECT user_id FROM project_members WHERE id = $1`, assigneeMemberID).Scan(&userID)
	if userID == nil || *userID == actorUserID {
		return
	}
	wiID := workItemID
	CreateNotification(ctx, db, *userID, "comment_added", &wiID, &actorUserID, map[string]string{
		"title": workItemTitle,
	})
}
