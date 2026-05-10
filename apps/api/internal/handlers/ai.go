package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/OhByron/PlanA/internal/ai"
	"github.com/OhByron/PlanA/internal/auth"
)

// loadAIProvider loads the project's AI configuration (with env-driven fallback
// to the global default) and writes an HTTP error response if it can't be
// resolved. When err is non-nil the caller should return; provider is unset.
func loadAIProvider(w http.ResponseWriter, r *http.Request, db DBPOOL, projectID string) (ai.Provider, string, bool) {
	provider, projectName, err := ai.LoadProviderForProject(r.Context(), db, projectID)
	if err == nil {
		return provider, projectName, true
	}
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		writeError(w, http.StatusNotFound, "not_found", "Project not found")
	case errors.Is(err, ai.ErrNotConfigured):
		writeError(w, http.StatusBadRequest, "ai_not_configured", "AI is not configured for this project. Add a provider in project settings, or set AI_DEFAULT_PROVIDER on the server.")
	default:
		writeError(w, http.StatusInternalServerError, "ai_error", err.Error())
	}
	return nil, "", false
}

type AIHandlers struct {
	db DBPOOL
}

func NewAIHandlers(db DBPOOL) *AIHandlers {
	return &AIHandlers{db: db}
}

// userLanguage returns the user's language preference. It checks the
// X-Language header first (set by the frontend from i18next), then
// falls back to the stored DB preference.
func (h *AIHandlers) userLanguage(r *http.Request) string {
	// Prefer explicit header from frontend
	if lang := r.Header.Get("X-Language"); lang != "" {
		return lang
	}
	// Fall back to stored preference
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		return ""
	}
	var lang *string
	_ = h.db.QueryRow(r.Context(), `SELECT language FROM users WHERE id = $1`, claims.UserID).Scan(&lang)
	if lang != nil {
		return *lang
	}
	return ""
}

// SuggestAC generates acceptance criteria suggestions for a work item.
// POST /api/projects/{projectID}/work-items/{workItemID}/suggest-ac
func (h *AIHandlers) SuggestAC(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	workItemID := chi.URLParam(r, "workItemID")

	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	provider, projectName, ok := loadAIProvider(w, r, h.db, projectID)
	if !ok {
		return
	}

	// Gather context
	var storyTitle string
	var storyDesc, epicID *string
	err := h.db.QueryRow(r.Context(),
		`SELECT title, description::text, epic_id FROM work_items WHERE id = $1`, workItemID,
	).Scan(&storyTitle, &storyDesc, &epicID)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "Work item not found")
		return
	}

	var epicTitle, epicDesc string
	if epicID != nil {
		_ = h.db.QueryRow(r.Context(),
			`SELECT title, COALESCE(description, '') FROM epics WHERE id = $1`, *epicID,
		).Scan(&epicTitle, &epicDesc)
	}

	// Get existing AC
	rows, _ := h.db.Query(r.Context(),
		`SELECT given_clause, when_clause, then_clause FROM acceptance_criteria WHERE work_item_id = $1`, workItemID)
	var existingAC []string
	if rows != nil {
		for rows.Next() {
			var g, w2, t string
			if rows.Scan(&g, &w2, &t) == nil {
				existingAC = append(existingAC, "Given "+g+" When "+w2+" Then "+t)
			}
		}
		rows.Close()
	}

	// Get sibling stories in the same epic
	var siblings []string
	if epicID != nil {
		sRows, _ := h.db.Query(r.Context(),
			`SELECT title FROM work_items WHERE epic_id = $1 AND id != $2 AND type = 'story' LIMIT 10`,
			*epicID, workItemID)
		if sRows != nil {
			for sRows.Next() {
				var t string
				if sRows.Scan(&t) == nil {
					siblings = append(siblings, t)
				}
			}
			sRows.Close()
		}
	}

	req := ai.SuggestACRequest{
		StoryTitle:       storyTitle,
		StoryDescription: deref(storyDesc),
		EpicTitle:        epicTitle,
		EpicDescription:  epicDesc,
		ExistingAC:       existingAC,
		SiblingStories:   siblings,
		ProjectName:      projectName,
		Language:         h.userLanguage(r),
	}

	slog.Info("ai.SuggestAC", "project", projectName, "story", storyTitle)

	result, err := provider.SuggestAC(r.Context(), req)
	if err != nil {
		slog.Error("ai.SuggestAC failed", "error", err)
		writeError(w, http.StatusInternalServerError, "ai_error", "AI request failed: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, result)
}

// GetSettings returns the AI configuration for a project (with masked API key).
// GET /api/projects/{projectID}/ai-settings
func (h *AIHandlers) GetSettings(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")

	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	var provider, model, key, endpoint *string
	err := h.db.QueryRow(r.Context(),
		`SELECT ai_provider, ai_model, ai_api_key, ai_endpoint FROM projects WHERE id = $1`,
		projectID).Scan(&provider, &model, &key, &endpoint)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "Project not found")
		return
	}
	// Mask the API key
	maskedKey := ""
	if key != nil && len(*key) > 8 {
		maskedKey = (*key)[:4] + "..." + (*key)[len(*key)-4:]
	} else if key != nil {
		maskedKey = "****"
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"provider": deref(provider),
		"model":    deref(model),
		"api_key":  maskedKey,
		"endpoint": deref(endpoint),
	})
}

// UpdateSettings updates the AI configuration for a project.
// PATCH /api/projects/{projectID}/ai-settings
func (h *AIHandlers) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")

	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !checkProjectAdmin(r.Context(), h.db, projectID, claims.UserID) {
		writeError(w, http.StatusForbidden, "forbidden", "Project admin access required")
		return
	}

	var body struct {
		Provider string `json:"provider"`
		Model    string `json:"model"`
		APIKey   string `json:"api_key"`
		Endpoint string `json:"endpoint"`
	}
	if !readJSON(w, r, &body) {
		return
	}

	_, err := h.db.Exec(r.Context(),
		`UPDATE projects SET ai_provider = $1, ai_model = $2, ai_api_key = $3, ai_endpoint = $4, updated_at = NOW() WHERE id = $5`,
		nilIfEmpty(body.Provider), nilIfEmpty(body.Model), nilIfEmpty(body.APIKey), nilIfEmpty(body.Endpoint), projectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to update AI settings")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// SuggestDescription generates a description for a work item.
// POST /api/projects/{projectID}/work-items/{workItemID}/suggest-desc
func (h *AIHandlers) SuggestDescription(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	workItemID := chi.URLParam(r, "workItemID")

	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	provider, projectName, ok := loadAIProvider(w, r, h.db, projectID)
	if !ok {
		return
	}

	var storyTitle, storyType string
	var storyDesc, epicID *string
	err := h.db.QueryRow(r.Context(),
		`SELECT title, type, description::text, epic_id FROM work_items WHERE id = $1`, workItemID,
	).Scan(&storyTitle, &storyType, &storyDesc, &epicID)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "Work item not found")
		return
	}

	var epicTitle, epicDesc string
	if epicID != nil {
		_ = h.db.QueryRow(r.Context(),
			`SELECT title, COALESCE(description, '') FROM epics WHERE id = $1`, *epicID,
		).Scan(&epicTitle, &epicDesc)
	}

	var siblings []string
	if epicID != nil {
		sRows, _ := h.db.Query(r.Context(),
			`SELECT title FROM work_items WHERE epic_id = $1 AND id != $2 AND type = 'story' LIMIT 10`,
			*epicID, workItemID)
		if sRows != nil {
			for sRows.Next() {
				var t string
				if sRows.Scan(&t) == nil {
					siblings = append(siblings, t)
				}
			}
			sRows.Close()
		}
	}

	req := ai.SuggestDescRequest{
		StoryTitle:      storyTitle,
		CurrentDesc:     deref(storyDesc),
		EpicTitle:       epicTitle,
		EpicDescription: epicDesc,
		SiblingStories:  siblings,
		ProjectName:     projectName,
		StoryType:       storyType,
		Language:        h.userLanguage(r),
	}

	slog.Info("ai.SuggestDescription", "project", projectName, "story", storyTitle)

	result, err := provider.SuggestDescription(r.Context(), req)
	if err != nil {
		slog.Error("ai.SuggestDescription failed", "error", err)
		writeError(w, http.StatusInternalServerError, "ai_error", "AI request failed: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, result)
}

// SuggestInline handles AI suggestions for stories that haven't been created yet.
// Accepts context in the request body instead of looking it up from the DB.
// POST /api/projects/{projectID}/ai/suggest-inline
func (h *AIHandlers) SuggestInline(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")

	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	provider, projectName, ok := loadAIProvider(w, r, h.db, projectID)
	if !ok {
		return
	}

	var body struct {
		Type        string   `json:"type"` // "ac", "description", or "sprint_goal"
		Title       string   `json:"title"`
		Description string   `json:"description"`
		EpicTitle   string   `json:"epic_title"`
		EpicDesc    string   `json:"epic_description"`
		StoryType   string   `json:"story_type"`
		SprintName  string   `json:"sprint_name"`
		ItemTitles  []string `json:"item_titles"` // for sprint_goal
	}
	if !readJSON(w, r, &body) {
		return
	}

	lang := h.userLanguage(r)

	if body.Type == "sprint_goal" {
		systemPrompt := `You are an Agile coach helping craft sprint goals. Given a sprint name and the list of items planned for the sprint, write a concise sprint goal (1-2 sentences) that captures the business value being delivered. Focus on outcomes, not tasks. Return JSON: {"goal": "..."}`
		if li := ai.LanguageInstruction(lang); li != "" {
			systemPrompt += " " + li
		}
		itemList := ""
		for _, t := range body.ItemTitles {
			itemList += "- " + t + "\n"
		}
		userPrompt := fmt.Sprintf("Project: %s\nSprint: %s\nItems:\n%s\nGenerate a sprint goal.", projectName, body.SprintName, itemList)

		raw, err := provider.RawChat(r.Context(), systemPrompt, userPrompt)
		if err != nil {
			slog.Error("ai.SuggestInline sprint_goal failed", "error", err)
			writeError(w, http.StatusInternalServerError, "ai_error", "AI request failed: "+err.Error())
			return
		}
		// Try to parse JSON, fallback to raw text
		var result struct {
			Goal string `json:"goal"`
		}
		if jsonErr := json.Unmarshal([]byte(raw), &result); jsonErr != nil {
			result.Goal = raw
		}
		writeJSON(w, http.StatusOK, map[string]string{"goal": result.Goal})
		return
	} else if body.Type == "ac" {
		req := ai.SuggestACRequest{
			StoryTitle:       body.Title,
			StoryDescription: body.Description,
			EpicTitle:        body.EpicTitle,
			EpicDescription:  body.EpicDesc,
			ProjectName:      projectName,
			Language:         lang,
		}
		result, err := provider.SuggestAC(r.Context(), req)
		if err != nil {
			slog.Error("ai.SuggestInline AC failed", "error", err)
			writeError(w, http.StatusInternalServerError, "ai_error", "AI request failed: "+err.Error())
			return
		}
		writeJSON(w, http.StatusOK, result)
	} else {
		req := ai.SuggestDescRequest{
			StoryTitle:      body.Title,
			CurrentDesc:     body.Description,
			EpicTitle:       body.EpicTitle,
			EpicDescription: body.EpicDesc,
			ProjectName:     projectName,
			StoryType:       body.StoryType,
			Language:        lang,
		}
		result, err := provider.SuggestDescription(r.Context(), req)
		if err != nil {
			slog.Error("ai.SuggestInline desc failed", "error", err)
			writeError(w, http.StatusInternalServerError, "ai_error", "AI request failed: "+err.Error())
			return
		}
		writeJSON(w, http.StatusOK, result)
	}
}

// SuggestFromTestFailure generates a defect description and ACs from a linked test failure.
// POST /api/projects/{projectID}/work-items/{workItemID}/suggest-from-test
func (h *AIHandlers) SuggestFromTestFailure(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	workItemID := chi.URLParam(r, "workItemID")

	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	provider, projectName, ok := loadAIProvider(w, r, h.db, projectID)
	if !ok {
		return
	}

	// Get the work item's source_test_result_id and parent story title
	var sourceTestResultID, parentID *string
	err := h.db.QueryRow(r.Context(),
		`SELECT source_test_result_id, parent_id FROM work_items WHERE id = $1`, workItemID,
	).Scan(&sourceTestResultID, &parentID)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "Work item not found")
		return
	}
	if sourceTestResultID == nil {
		writeError(w, http.StatusBadRequest, "no_test_result", "This work item has no linked test failure")
		return
	}

	var parentTitle string
	if parentID != nil {
		_ = h.db.QueryRow(r.Context(),
			`SELECT title FROM work_items WHERE id = $1`, *parentID,
		).Scan(&parentTitle)
	}

	// Get the test result details
	var testName, status string
	var errorMsg, suiteName *string
	err = h.db.QueryRow(r.Context(),
		`SELECT test_name, status, error_message, suite_name FROM test_results WHERE id = $1`,
		*sourceTestResultID,
	).Scan(&testName, &status, &errorMsg, &suiteName)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "Test result not found")
		return
	}

	req := ai.SuggestDefectRequest{
		TestName:     testName,
		SuiteName:    deref(suiteName),
		Status:       status,
		ErrorMessage: deref(errorMsg),
		ProjectName:  projectName,
		ParentTitle:  parentTitle,
		Language:     h.userLanguage(r),
	}

	slog.Info("ai.SuggestFromTestFailure", "project", projectName, "test", testName)

	result, err := provider.SuggestDefect(r.Context(), req)
	if err != nil {
		slog.Error("ai.SuggestFromTestFailure failed", "error", err)
		writeError(w, http.StatusInternalServerError, "ai_error", "AI request failed: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, result)
}

// SuggestDecomposition suggests child tasks for a story.
// POST /api/projects/{projectID}/work-items/{workItemID}/suggest-decompose
func (h *AIHandlers) SuggestDecomposition(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	workItemID := chi.URLParam(r, "workItemID")

	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	provider, projectName, ok := loadAIProvider(w, r, h.db, projectID)
	if !ok {
		return
	}

	// Get story context
	var storyTitle, storyType string
	var storyDesc, epicID *string
	err := h.db.QueryRow(r.Context(),
		`SELECT title, type, description::text, epic_id FROM work_items WHERE id = $1`, workItemID,
	).Scan(&storyTitle, &storyType, &storyDesc, &epicID)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "Work item not found")
		return
	}

	var epicTitle, epicDesc string
	if epicID != nil {
		_ = h.db.QueryRow(r.Context(),
			`SELECT title, COALESCE(description, '') FROM epics WHERE id = $1`, *epicID,
		).Scan(&epicTitle, &epicDesc)
	}

	// Get existing child tasks
	var existingTasks []string
	taskRows, _ := h.db.Query(r.Context(),
		`SELECT title FROM work_items WHERE parent_id = $1`, workItemID)
	if taskRows != nil {
		for taskRows.Next() {
			var t string
			if taskRows.Scan(&t) == nil {
				existingTasks = append(existingTasks, t)
			}
		}
		taskRows.Close()
	}

	// Get available team roles from project members
	var teamRoles []string
	roleRows, _ := h.db.Query(r.Context(),
		`SELECT DISTINCT job_role FROM project_members WHERE project_id = $1`, projectID)
	if roleRows != nil {
		for roleRows.Next() {
			var role string
			if roleRows.Scan(&role) == nil {
				teamRoles = append(teamRoles, role)
			}
		}
		roleRows.Close()
	}

	req := ai.SuggestDecompRequest{
		StoryTitle:       storyTitle,
		StoryDescription: deref(storyDesc),
		EpicTitle:        epicTitle,
		EpicDescription:  epicDesc,
		ExistingTasks:    existingTasks,
		ProjectName:      projectName,
		TeamRoles:        teamRoles,
		Language:         h.userLanguage(r),
	}

	slog.Info("ai.SuggestDecomposition", "project", projectName, "story", storyTitle)

	result, err := provider.SuggestDecomposition(r.Context(), req)
	if err != nil {
		slog.Error("ai.SuggestDecomposition failed", "error", err)
		writeError(w, http.StatusInternalServerError, "ai_error", "AI request failed: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func nilIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
