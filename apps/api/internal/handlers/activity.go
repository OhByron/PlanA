package handlers

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/OhByron/PlanA/internal/auth"
)

// ActivityHandlers provides the activity feed endpoints.
type ActivityHandlers struct {
	db DBPOOL
}

func NewActivityHandlers(db DBPOOL) *ActivityHandlers {
	return &ActivityHandlers{db: db}
}

type ActivityEntry struct {
	ID           string          `json:"id"`
	ProjectID    string          `json:"project_id"`
	WorkItemID   *string         `json:"work_item_id"`
	SprintID     *string         `json:"sprint_id"`
	EpicID       *string         `json:"epic_id"`
	ActorID      string          `json:"actor_id"`
	ActorName    string          `json:"actor_name"`
	ActorAvatar  *string         `json:"actor_avatar"`
	EventType    string          `json:"event_type"`
	Changes      json.RawMessage `json:"changes"`
	CreatedAt    time.Time       `json:"created_at"`
}

// ListByProject returns the activity feed for a project.
// GET /api/projects/{projectID}/activity
func (h *ActivityHandlers) ListByProject(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	pp := parsePagination(r)

	// Optional filters
	where := "WHERE a.project_id = $1"
	args := []any{projectID}
	argN := 2

	if v := r.URL.Query().Get("work_item_id"); v != "" {
		where += fmt.Sprintf(" AND a.work_item_id = $%d", argN)
		args = append(args, v)
		argN++
	}
	if v := r.URL.Query().Get("event_type"); v != "" {
		where += fmt.Sprintf(" AND a.event_type = $%d", argN)
		args = append(args, v)
		argN++
	}
	if v := r.URL.Query().Get("actor_id"); v != "" {
		where += fmt.Sprintf(" AND a.actor_id = $%d", argN)
		args = append(args, v)
		argN++
	}

	var total int
	_ = h.db.QueryRow(r.Context(),
		"SELECT COUNT(*) FROM activity_log a "+where, args...).Scan(&total)

	query := fmt.Sprintf(`SELECT a.id, a.project_id, a.work_item_id, a.sprint_id, a.epic_id,
		a.actor_id, u.name, u.avatar_url, a.event_type, a.changes, a.created_at
	 FROM activity_log a
	 JOIN users u ON u.id = a.actor_id
	 %s ORDER BY a.created_at DESC LIMIT $%d OFFSET $%d`,
		where, argN, argN+1)
	args = append(args, pp.PageSize, pp.Offset)

	rows, err := h.db.Query(r.Context(), query, args...)
	if err != nil {
		slog.Error("activity.ListByProject: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list activity")
		return
	}
	defer rows.Close()

	entries := []ActivityEntry{}
	for rows.Next() {
		var e ActivityEntry
		if err := rows.Scan(&e.ID, &e.ProjectID, &e.WorkItemID, &e.SprintID, &e.EpicID,
			&e.ActorID, &e.ActorName, &e.ActorAvatar, &e.EventType, &e.Changes, &e.CreatedAt); err != nil {
			slog.Error("activity.ListByProject: scan failed", "error", err)
			continue
		}
		entries = append(entries, e)
	}

	writeJSON(w, http.StatusOK, paginatedResponse{Items: entries, Total: total, Page: pp.Page, PageSize: pp.PageSize})
}

// ListByWorkItem returns activity for a specific work item.
// GET /api/work-items/{workItemID}/activity
func (h *ActivityHandlers) ListByWorkItem(w http.ResponseWriter, r *http.Request) {
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

	rows, err := h.db.Query(r.Context(),
		`SELECT a.id, a.project_id, a.work_item_id, a.sprint_id, a.epic_id,
			a.actor_id, u.name, u.avatar_url, a.event_type, a.changes, a.created_at
		 FROM activity_log a
		 JOIN users u ON u.id = a.actor_id
		 WHERE a.work_item_id = $1
		 ORDER BY a.created_at DESC
		 LIMIT 50`, workItemID)
	if err != nil {
		slog.Error("activity.ListByWorkItem: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list activity")
		return
	}
	defer rows.Close()

	entries := []ActivityEntry{}
	for rows.Next() {
		var e ActivityEntry
		if err := rows.Scan(&e.ID, &e.ProjectID, &e.WorkItemID, &e.SprintID, &e.EpicID,
			&e.ActorID, &e.ActorName, &e.ActorAvatar, &e.EventType, &e.Changes, &e.CreatedAt); err != nil {
			slog.Error("activity.ListByWorkItem: scan failed", "error", err)
			continue
		}
		entries = append(entries, e)
	}

	writeJSON(w, http.StatusOK, entries)
}

// LogActivity is a helper that inserts an activity log entry.
// Called by other handlers after successful mutations.
func LogActivity(ctx interface {
	Value(any) any
	Deadline() (time.Time, bool)
	Done() <-chan struct{}
	Err() error
}, db DBPOOL, projectID string, workItemID, sprintID, epicID *string, actorID, eventType string, changes map[string]any) {
	changesJSON, _ := json.Marshal(changes)
	_, err := db.Exec(ctx,
		`INSERT INTO activity_log (project_id, work_item_id, sprint_id, epic_id, actor_id, event_type, changes)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		projectID, workItemID, sprintID, epicID, actorID, eventType, changesJSON)
	if err != nil {
		slog.Error("LogActivity: insert failed", "error", err, "event", eventType)
	}
}
