package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/OhByron/PlanA/internal/auth"
)

type ShareHandlers struct {
	db DBPOOL
}

func NewShareHandlers(db DBPOOL) *ShareHandlers {
	return &ShareHandlers{db: db}
}

// ---------- Token management (authenticated) ----------

type ShareToken struct {
	ID        string     `json:"id"`
	ProjectID string     `json:"project_id"`
	Token     string     `json:"token"`
	Label     string     `json:"label"`
	ExpiresAt *time.Time `json:"expires_at"`
	CreatedBy string     `json:"created_by"`
	CreatedAt time.Time  `json:"created_at"`
	RevokedAt *time.Time `json:"revoked_at"`
}

// List returns all share tokens for a project.
func (h *ShareHandlers) List(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	rows, err := h.db.Query(r.Context(),
		`SELECT id, project_id, token, label, expires_at, created_by, created_at, revoked_at
		 FROM share_tokens WHERE project_id = $1 ORDER BY created_at DESC`, projectID)
	if err != nil {
		slog.Error("share.List: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list share tokens")
		return
	}
	defer rows.Close()

	tokens := []ShareToken{}
	for rows.Next() {
		var t ShareToken
		if err := rows.Scan(&t.ID, &t.ProjectID, &t.Token, &t.Label, &t.ExpiresAt, &t.CreatedBy, &t.CreatedAt, &t.RevokedAt); err != nil {
			slog.Error("share.List: scan failed", "error", err)
			continue
		}
		tokens = append(tokens, t)
	}

	writeJSON(w, http.StatusOK, tokens)
}

// Create generates a new share token for a project.
func (h *ShareHandlers) Create(w http.ResponseWriter, r *http.Request) {
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
		Label     string `json:"label"`
		ExpiresIn *int   `json:"expires_in_days"` // optional: days until expiry
	}
	if !readJSON(w, r, &body) {
		return
	}
	if body.Label == "" {
		body.Label = "Stakeholder"
	}

	// Generate a cryptographically random token
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		writeError(w, http.StatusInternalServerError, "token_error", "Failed to generate token")
		return
	}
	token := hex.EncodeToString(tokenBytes)

	var expiresAt *time.Time
	if body.ExpiresIn != nil && *body.ExpiresIn > 0 {
		t := time.Now().Add(time.Duration(*body.ExpiresIn) * 24 * time.Hour)
		expiresAt = &t
	}

	var st ShareToken
	err := h.db.QueryRow(r.Context(),
		`INSERT INTO share_tokens (project_id, token, label, expires_at, created_by)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, project_id, token, label, expires_at, created_by, created_at, revoked_at`,
		projectID, token, body.Label, expiresAt, claims.UserID,
	).Scan(&st.ID, &st.ProjectID, &st.Token, &st.Label, &st.ExpiresAt, &st.CreatedBy, &st.CreatedAt, &st.RevokedAt)
	if err != nil {
		slog.Error("share.Create: insert failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to create share token")
		return
	}

	writeJSON(w, http.StatusCreated, st)
}

// Revoke marks a share token as revoked.
func (h *ShareHandlers) Revoke(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	tokenID := chi.URLParam(r, "tokenID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	tag, err := h.db.Exec(r.Context(),
		`UPDATE share_tokens SET revoked_at = NOW() WHERE id = $1 AND project_id = $2 AND revoked_at IS NULL`,
		tokenID, projectID)
	if err != nil {
		slog.Error("share.Revoke: exec failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to revoke token")
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "not_found", "Token not found or already revoked")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "revoked"})
}

// ---------- Public dashboard (token-authenticated) ----------

// Dashboard returns read-only project data for a valid share token.
// GET /api/share/{token}/dashboard
func (h *ShareHandlers) Dashboard(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")

	// Validate token
	var projectID string
	var expiresAt *time.Time
	err := h.db.QueryRow(r.Context(),
		`SELECT project_id, expires_at FROM share_tokens
		 WHERE token = $1 AND revoked_at IS NULL`, token,
	).Scan(&projectID, &expiresAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusUnauthorized, "invalid_token", "Invalid or revoked share link")
			return
		}
		slog.Error("share.Dashboard: token lookup failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to validate token")
		return
	}

	if expiresAt != nil && time.Now().After(*expiresAt) {
		writeError(w, http.StatusUnauthorized, "token_expired", "This share link has expired")
		return
	}

	// Gather dashboard data
	dashboard := map[string]any{}

	// Project info
	var projectName string
	var projectDesc *string
	_ = h.db.QueryRow(r.Context(),
		`SELECT name, description FROM projects WHERE id = $1`, projectID,
	).Scan(&projectName, &projectDesc)
	dashboard["project"] = map[string]any{
		"name":        projectName,
		"description": projectDesc,
	}

	// Active sprint
	var sprintName, sprintGoal *string
	var sprintStart, sprintEnd *time.Time
	var sprintID *string
	err = h.db.QueryRow(r.Context(),
		`SELECT id, name, goal, start_date, end_date FROM sprints
		 WHERE project_id = $1 AND status = 'active' LIMIT 1`, projectID,
	).Scan(&sprintID, &sprintName, &sprintGoal, &sprintStart, &sprintEnd)
	if err == nil && sprintID != nil {
		// Sprint metrics
		var totalItems, doneItems int
		_ = h.db.QueryRow(r.Context(),
			`SELECT COUNT(*), COUNT(*) FILTER (WHERE ws.is_terminal = TRUE OR wi.is_cancelled = TRUE)
			 FROM sprint_items si
			 JOIN work_items wi ON wi.id = si.work_item_id
			 JOIN workflow_states ws ON ws.id = wi.workflow_state_id
			 WHERE si.sprint_id = $1`, *sprintID,
		).Scan(&totalItems, &doneItems)

		var totalPoints, donePoints int
		_ = h.db.QueryRow(r.Context(),
			`SELECT COALESCE(SUM(wi.story_points), 0),
			        COALESCE(SUM(wi.story_points) FILTER (WHERE ws.is_terminal = TRUE OR wi.is_cancelled = TRUE), 0)
			 FROM sprint_items si
			 JOIN work_items wi ON wi.id = si.work_item_id
			 JOIN workflow_states ws ON ws.id = wi.workflow_state_id
			 WHERE si.sprint_id = $1`, *sprintID,
		).Scan(&totalPoints, &donePoints)

		dashboard["sprint"] = map[string]any{
			"name":         sprintName,
			"goal":         sprintGoal,
			"start_date":   sprintStart,
			"end_date":     sprintEnd,
			"total_items":  totalItems,
			"done_items":   doneItems,
			"total_points": totalPoints,
			"done_points":  donePoints,
		}
	}

	// Recently completed items (done in last 14 days)
	type completedItem struct {
		Title  string    `json:"title"`
		Type   string    `json:"type"`
		DoneAt time.Time `json:"done_at"`
	}
	var completed []completedItem
	rows, err := h.db.Query(r.Context(),
		`SELECT wi.title, wi.type, wi.updated_at FROM work_items wi
		 JOIN workflow_states ws ON ws.id = wi.workflow_state_id
		 WHERE wi.project_id = $1 AND ws.is_terminal = true
		 ORDER BY wi.updated_at DESC LIMIT 20`, projectID)
	if err == nil {
		for rows.Next() {
			var c completedItem
			if rows.Scan(&c.Title, &c.Type, &c.DoneAt) == nil {
				completed = append(completed, c)
			}
		}
		rows.Close()
	}
	dashboard["completed"] = completed

	// Defect summary
	var openDefects, closedDefects int
	_ = h.db.QueryRow(r.Context(),
		`SELECT
			COUNT(*) FILTER (WHERE ws.is_terminal = FALSE AND wi.is_cancelled = FALSE),
			COUNT(*) FILTER (WHERE ws.is_terminal = TRUE OR wi.is_cancelled = TRUE)
		 FROM work_items wi
		 JOIN workflow_states ws ON ws.id = wi.workflow_state_id
		 WHERE wi.project_id = $1 AND wi.type = 'bug'`, projectID,
	).Scan(&openDefects, &closedDefects)
	dashboard["defects"] = map[string]int{
		"open":   openDefects,
		"closed": closedDefects,
	}

	// Velocity (last 5 completed sprints)
	type velocityPoint struct {
		Name     string `json:"name"`
		Velocity *int   `json:"velocity"`
	}
	var velocity []velocityPoint
	vRows, err := h.db.Query(r.Context(),
		`SELECT name, velocity FROM sprints
		 WHERE project_id = $1 AND status = 'completed' AND velocity IS NOT NULL
		 ORDER BY end_date DESC LIMIT 5`, projectID)
	if err == nil {
		for vRows.Next() {
			var v velocityPoint
			if vRows.Scan(&v.Name, &v.Velocity) == nil {
				velocity = append(velocity, v)
			}
		}
		vRows.Close()
	}
	dashboard["velocity"] = velocity

	// Overall progress
	var totalStories, doneStories int
	_ = h.db.QueryRow(r.Context(),
		`SELECT COUNT(*), COUNT(*) FILTER (WHERE ws.is_terminal = true)
		 FROM work_items wi
		 JOIN workflow_states ws ON ws.id = wi.workflow_state_id
		 WHERE wi.project_id = $1 AND wi.type = 'story'`, projectID,
	).Scan(&totalStories, &doneStories)
	dashboard["progress"] = map[string]int{
		"total_stories": totalStories,
		"done_stories":  doneStories,
	}

	// Test health
	var totalTests, passedTests, failedTests int
	_ = h.db.QueryRow(r.Context(),
		`SELECT COUNT(*),
		        COUNT(*) FILTER (WHERE status = 'pass'),
		        COUNT(*) FILTER (WHERE status IN ('fail', 'error'))
		 FROM test_results WHERE project_id = $1`, projectID,
	).Scan(&totalTests, &passedTests, &failedTests)
	dashboard["tests"] = map[string]int{
		"total":  totalTests,
		"passed": passedTests,
		"failed": failedTests,
	}

	writeJSON(w, http.StatusOK, dashboard)
}
