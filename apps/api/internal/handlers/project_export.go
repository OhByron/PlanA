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

// ProjectExport is the top-level JSON structure for a project export.
type ProjectExport struct {
	Version    string          `json:"version"`
	ExportedAt time.Time       `json:"exported_at"`
	ExportedBy string          `json:"exported_by"`
	Project    json.RawMessage `json:"project"`
	Members    json.RawMessage `json:"members"`
	Epics      json.RawMessage `json:"epics"`
	EpicDeps   json.RawMessage `json:"epic_dependencies"`
	WorkItems  json.RawMessage `json:"work_items"`
	ItemDeps   json.RawMessage `json:"work_item_dependencies"`
	ItemLinks  json.RawMessage `json:"work_item_links"`
	AC         json.RawMessage `json:"acceptance_criteria"`
	Comments   json.RawMessage `json:"comments"`
	Sprints    json.RawMessage `json:"sprints"`
	SprintItems json.RawMessage `json:"sprint_items"`
	SprintDeps json.RawMessage `json:"sprint_dependencies"`
	DodItems   json.RawMessage `json:"dod_items"`
	ItemDod    json.RawMessage `json:"work_item_dod"`
	Impediments json.RawMessage `json:"impediments"`
	DesignAttachments json.RawMessage `json:"design_attachments"`
	StatusChanges json.RawMessage `json:"status_changes"`
}

// Export dumps an entire project and all its children as a single JSON document.
// GET /api/projects/{projectID}/export
func (h *ProjectHandlers) Export(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	ctx := r.Context()

	queryJSON := func(query string, args ...any) json.RawMessage {
		rows, err := h.db.Query(ctx, query, args...)
		if err != nil {
			slog.Warn("export: query failed", "query", query[:50], "error", err)
			return []byte("[]")
		}
		defer rows.Close()

		var results []json.RawMessage
		for rows.Next() {
			var row json.RawMessage
			if err := rows.Scan(&row); err != nil {
				continue
			}
			results = append(results, row)
		}
		if results == nil {
			return []byte("[]")
		}
		out, _ := json.Marshal(results)
		return out
	}

	queryOneJSON := func(query string, args ...any) json.RawMessage {
		var row json.RawMessage
		if err := h.db.QueryRow(ctx, query, args...).Scan(&row); err != nil {
			return []byte("{}")
		}
		return row
	}

	pid := projectID

	export := ProjectExport{
		Version:    "1.0",
		ExportedAt: time.Now().UTC(),
		ExportedBy: claims.UserID,

		Project: queryOneJSON(
			`SELECT to_jsonb(p) - 'ai_api_key' - 'ai_endpoint' FROM projects p WHERE id = $1`, pid),

		Members: queryJSON(
			`SELECT to_jsonb(m) - 'user_id' FROM project_members m WHERE project_id = $1`, pid),

		Epics: queryJSON(
			`SELECT to_jsonb(e) FROM epics e WHERE project_id = $1 ORDER BY order_index`, pid),

		EpicDeps: queryJSON(
			`SELECT to_jsonb(d) FROM epic_dependencies d
			 WHERE source_id IN (SELECT id FROM epics WHERE project_id = $1)`, pid),

		WorkItems: queryJSON(
			`SELECT to_jsonb(w) FROM work_items w WHERE project_id = $1 ORDER BY order_index`, pid),

		ItemDeps: queryJSON(
			`SELECT to_jsonb(d) FROM work_item_dependencies d
			 WHERE source_id IN (SELECT id FROM work_items WHERE project_id = $1)
			    OR target_id IN (SELECT id FROM work_items WHERE project_id = $1)`, pid),

		ItemLinks: queryJSON(
			`SELECT to_jsonb(l) FROM work_item_links l
			 WHERE work_item_id IN (SELECT id FROM work_items WHERE project_id = $1)`, pid),

		AC: queryJSON(
			`SELECT to_jsonb(a) FROM acceptance_criteria a
			 WHERE work_item_id IN (SELECT id FROM work_items WHERE project_id = $1)`, pid),

		Comments: queryJSON(
			`SELECT to_jsonb(c) - 'user_id' FROM comments c
			 WHERE work_item_id IN (SELECT id FROM work_items WHERE project_id = $1)`, pid),

		Sprints: queryJSON(
			`SELECT to_jsonb(s) FROM sprints s WHERE project_id = $1 ORDER BY start_date NULLS LAST`, pid),

		SprintItems: queryJSON(
			`SELECT to_jsonb(si) FROM sprint_items si
			 WHERE sprint_id IN (SELECT id FROM sprints WHERE project_id = $1)`, pid),

		SprintDeps: queryJSON(
			`SELECT to_jsonb(d) FROM sprint_dependencies d
			 WHERE source_id IN (SELECT id FROM sprints WHERE project_id = $1)`, pid),

		DodItems: queryJSON(
			`SELECT to_jsonb(d) FROM dod_items d WHERE project_id = $1`, pid),

		ItemDod: queryJSON(
			`SELECT to_jsonb(wd) FROM work_item_dod wd
			 WHERE work_item_id IN (SELECT id FROM work_items WHERE project_id = $1)`, pid),

		Impediments: queryJSON(
			`SELECT to_jsonb(i) FROM impediments i
			 WHERE work_item_id IN (SELECT id FROM work_items WHERE project_id = $1)`, pid),

		DesignAttachments: queryJSON(
			`SELECT to_jsonb(da) FROM design_attachments da
			 WHERE work_item_id IN (SELECT id FROM work_items WHERE project_id = $1)`, pid),

		StatusChanges: queryJSON(
			`SELECT to_jsonb(sc) FROM status_changes sc
			 WHERE work_item_id IN (SELECT id FROM work_items WHERE project_id = $1)`, pid),
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition",
		fmt.Sprintf(`attachment; filename="project-export-%s.json"`, projectID[:8]))
	json.NewEncoder(w).Encode(export)
}
