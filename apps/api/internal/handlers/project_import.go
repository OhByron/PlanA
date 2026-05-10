package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/OhByron/PlanA/internal/auth"
)

type importRequest struct {
	TeamID     string `json:"team_id"`
	AsTemplate bool   `json:"as_template"` // strip assignees, reset statuses, clear dates
}

// Import creates a new project from an exported JSON document.
// POST /api/orgs/{orgID}/teams/{teamID}/projects/import
func (h *ProjectHandlers) Import(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "orgID")
	teamID := chi.URLParam(r, "teamID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !requireOrgAdmin(r.Context(), h.db, w, orgID, claims.UserID) {
		return
	}

	// Read multipart or raw JSON body
	var export ProjectExport
	body, err := io.ReadAll(io.LimitReader(r.Body, 50*1024*1024)) // 50MB limit
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_error", "Failed to read request body")
		return
	}

	// Check if this is a wrapped request (with team_id + file) or raw export JSON
	var wrapper struct {
		TeamID     string          `json:"team_id"`
		AsTemplate bool            `json:"as_template"`
		Data       json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(body, &wrapper); err == nil && wrapper.Data != nil {
		if err := json.Unmarshal(wrapper.Data, &export); err != nil {
			writeError(w, http.StatusBadRequest, "validation_error", "Invalid export data: "+err.Error())
			return
		}
		if wrapper.TeamID != "" {
			teamID = wrapper.TeamID
		}
	} else {
		if err := json.Unmarshal(body, &export); err != nil {
			writeError(w, http.StatusBadRequest, "validation_error", "Invalid export JSON: "+err.Error())
			return
		}
	}

	asTemplate := wrapper.AsTemplate

	if export.Version == "" || export.Project == nil {
		writeError(w, http.StatusBadRequest, "validation_error", "Missing version or project data")
		return
	}

	// Verify the (possibly body-overridden) teamID belongs to the URL orgID
	// so requireOrgAdmin's check still binds the import to that org.
	var teamOrgID string
	if err := h.db.QueryRow(r.Context(),
		`SELECT organization_id FROM teams WHERE id = $1`, teamID,
	).Scan(&teamOrgID); err != nil || teamOrgID != orgID {
		writeError(w, http.StatusNotFound, "not_found", "Team not found in this organization")
		return
	}

	ctx := r.Context()
	tx, err := h.db.Begin(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to start transaction")
		return
	}
	defer tx.Rollback(ctx)

	// UUID remapping: old ID → new ID
	idMap := make(map[string]string)

	remap := func(oldID string) string {
		if oldID == "" {
			return ""
		}
		if newID, ok := idMap[oldID]; ok {
			return newID
		}
		var newID string
		tx.QueryRow(ctx, `SELECT gen_random_uuid()::text`).Scan(&newID)
		idMap[oldID] = newID
		return newID
	}

	remapNullable := func(oldID *string) *string {
		if oldID == nil || *oldID == "" {
			return nil
		}
		v := remap(*oldID)
		return &v
	}

	// Helper to parse a JSON array of objects
	parseArray := func(raw json.RawMessage) []map[string]interface{} {
		var arr []map[string]interface{}
		if raw == nil {
			return nil
		}
		json.Unmarshal(raw, &arr)
		return arr
	}

	getString := func(m map[string]interface{}, key string) string {
		v, _ := m[key].(string)
		return v
	}
	getStringPtr := func(m map[string]interface{}, key string) *string {
		v, ok := m[key].(string)
		if !ok || v == "" {
			return nil
		}
		return &v
	}

	// --- 1. Create the project ---
	var projData map[string]interface{}
	json.Unmarshal(export.Project, &projData)

	projName := getString(projData, "name") + " (imported)"
	if asTemplate {
		projName = getString(projData, "name") + " (template)"
	}
	slug := slugify(projName)

	var newProjectID string
	err = tx.QueryRow(ctx,
		`INSERT INTO projects (team_id, name, slug, description, methodology, status,
			sprint_duration_weeks, default_project_months, default_epic_weeks)
		 VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, $8)
		 RETURNING id`,
		teamID, projName, slug,
		getStringPtr(projData, "description"),
		getString(projData, "methodology"),
		intOrDefault(projData, "sprint_duration_weeks", 2),
		intOrDefault(projData, "default_project_months", 6),
		intOrDefault(projData, "default_epic_weeks", 6),
	).Scan(&newProjectID)
	if err != nil {
		slog.Error("import: create project failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to create project")
		return
	}

	// Map old project ID
	if oldPID := getString(projData, "id"); oldPID != "" {
		idMap[oldPID] = newProjectID
	}

	// Add importer as PM
	tx.Exec(ctx,
		`INSERT INTO project_members (project_id, user_id, name, email, job_role)
		 SELECT $1, id, name, email, 'pm' FROM users WHERE id = $2
		 ON CONFLICT DO NOTHING`,
		newProjectID, claims.UserID)

	// --- 2. Import members (without user_id linkage) ---
	for _, m := range parseArray(export.Members) {
		newMemberID := remap(getString(m, "id"))
		tx.Exec(ctx,
			`INSERT INTO project_members (id, project_id, name, email, phone, job_role, capacity)
			 VALUES ($1, $2, $3, $4, $5, $6, $7)
			 ON CONFLICT DO NOTHING`,
			newMemberID, newProjectID,
			getString(m, "name"), getStringPtr(m, "email"), getStringPtr(m, "phone"),
			getString(m, "job_role"), intOrDefault(m, "capacity", 0),
		)
	}

	// --- 3. Import epics ---
	var itemCounter int
	for _, e := range parseArray(export.Epics) {
		itemCounter++
		newEpicID := remap(getString(e, "id"))
		status := getString(e, "status")
		if asTemplate {
			status = "open"
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO epics (id, project_id, title, description, status, priority, order_index,
				start_date, due_date, created_by, item_number)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9::date, $10, $11)`,
			newEpicID, newProjectID,
			getString(e, "title"), getStringPtr(e, "description"),
			status, getString(e, "priority"),
			floatOrDefault(e, "order_index", 0),
			nilIfTemplate(asTemplate, getStringPtr(e, "start_date")),
			nilIfTemplate(asTemplate, getStringPtr(e, "due_date")),
			claims.UserID, itemCounter,
		); err != nil {
			slog.Error("import: epic insert failed", "title", getString(e, "title"), "error", err)
			writeError(w, http.StatusInternalServerError, "db_error", "Failed to import epic: "+err.Error())
			return
		}
	}

	// --- 4. Import epic dependencies ---
	for _, d := range parseArray(export.EpicDeps) {
		tx.Exec(ctx,
			`INSERT INTO epic_dependencies (id, source_id, target_id, type, strength, created_by)
			 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
			 ON CONFLICT DO NOTHING`,
			remap(getString(d, "source_id")), remap(getString(d, "target_id")),
			getString(d, "type"), getString(d, "strength"), claims.UserID,
		)
	}

	// --- 5. Import work items ---
	// Two passes: parents first (no parent_id), then children.
	// This avoids FK violations when a child is ordered before its parent.
	allWorkItems := parseArray(export.WorkItems)
	parents := make([]map[string]interface{}, 0, len(allWorkItems))
	children := make([]map[string]interface{}, 0)
	for _, wi := range allWorkItems {
		if getStringPtr(wi, "parent_id") == nil || getString(wi, "parent_id") == "" {
			parents = append(parents, wi)
		} else {
			children = append(children, wi)
		}
	}
	orderedItems := append(parents, children...)
	for _, wi := range orderedItems {
		itemCounter++
		newItemID := remap(getString(wi, "id"))
		// Resolve workflow state: use slug from export, or initial state for templates
		stateSlug := getString(wi, "state_slug")
		if stateSlug == "" {
			stateSlug = getString(wi, "status") // backwards compat with old exports
		}
		assignee := remapNullable(getStringPtr(wi, "assignee_id"))
		if asTemplate {
			stateSlug = "backlog"
			assignee = nil
		}
		// Look up the workflow_state_id by slug for this org
		var stateID string
		if err := tx.QueryRow(ctx,
			`SELECT ws.id FROM workflow_states ws
			 JOIN teams t ON t.organization_id = ws.org_id
			 JOIN projects p ON p.team_id = t.id
			 WHERE p.id = $1 AND ws.slug = $2`, newProjectID, stateSlug,
		).Scan(&stateID); err != nil {
			// Fall back to initial state
			_ = tx.QueryRow(ctx,
				`SELECT ws.id FROM workflow_states ws
				 JOIN teams t ON t.organization_id = ws.org_id
				 JOIN projects p ON p.team_id = t.id
				 WHERE p.id = $1 AND ws.is_initial = true`, newProjectID,
			).Scan(&stateID)
		}
		isCancelled := getString(wi, "status") == "cancelled"
		if _, err := tx.Exec(ctx,
			`INSERT INTO work_items (id, project_id, epic_id, parent_id, type, title, description,
				workflow_state_id, is_cancelled, priority, assignee_id, story_points, points_used, labels, order_index,
				start_date, due_date, pre_conditions, post_conditions,
				is_blocked, blocked_reason, created_by, item_number)
			 VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, $14::text[], $15,
				$16::date, $17::date, $18::jsonb, $19::jsonb, false, NULL, $20, $21)`,
			newItemID, newProjectID,
			remapNullable(getStringPtr(wi, "epic_id")),
			remapNullable(getStringPtr(wi, "parent_id")),
			getString(wi, "type"), getString(wi, "title"),
			rawJSONOrNull(wi, "description"),
			stateID, isCancelled, getString(wi, "priority"),
			assignee,
			intPtrOrNil(wi, "story_points"),
			intPtrOrNil(wi, "points_used"),
			stringArrayOrEmpty(wi, "labels"),
			floatOrDefault(wi, "order_index", 0),
			nilIfTemplate(asTemplate, getStringPtr(wi, "start_date")),
			nilIfTemplate(asTemplate, getStringPtr(wi, "due_date")),
			rawJSONOrNull(wi, "pre_conditions"),
			rawJSONOrNull(wi, "post_conditions"),
			claims.UserID, itemCounter,
		); err != nil {
			slog.Error("import: work item insert failed", "title", getString(wi, "title"), "error", err)
			writeError(w, http.StatusInternalServerError, "db_error", "Failed to import work item: "+err.Error())
			return
		}
	}

	// --- 6. Import work item dependencies ---
	for _, d := range parseArray(export.ItemDeps) {
		tx.Exec(ctx,
			`INSERT INTO work_item_dependencies (id, source_id, target_id, type, strength, created_by)
			 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
			 ON CONFLICT DO NOTHING`,
			remap(getString(d, "source_id")), remap(getString(d, "target_id")),
			getString(d, "type"), getString(d, "strength"), claims.UserID,
		)
	}

	// --- 7. Import work item links ---
	for _, l := range parseArray(export.ItemLinks) {
		tx.Exec(ctx,
			`INSERT INTO work_item_links (id, work_item_id, label, url)
			 VALUES (gen_random_uuid(), $1, $2, $3)`,
			remap(getString(l, "work_item_id")), getString(l, "label"), getString(l, "url"),
		)
	}

	// --- 8. Import acceptance criteria ---
	for _, a := range parseArray(export.AC) {
		tx.Exec(ctx,
			`INSERT INTO acceptance_criteria (id, work_item_id, given_clause, when_clause, then_clause, order_index)
			 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)`,
			remap(getString(a, "work_item_id")),
			getString(a, "given_clause"), getString(a, "when_clause"), getString(a, "then_clause"),
			floatOrDefault(a, "order_index", 0),
		)
	}

	// --- 9. Import sprints (skip if template) ---
	if !asTemplate {
		for _, s := range parseArray(export.Sprints) {
			newSprintID := remap(getString(s, "id"))
			tx.Exec(ctx,
				`INSERT INTO sprints (id, project_id, name, goal, start_date, end_date, status, velocity)
				 VALUES ($1, $2, $3, $4, $5::date, $6::date, $7, $8)`,
				newSprintID, newProjectID,
				getString(s, "name"), getStringPtr(s, "goal"),
				getStringPtr(s, "start_date"), getStringPtr(s, "end_date"),
				getString(s, "status"), intPtrOrNil(s, "velocity"),
			)
		}
		for _, si := range parseArray(export.SprintItems) {
			tx.Exec(ctx,
				`INSERT INTO sprint_items (sprint_id, work_item_id, order_index)
				 VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
				remap(getString(si, "sprint_id")), remap(getString(si, "work_item_id")),
				floatOrDefault(si, "order_index", 0),
			)
		}
		for _, d := range parseArray(export.SprintDeps) {
			tx.Exec(ctx,
				`INSERT INTO sprint_dependencies (id, source_id, target_id, type, strength, created_by)
				 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
				remap(getString(d, "source_id")), remap(getString(d, "target_id")),
				getString(d, "type"), getString(d, "strength"), claims.UserID,
			)
		}
	}

	// --- 10. Import DoD items ---
	for _, d := range parseArray(export.DodItems) {
		tx.Exec(ctx,
			`INSERT INTO dod_items (id, project_id, text, order_index)
			 VALUES (gen_random_uuid(), $1, $2, $3)`,
			newProjectID, getString(d, "text"), floatOrDefault(d, "order_index", 0),
		)
	}

	// --- 11. Import impediments (skip if template) ---
	if !asTemplate {
		for _, i := range parseArray(export.Impediments) {
			tx.Exec(ctx,
				`INSERT INTO impediments (id, work_item_id, raised_by, description)
				 VALUES (gen_random_uuid(), $1, $2, $3)`,
				remap(getString(i, "work_item_id")), claims.UserID, getString(i, "description"),
			)
		}
	}

	// Update project item counter
	tx.Exec(ctx, `UPDATE projects SET item_counter = $1 WHERE id = $2`, itemCounter, newProjectID)

	if err := tx.Commit(ctx); err != nil {
		slog.Error("import: commit failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to commit import")
		return
	}

	// Return the new project
	var p Project
	h.db.QueryRow(ctx,
		fmt.Sprintf(`SELECT %s FROM projects WHERE id = $1`, projectColumns),
		newProjectID,
	).Scan(p.scanFields()...)

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"project":        p,
		"items_imported": itemCounter,
		"id_mapping":     idMap,
	})
}

// --- Helpers ---

func intOrDefault(m map[string]interface{}, key string, def int) int {
	if v, ok := m[key].(float64); ok {
		return int(v)
	}
	return def
}

func floatOrDefault(m map[string]interface{}, key string, def float64) float64 {
	if v, ok := m[key].(float64); ok {
		return v
	}
	return def
}

func intPtrOrNil(m map[string]interface{}, key string) *int {
	if v, ok := m[key].(float64); ok {
		i := int(v)
		return &i
	}
	return nil
}

func rawJSONOrNull(m map[string]interface{}, key string) *string {
	v, ok := m[key]
	if !ok || v == nil {
		return nil
	}
	b, _ := json.Marshal(v)
	s := string(b)
	return &s
}

func stringArrayOrEmpty(m map[string]interface{}, key string) []string {
	v, ok := m[key].([]interface{})
	if !ok {
		return []string{}
	}
	result := make([]string, 0, len(v))
	for _, item := range v {
		if s, ok := item.(string); ok {
			result = append(result, s)
		}
	}
	return result
}

func nilIfTemplate(isTemplate bool, v *string) *string {
	if isTemplate {
		return nil
	}
	return v
}
