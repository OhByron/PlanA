package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// DBPOOL abstracts the pgxpool.Pool methods used by handlers.
// *pgxpool.Pool satisfies this interface implicitly.
type DBPOOL interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Begin(ctx context.Context) (pgx.Tx, error)
}

// EventPublishFunc is a function that publishes a real-time event to a channel.
// Handlers receive this as a dependency to emit events without importing the realtime package.
type EventPublishFunc func(channel string, eventType string, payload map[string]string)

// checkProjectAccess verifies the user is a project member or org admin.
// Returns nil if access is granted, or writes a 403 and returns an error.
func checkProjectAccess(ctx context.Context, db DBPOOL, projectID, userID string) error {
	var exists bool
	err := db.QueryRow(ctx,
		`SELECT EXISTS(
			SELECT 1 FROM project_members pm WHERE pm.project_id = $1 AND pm.user_id = $2
			UNION ALL
			SELECT 1 FROM organization_members om
			  JOIN teams t ON t.organization_id = om.organization_id
			  JOIN projects p ON p.team_id = t.id
			  WHERE p.id = $1 AND om.user_id = $2 AND om.role = 'admin'
		)`, projectID, userID,
	).Scan(&exists)
	if err != nil || !exists {
		return fmt.Errorf("access denied")
	}
	return nil
}

// requireProjectAccess checks access and writes a 403 if denied. Returns true if access is granted.
func requireProjectAccess(ctx context.Context, db DBPOOL, w http.ResponseWriter, projectID, userID string) bool {
	if err := checkProjectAccess(ctx, db, projectID, userID); err != nil {
		writeError(w, http.StatusForbidden, "forbidden", "You do not have access to this project")
		return false
	}
	return true
}

// resolveProjectID looks up the project_id for a work item. Returns empty string if not found.
func resolveProjectID(ctx context.Context, db DBPOOL, workItemID string) string {
	var projectID string
	if err := db.QueryRow(ctx, `SELECT project_id FROM work_items WHERE id = $1`, workItemID).Scan(&projectID); err != nil && !errors.Is(err, pgx.ErrNoRows) {
		slog.Warn("resolveProjectID: lookup failed", "workItemID", workItemID, "error", err)
	}
	return projectID
}

// resolveSprintProjectID looks up the project_id for a sprint. Returns empty string if not found.
func resolveSprintProjectID(ctx context.Context, db DBPOOL, sprintID string) string {
	var projectID string
	if err := db.QueryRow(ctx, `SELECT project_id FROM sprints WHERE id = $1`, sprintID).Scan(&projectID); err != nil && !errors.Is(err, pgx.ErrNoRows) {
		slog.Warn("resolveSprintProjectID: lookup failed", "sprintID", sprintID, "error", err)
	}
	return projectID
}

// resolveEpicProjectID looks up the project_id for an epic. Returns empty string if not found.
func resolveEpicProjectID(ctx context.Context, db DBPOOL, epicID string) string {
	var projectID string
	if err := db.QueryRow(ctx, `SELECT project_id FROM epics WHERE id = $1`, epicID).Scan(&projectID); err != nil && !errors.Is(err, pgx.ErrNoRows) {
		slog.Warn("resolveEpicProjectID: lookup failed", "epicID", epicID, "error", err)
	}
	return projectID
}

// resolveCommentProjectID looks up the project_id for a comment (via its work item). Returns empty string if not found.
func resolveCommentProjectID(ctx context.Context, db DBPOOL, commentID string) string {
	var projectID string
	if err := db.QueryRow(ctx,
		`SELECT wi.project_id FROM comments c JOIN work_items wi ON wi.id = c.work_item_id WHERE c.id = $1`, commentID).Scan(&projectID); err != nil && !errors.Is(err, pgx.ErrNoRows) {
		slog.Warn("resolveCommentProjectID: lookup failed", "commentID", commentID, "error", err)
	}
	return projectID
}

// resolveACProjectID looks up the project_id for an acceptance criterion (via its work item). Returns empty string if not found.
func resolveACProjectID(ctx context.Context, db DBPOOL, acID string) string {
	var projectID string
	if err := db.QueryRow(ctx,
		`SELECT wi.project_id FROM acceptance_criteria ac JOIN work_items wi ON wi.id = ac.work_item_id WHERE ac.id = $1`, acID).Scan(&projectID); err != nil && !errors.Is(err, pgx.ErrNoRows) {
		slog.Warn("resolveACProjectID: lookup failed", "acID", acID, "error", err)
	}
	return projectID
}

// resolveDependencyProjectID looks up the project_id for a dependency (via its source work item). Returns empty string if not found.
func resolveDependencyProjectID(ctx context.Context, db DBPOOL, depID string) string {
	var projectID string
	if err := db.QueryRow(ctx,
		`SELECT wi.project_id FROM work_item_dependencies d JOIN work_items wi ON wi.id = d.source_id WHERE d.id = $1`, depID).Scan(&projectID); err != nil && !errors.Is(err, pgx.ErrNoRows) {
		slog.Warn("resolveDependencyProjectID: lookup failed", "depID", depID, "error", err)
	}
	return projectID
}

// resolveLinkProjectID looks up the project_id for a link (via its work item). Returns empty string if not found.
func resolveLinkProjectID(ctx context.Context, db DBPOOL, linkID string) string {
	var projectID string
	if err := db.QueryRow(ctx,
		`SELECT wi.project_id FROM work_item_links l JOIN work_items wi ON wi.id = l.work_item_id WHERE l.id = $1`, linkID).Scan(&projectID); err != nil && !errors.Is(err, pgx.ErrNoRows) {
		slog.Warn("resolveLinkProjectID: lookup failed", "linkID", linkID, "error", err)
	}
	return projectID
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeNotImplemented(w http.ResponseWriter) {
	writeJSON(w, http.StatusNotImplemented, map[string]string{
		"code":    "not_implemented",
		"message": "This endpoint is not yet implemented",
	})
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]string{"code": code, "message": message})
}

// readJSON decodes a JSON request body into v. Returns false and writes an
// error response if decoding fails.
func readJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "Invalid or malformed JSON body")
		return false
	}
	return true
}

var nonAlphaNum = regexp.MustCompile(`[^a-z0-9]+`)

// slugify converts a name into a URL-safe slug.
func slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = nonAlphaNum.ReplaceAllString(s, "-")
	return strings.Trim(s, "-")
}
