package handlers

import (
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/OhByron/ProjectA/internal/ai"
	"github.com/OhByron/ProjectA/internal/auth"
)

type ReportHandlers struct {
	db DBPOOL
}

type defectSummary struct {
	Total    int `json:"total"`
	Open     int `json:"open"`
	Resolved int `json:"resolved"`
	Critical int `json:"critical"`
}

type blockedItem struct {
	Title         string `json:"title"`
	Type          string `json:"type"`
	BlockedReason string `json:"blocked_reason"`
}

func NewReportHandlers(db DBPOOL) *ReportHandlers {
	return &ReportHandlers{db: db}
}

// Generate assembles a project or sprint report from existing data.
// POST /api/projects/{projectID}/reports/generate
func (h *ReportHandlers) Generate(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	var body struct {
		Type     string `json:"type"`      // "project" or "sprint"
		SprintID string `json:"sprint_id"` // required if type is "sprint"
	}
	if !readJSON(w, r, &body) {
		return
	}
	if body.Type == "" {
		body.Type = "project"
	}

	report := map[string]any{
		"type":         body.Type,
		"generated_at": time.Now(),
	}

	// Project info
	var projectName string
	var projectDesc *string
	_ = h.db.QueryRow(r.Context(),
		`SELECT name, description FROM projects WHERE id = $1`, projectID,
	).Scan(&projectName, &projectDesc)
	report["project"] = map[string]any{"name": projectName, "description": projectDesc}

	// --------------- Metrics ---------------

	// Overall completion
	var totalStories, doneStories, totalPoints, donePoints int
	_ = h.db.QueryRow(r.Context(),
		`SELECT
			COUNT(*),
			COUNT(*) FILTER (WHERE status = 'done'),
			COALESCE(SUM(story_points), 0),
			COALESCE(SUM(story_points) FILTER (WHERE status = 'done'), 0)
		 FROM work_items WHERE project_id = $1 AND type IN ('story', 'task')`, projectID,
	).Scan(&totalStories, &doneStories, &totalPoints, &donePoints)

	report["metrics"] = map[string]any{
		"total_items":    totalStories,
		"done_items":     doneStories,
		"total_points":   totalPoints,
		"done_points":    donePoints,
		"completion_pct": func() int {
			if totalStories == 0 {
				return 0
			}
			return doneStories * 100 / totalStories
		}(),
	}

	// Velocity across sprints
	type velocityEntry struct {
		Name     string `json:"name"`
		Velocity *int   `json:"velocity"`
	}
	var velocities []velocityEntry
	vRows, _ := h.db.Query(r.Context(),
		`SELECT name, velocity FROM sprints
		 WHERE project_id = $1 AND status = 'completed' AND velocity IS NOT NULL
		 ORDER BY end_date`, projectID)
	if vRows != nil {
		for vRows.Next() {
			var v velocityEntry
			if vRows.Scan(&v.Name, &v.Velocity) == nil {
				velocities = append(velocities, v)
			}
		}
		vRows.Close()
	}
	report["velocity"] = velocities

	// --------------- Epics breakdown ---------------

	type epicReport struct {
		Title         string `json:"title"`
		TotalStories  int    `json:"total_stories"`
		DoneStories   int    `json:"done_stories"`
		TotalAC       int    `json:"total_ac"`
		TestCoverage  int    `json:"test_coverage_pct"`
	}
	var epics []epicReport
	eRows, _ := h.db.Query(r.Context(),
		`SELECT e.title,
			COUNT(DISTINCT wi.id),
			COUNT(DISTINCT wi.id) FILTER (WHERE wi.status = 'done'),
			COUNT(DISTINCT ac.id),
			CASE WHEN COUNT(DISTINCT wi.id) = 0 THEN 0
			     ELSE (COUNT(DISTINCT CASE WHEN tr.id IS NOT NULL THEN wi.id END) * 100 / COUNT(DISTINCT wi.id))
			END
		 FROM epics e
		 LEFT JOIN work_items wi ON wi.epic_id = e.id AND wi.type = 'story'
		 LEFT JOIN acceptance_criteria ac ON ac.work_item_id = wi.id
		 LEFT JOIN test_results tr ON tr.work_item_id = wi.id
		 WHERE e.project_id = $1
		 GROUP BY e.id, e.title
		 ORDER BY e.title`, projectID)
	if eRows != nil {
		for eRows.Next() {
			var ep epicReport
			if eRows.Scan(&ep.Title, &ep.TotalStories, &ep.DoneStories, &ep.TotalAC, &ep.TestCoverage) == nil {
				epics = append(epics, ep)
			}
		}
		eRows.Close()
	}
	report["epics"] = epics

	// --------------- Defects ---------------

	var ds defectSummary
	_ = h.db.QueryRow(r.Context(),
		`SELECT
			COUNT(*),
			COUNT(*) FILTER (WHERE status NOT IN ('done', 'cancelled')),
			COUNT(*) FILTER (WHERE status IN ('done', 'cancelled')),
			COUNT(*) FILTER (WHERE priority = 'urgent' AND status NOT IN ('done', 'cancelled'))
		 FROM work_items WHERE project_id = $1 AND type = 'bug'`, projectID,
	).Scan(&ds.Total, &ds.Open, &ds.Resolved, &ds.Critical)
	report["defects"] = ds

	// --------------- Test evidence ---------------

	var totalTests, passedTests, failedTests, errorTests, skippedTests int
	_ = h.db.QueryRow(r.Context(),
		`SELECT COUNT(*),
		        COUNT(*) FILTER (WHERE status = 'pass'),
		        COUNT(*) FILTER (WHERE status = 'fail'),
		        COUNT(*) FILTER (WHERE status = 'error'),
		        COUNT(*) FILTER (WHERE status = 'skip')
		 FROM test_results WHERE project_id = $1`, projectID,
	).Scan(&totalTests, &passedTests, &failedTests, &errorTests, &skippedTests)
	report["tests"] = map[string]int{
		"total":   totalTests,
		"passed":  passedTests,
		"failed":  failedTests,
		"errors":  errorTests,
		"skipped": skippedTests,
		"pass_rate": func() int {
			if totalTests == 0 {
				return 0
			}
			return passedTests * 100 / totalTests
		}(),
	}

	// --------------- Risks / blockers ---------------

	var blocked []blockedItem
	bRows, _ := h.db.Query(r.Context(),
		`SELECT title, type, COALESCE(blocked_reason, 'Has unresolved dependency')
		 FROM work_items
		 WHERE project_id = $1 AND is_blocked = true AND status NOT IN ('done', 'cancelled')
		 ORDER BY priority`, projectID)
	if bRows != nil {
		for bRows.Next() {
			var b blockedItem
			if bRows.Scan(&b.Title, &b.Type, &b.BlockedReason) == nil {
				blocked = append(blocked, b)
			}
		}
		bRows.Close()
	}
	report["blockers"] = blocked

	// --------------- AI executive summary (optional) ---------------

	var providerType, model, apiKey, endpoint *string
	_ = h.db.QueryRow(r.Context(),
		`SELECT ai_provider, ai_model, ai_api_key, ai_endpoint FROM projects WHERE id = $1`, projectID,
	).Scan(&providerType, &model, &apiKey, &endpoint)

	if providerType != nil && apiKey != nil && *providerType != "" && *apiKey != "" {
		provider, err := ai.NewProvider(*providerType, deref(model), *apiKey, deref(endpoint))
		if err == nil {
			summary := h.generateSummary(r, provider, projectName, report)
			report["executive_summary"] = summary
		}
	}

	writeJSON(w, http.StatusOK, report)
}

func (h *ReportHandlers) generateSummary(r *http.Request, provider ai.Provider, projectName string, report map[string]any) string {
	metrics := report["metrics"].(map[string]any)
	defects := report["defects"].(defectSummary)
	tests := report["tests"].(map[string]int)

	prompt := fmt.Sprintf(`Write a concise executive summary (3-4 paragraphs) for a project status report.

Project: %s
Completion: %d%% (%d of %d items done, %d of %d points)
Defects: %d total (%d open, %d critical)
Test Results: %d tests, %d%% pass rate
Blockers: %d items currently blocked

Write in professional, stakeholder-friendly language. Focus on progress, risks, and outlook.
Return only the summary text, no JSON wrapper.`,
		projectName,
		metrics["completion_pct"], metrics["done_items"], metrics["total_items"],
		metrics["done_points"], metrics["total_points"],
		defects.Total, defects.Open, defects.Critical,
		tests["total"], tests["pass_rate"],
		len(report["blockers"].([]blockedItem)),
	)

	resp, err := provider.SuggestDescription(r.Context(), ai.SuggestDescRequest{
		StoryTitle:  "Project Status Report",
		CurrentDesc: prompt,
		ProjectName: projectName,
		StoryType:   "report",
	})
	if err != nil {
		slog.Warn("reports.Generate: AI summary failed", "error", err)
		return ""
	}
	return resp.Description
}
