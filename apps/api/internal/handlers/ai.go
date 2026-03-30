package handlers

import (
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/OhByron/ProjectA/internal/ai"
)

type AIHandlers struct {
	db *pgxpool.Pool
}

func NewAIHandlers(db *pgxpool.Pool) *AIHandlers {
	return &AIHandlers{db: db}
}

// SuggestAC generates acceptance criteria suggestions for a work item.
// POST /api/projects/{projectID}/work-items/{workItemID}/suggest-ac
func (h *AIHandlers) SuggestAC(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	workItemID := chi.URLParam(r, "workItemID")

	// Get project AI settings
	var providerType, model, apiKey, endpoint *string
	var projectName string
	err := h.db.QueryRow(r.Context(),
		`SELECT name, ai_provider, ai_model, ai_api_key, ai_endpoint FROM projects WHERE id = $1`,
		projectID).Scan(&projectName, &providerType, &model, &apiKey, &endpoint)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "Project not found")
		return
	}

	if providerType == nil || apiKey == nil || *providerType == "" || *apiKey == "" {
		writeError(w, http.StatusBadRequest, "ai_not_configured", "AI is not configured for this project. Go to project settings to add an AI provider and API key.")
		return
	}

	provider, err := ai.NewProvider(*providerType, deref(model), *apiKey, deref(endpoint))
	if err != nil {
		writeError(w, http.StatusBadRequest, "ai_error", err.Error())
		return
	}

	// Gather context
	var storyTitle string
	var storyDesc, epicID *string
	err = h.db.QueryRow(r.Context(),
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
	}

	slog.Info("ai.SuggestAC", "project", projectName, "story", storyTitle, "provider", *providerType)

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

	var providerType, model, apiKey, endpoint *string
	var projectName string
	err := h.db.QueryRow(r.Context(),
		`SELECT name, ai_provider, ai_model, ai_api_key, ai_endpoint FROM projects WHERE id = $1`,
		projectID).Scan(&projectName, &providerType, &model, &apiKey, &endpoint)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "Project not found")
		return
	}
	if providerType == nil || apiKey == nil || *providerType == "" || *apiKey == "" {
		writeError(w, http.StatusBadRequest, "ai_not_configured", "AI is not configured for this project.")
		return
	}

	provider, err := ai.NewProvider(*providerType, deref(model), *apiKey, deref(endpoint))
	if err != nil {
		writeError(w, http.StatusBadRequest, "ai_error", err.Error())
		return
	}

	var storyTitle, storyType string
	var storyDesc, epicID *string
	err = h.db.QueryRow(r.Context(),
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

	var providerType, model, apiKey, endpoint *string
	var projectName string
	err := h.db.QueryRow(r.Context(),
		`SELECT name, ai_provider, ai_model, ai_api_key, ai_endpoint FROM projects WHERE id = $1`,
		projectID).Scan(&projectName, &providerType, &model, &apiKey, &endpoint)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "Project not found")
		return
	}
	if providerType == nil || apiKey == nil || *providerType == "" || *apiKey == "" {
		writeError(w, http.StatusBadRequest, "ai_not_configured", "AI is not configured for this project.")
		return
	}

	provider, err := ai.NewProvider(*providerType, deref(model), *apiKey, deref(endpoint))
	if err != nil {
		writeError(w, http.StatusBadRequest, "ai_error", err.Error())
		return
	}

	var body struct {
		Type        string `json:"type"` // "ac" or "description"
		Title       string `json:"title"`
		Description string `json:"description"`
		EpicTitle   string `json:"epic_title"`
		EpicDesc    string `json:"epic_description"`
		StoryType   string `json:"story_type"`
	}
	if !readJSON(w, r, &body) {
		return
	}

	if body.Type == "ac" {
		req := ai.SuggestACRequest{
			StoryTitle:       body.Title,
			StoryDescription: body.Description,
			EpicTitle:        body.EpicTitle,
			EpicDescription:  body.EpicDesc,
			ProjectName:      projectName,
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

func nilIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
