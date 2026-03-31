package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"strings"

	"github.com/jackc/pgx/v5"
)

// CreateNotification inserts a notification for a user. Skips silently if userID is empty.
// Automatically looks up project_id from the work item for navigation links.
func CreateNotification(ctx context.Context, db DBPOOL, userID, notifType string, workItemID, actorID *string, data map[string]string) {
	if userID == "" {
		return
	}
	// Enrich with project_id for frontend navigation
	if workItemID != nil && data["project_id"] == "" {
		var pid string
		if err := db.QueryRow(ctx, `SELECT project_id FROM work_items WHERE id = $1`, *workItemID).Scan(&pid); err == nil {
			data["project_id"] = pid
		}
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

// NotifyAssignee creates an 'assigned' notification. Assignees are stored as
// project_member IDs (not user IDs) because members can exist before registering;
// we resolve to user_id here so the notification reaches the right account.
func NotifyAssignee(ctx context.Context, db DBPOOL, memberID, workItemTitle, actorUserID string, workItemID string) {
	var userID *string
	if err := db.QueryRow(ctx, `SELECT user_id FROM project_members WHERE id = $1`, memberID).Scan(&userID); err != nil && !errors.Is(err, pgx.ErrNoRows) {
		slog.Warn("NotifyAssignee: member→user lookup failed", "memberID", memberID, "error", err)
	}
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
func NotifyStatusChange(ctx context.Context, db DBPOOL, assigneeMemberID, workItemTitle, newStatus, actorUserID, workItemID string) {
	if assigneeMemberID == "" {
		return
	}
	var userID *string
	if err := db.QueryRow(ctx, `SELECT user_id FROM project_members WHERE id = $1`, assigneeMemberID).Scan(&userID); err != nil && !errors.Is(err, pgx.ErrNoRows) {
		slog.Warn("NotifyStatusChange: member→user lookup failed", "memberID", assigneeMemberID, "error", err)
	}
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
func NotifyComment(ctx context.Context, db DBPOOL, assigneeMemberID, workItemTitle, actorUserID, workItemID string) {
	if assigneeMemberID == "" {
		return
	}
	var userID *string
	if err := db.QueryRow(ctx, `SELECT user_id FROM project_members WHERE id = $1`, assigneeMemberID).Scan(&userID); err != nil && !errors.Is(err, pgx.ErrNoRows) {
		slog.Warn("NotifyComment: member→user lookup failed", "memberID", assigneeMemberID, "error", err)
	}
	if userID == nil || *userID == actorUserID {
		return
	}
	wiID := workItemID
	CreateNotification(ctx, db, *userID, "comment_added", &wiID, &actorUserID, map[string]string{
		"title": workItemTitle,
	})
}

// NotifyMentions scans comment text for @name patterns and notifies matching project members.
func NotifyMentions(ctx context.Context, db DBPOOL, projectID, workItemTitle, actorUserID, workItemID string, commentBody json.RawMessage) {
	// Extract plain text from Tiptap JSON
	text := extractText(commentBody)
	if !strings.Contains(text, "@") {
		return
	}

	// Get all project members
	rows, err := db.Query(ctx,
		`SELECT id, user_id, name FROM project_members WHERE project_id = $1 AND user_id IS NOT NULL`, projectID)
	if err != nil {
		return
	}
	defer rows.Close()

	type member struct {
		id     string
		userID string
		name   string
	}
	var members []member
	for rows.Next() {
		var m member
		if err := rows.Scan(&m.id, &m.userID, &m.name); err == nil {
			members = append(members, m)
		}
	}

	wiID := workItemID
	for _, m := range members {
		if m.userID == actorUserID {
			continue
		}
		// Check for @Name or @name (case-insensitive)
		if strings.Contains(strings.ToLower(text), "@"+strings.ToLower(m.name)) {
			CreateNotification(ctx, db, m.userID, "mentioned", &wiID, &actorUserID, map[string]string{
				"title": workItemTitle,
			})
		}
	}
}

// extractText recursively pulls plain text from Tiptap JSON.
func extractText(data json.RawMessage) string {
	var node struct {
		Type    string            `json:"type"`
		Text    string            `json:"text"`
		Content json.RawMessage   `json:"content"`
	}
	if err := json.Unmarshal(data, &node); err != nil {
		// Might be an array
		var arr []json.RawMessage
		if err := json.Unmarshal(data, &arr); err == nil {
			var sb strings.Builder
			for _, item := range arr {
				sb.WriteString(extractText(item))
			}
			return sb.String()
		}
		return string(data)
	}

	if node.Text != "" {
		return node.Text
	}
	if len(node.Content) > 0 {
		var children []json.RawMessage
		if err := json.Unmarshal(node.Content, &children); err == nil {
			var sb strings.Builder
			for _, child := range children {
				sb.WriteString(extractText(child))
				sb.WriteString(" ")
			}
			return sb.String()
		}
	}
	return ""
}
