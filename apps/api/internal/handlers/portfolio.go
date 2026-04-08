package handlers

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/OhByron/PlanA/internal/auth"
)

type PortfolioHandlers struct {
	db DBPOOL
}

func NewPortfolioHandlers(db DBPOOL) *PortfolioHandlers {
	return &PortfolioHandlers{db: db}
}

type initiativeMetric struct {
	ID            string     `json:"id"`
	Title         string     `json:"title"`
	Status        string     `json:"status"`
	Priority      string     `json:"priority"`
	StartDate     *time.Time `json:"start_date"`
	TargetDate    *time.Time `json:"target_date"`
	EpicCount     int        `json:"epic_count"`
	EpicsDone     int        `json:"epics_done"`
	StoryCount    int        `json:"story_count"`
	StoriesDone   int        `json:"stories_done"`
	TotalPoints   int        `json:"total_points"`
	DonePoints    int        `json:"done_points"`
	CompletionPct int        `json:"completion_pct"`
	Projects      []string   `json:"projects"`
}

type projectMetric struct {
	ID            string  `json:"id"`
	Name          string  `json:"name"`
	Team          string  `json:"team"`
	TotalItems    int     `json:"total_items"`
	DoneItems     int     `json:"done_items"`
	CompletionPct int     `json:"completion_pct"`
	OpenBugs      int     `json:"open_bugs"`
	CriticalBugs  int     `json:"critical_bugs"`
	BlockedCount  int     `json:"blocked_count"`
	AvgVelocity   *int    `json:"avg_velocity"`
	ActiveSprint  *string `json:"active_sprint"`
	Health        string  `json:"health"`
}

type portfolioSummary struct {
	TotalInitiatives  int `json:"total_initiatives"`
	ActiveInitiatives int `json:"active_initiatives"`
	TotalProjects     int `json:"total_projects"`
	TotalItems        int `json:"total_items"`
	DoneItems         int `json:"done_items"`
	OverallCompletion int `json:"overall_completion"`
	TotalBlocked      int `json:"total_blocked"`
	AvgVelocityAll    int `json:"avg_velocity_all"`
}

// Dashboard returns the portfolio dashboard data for an organization.
func (h *PortfolioHandlers) Dashboard(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "orgID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	// Verify org membership
	var exists bool
	_ = h.db.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2)`,
		orgID, claims.UserID).Scan(&exists)
	if !exists {
		writeError(w, http.StatusForbidden, "forbidden", "Not a member of this organization")
		return
	}

	// --- Initiative Metrics ---
	initiatives := h.getInitiativeMetrics(r, orgID)

	// --- Project Metrics ---
	projects := h.getProjectMetrics(r, orgID)

	// --- Summary ---
	summary := portfolioSummary{
		TotalInitiatives: len(initiatives),
		TotalProjects:    len(projects),
	}
	for _, i := range initiatives {
		if i.Status == "active" {
			summary.ActiveInitiatives++
		}
	}
	velocitySum, velocityCount := 0, 0
	for _, p := range projects {
		summary.TotalItems += p.TotalItems
		summary.DoneItems += p.DoneItems
		summary.TotalBlocked += p.BlockedCount
		if p.AvgVelocity != nil {
			velocitySum += *p.AvgVelocity
			velocityCount++
		}
	}
	if summary.TotalItems > 0 {
		summary.OverallCompletion = summary.DoneItems * 100 / summary.TotalItems
	}
	if velocityCount > 0 {
		summary.AvgVelocityAll = velocitySum / velocityCount
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"initiatives": initiatives,
		"projects":    projects,
		"summary":     summary,
	})
}

func (h *PortfolioHandlers) getInitiativeMetrics(r *http.Request, orgID string) []initiativeMetric {
	rows, err := h.db.Query(r.Context(),
		`SELECT i.id, i.title, i.status, i.priority, i.start_date, i.target_date,
		        COALESCE((SELECT COUNT(*) FROM epics e WHERE e.initiative_id = i.id), 0) AS epic_count,
		        COALESCE((SELECT COUNT(*) FROM epics e WHERE e.initiative_id = i.id AND e.status = 'done'), 0) AS epics_done,
		        COALESCE((SELECT COUNT(*) FROM work_items wi JOIN epics e ON e.id = wi.epic_id WHERE e.initiative_id = i.id), 0) AS story_count,
		        COALESCE((SELECT COUNT(*) FROM work_items wi JOIN epics e ON e.id = wi.epic_id
		                  JOIN workflow_states ws ON ws.id = wi.workflow_state_id
		                  WHERE e.initiative_id = i.id AND ws.is_terminal = true AND wi.is_cancelled = false), 0) AS stories_done,
		        COALESCE((SELECT COALESCE(SUM(wi.story_points), 0) FROM work_items wi JOIN epics e ON e.id = wi.epic_id WHERE e.initiative_id = i.id), 0) AS total_points,
		        COALESCE((SELECT COALESCE(SUM(wi.story_points), 0) FROM work_items wi JOIN epics e ON e.id = wi.epic_id
		                  JOIN workflow_states ws ON ws.id = wi.workflow_state_id
		                  WHERE e.initiative_id = i.id AND ws.is_terminal = true AND wi.is_cancelled = false), 0) AS done_points
		   FROM initiatives i WHERE i.organization_id = $1
		   ORDER BY i.order_index, i.created_at`, orgID)
	if err != nil {
		slog.Error("portfolio.getInitiativeMetrics: query failed", "error", err)
		return []initiativeMetric{}
	}
	defer rows.Close()

	var result []initiativeMetric
	for rows.Next() {
		var m initiativeMetric
		if err := rows.Scan(&m.ID, &m.Title, &m.Status, &m.Priority, &m.StartDate, &m.TargetDate,
			&m.EpicCount, &m.EpicsDone, &m.StoryCount, &m.StoriesDone, &m.TotalPoints, &m.DonePoints); err != nil {
			slog.Error("portfolio.getInitiativeMetrics: scan failed", "error", err)
			continue
		}
		if m.StoryCount > 0 {
			m.CompletionPct = m.StoriesDone * 100 / m.StoryCount
		}

		// Get distinct projects linked through epics
		projRows, _ := h.db.Query(r.Context(),
			`SELECT DISTINCT p.name FROM epics e JOIN projects p ON p.id = e.project_id
			 WHERE e.initiative_id = $1 ORDER BY p.name`, m.ID)
		m.Projects = []string{}
		if projRows != nil {
			for projRows.Next() {
				var name string
				if projRows.Scan(&name) == nil {
					m.Projects = append(m.Projects, name)
				}
			}
			projRows.Close()
		}

		result = append(result, m)
	}
	if result == nil {
		result = []initiativeMetric{}
	}
	return result
}

func (h *PortfolioHandlers) getProjectMetrics(r *http.Request, orgID string) []projectMetric {
	rows, err := h.db.Query(r.Context(),
		`SELECT p.id, p.name, t.name AS team_name,
		        (SELECT COUNT(*) FROM work_items wi WHERE wi.project_id = p.id) AS total_items,
		        (SELECT COUNT(*) FROM work_items wi
		         JOIN workflow_states ws ON ws.id = wi.workflow_state_id
		         WHERE wi.project_id = p.id AND ws.is_terminal = true AND wi.is_cancelled = false) AS done_items,
		        (SELECT COUNT(*) FROM work_items wi
		         JOIN workflow_states ws ON ws.id = wi.workflow_state_id
		         WHERE wi.project_id = p.id AND wi.type = 'bug'
		           AND ws.is_terminal = false AND wi.is_cancelled = false) AS open_bugs,
		        (SELECT COUNT(*) FROM work_items wi
		         JOIN workflow_states ws ON ws.id = wi.workflow_state_id
		         WHERE wi.project_id = p.id AND wi.type = 'bug' AND wi.priority = 'urgent'
		           AND ws.is_terminal = false AND wi.is_cancelled = false) AS critical_bugs,
		        (SELECT COUNT(*) FROM work_items wi
		         JOIN workflow_states ws ON ws.id = wi.workflow_state_id
		         WHERE wi.project_id = p.id AND wi.is_blocked = true
		           AND ws.is_terminal = false AND wi.is_cancelled = false) AS blocked_count,
		        (SELECT name FROM sprints s WHERE s.project_id = p.id AND s.status = 'active' LIMIT 1) AS active_sprint
		   FROM projects p
		   JOIN teams t ON t.id = p.team_id
		  WHERE t.organization_id = $1 AND p.archived_at IS NULL
		  ORDER BY t.name, p.name`, orgID)
	if err != nil {
		slog.Error("portfolio.getProjectMetrics: query failed", "error", err)
		return []projectMetric{}
	}
	defer rows.Close()

	var result []projectMetric
	for rows.Next() {
		var m projectMetric
		if err := rows.Scan(&m.ID, &m.Name, &m.Team, &m.TotalItems, &m.DoneItems,
			&m.OpenBugs, &m.CriticalBugs, &m.BlockedCount, &m.ActiveSprint); err != nil {
			slog.Error("portfolio.getProjectMetrics: scan failed", "error", err)
			continue
		}

		if m.TotalItems > 0 {
			m.CompletionPct = m.DoneItems * 100 / m.TotalItems
		}

		// Compute average velocity from completed sprints
		var avgVel *int
		_ = h.db.QueryRow(r.Context(),
			`SELECT AVG(velocity)::int FROM sprints
			 WHERE project_id = $1 AND status = 'completed' AND velocity IS NOT NULL`, m.ID).Scan(&avgVel)
		m.AvgVelocity = avgVel

		// Compute health
		activeItems := m.TotalItems - m.DoneItems
		if m.CriticalBugs > 0 {
			m.Health = "at_risk"
		} else if activeItems > 0 && m.BlockedCount*10 > activeItems {
			m.Health = "blocked"
		} else if m.CompletionPct >= 60 || m.TotalItems == 0 {
			m.Health = "healthy"
		} else {
			m.Health = "at_risk"
		}

		result = append(result, m)
	}
	if result == nil {
		result = []projectMetric{}
	}
	return result
}
