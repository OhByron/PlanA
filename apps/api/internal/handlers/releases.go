package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/OhByron/PlanA/internal/ai"
	"github.com/OhByron/PlanA/internal/auth"
)

type ReleaseHandlers struct {
	db      DBPOOL
	publish EventPublishFunc
}

func NewReleaseHandlers(db DBPOOL, publish EventPublishFunc) *ReleaseHandlers {
	return &ReleaseHandlers{db: db, publish: publish}
}

type releaseResponse struct {
	ID          string     `json:"id"`
	ProjectID   string     `json:"project_id"`
	Name        string     `json:"name"`
	Version     *string    `json:"version"`
	Description *string    `json:"description"`
	Status      string     `json:"status"`
	Notes       *string    `json:"notes"`
	ShareToken  *string    `json:"share_token"`
	PublishedAt *time.Time `json:"published_at"`
	CreatedBy   string     `json:"created_by"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	ItemCount   int        `json:"item_count"`
}

// ---------- List ----------

func (h *ReleaseHandlers) List(w http.ResponseWriter, r *http.Request) {
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
		`SELECT r.id, r.project_id, r.name, r.version, r.description, r.status,
		        r.notes, r.share_token, r.published_at, r.created_by, r.created_at, r.updated_at,
		        (SELECT COUNT(*) FROM release_items ri WHERE ri.release_id = r.id) AS item_count
		   FROM releases r WHERE r.project_id = $1
		   ORDER BY r.created_at DESC`, projectID)
	if err != nil {
		slog.Error("releases.List: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list releases")
		return
	}
	defer rows.Close()

	releases := []releaseResponse{}
	for rows.Next() {
		var rel releaseResponse
		if err := rows.Scan(&rel.ID, &rel.ProjectID, &rel.Name, &rel.Version, &rel.Description,
			&rel.Status, &rel.Notes, &rel.ShareToken, &rel.PublishedAt, &rel.CreatedBy,
			&rel.CreatedAt, &rel.UpdatedAt, &rel.ItemCount); err != nil {
			slog.Error("releases.List: scan failed", "error", err)
			continue
		}
		releases = append(releases, rel)
	}
	writeJSON(w, http.StatusOK, releases)
}

// ---------- Create ----------

func (h *ReleaseHandlers) Create(w http.ResponseWriter, r *http.Request) {
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
		Name      string   `json:"name"`
		Version   *string  `json:"version"`
		SprintIDs []string `json:"sprint_ids"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	if body.Name == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "name is required")
		return
	}

	tx, err := h.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to start transaction")
		return
	}
	defer tx.Rollback(r.Context())

	var releaseID string
	err = tx.QueryRow(r.Context(),
		`INSERT INTO releases (project_id, name, version, created_by)
		 VALUES ($1, $2, $3, $4) RETURNING id`,
		projectID, body.Name, body.Version, claims.UserID).Scan(&releaseID)
	if err != nil {
		slog.Error("releases.Create: insert failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to create release")
		return
	}

	// Link sprints and auto-populate items from terminal work items in those sprints
	for _, sprintID := range body.SprintIDs {
		_, _ = tx.Exec(r.Context(),
			`INSERT INTO release_sprints (release_id, sprint_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
			releaseID, sprintID)

		// Add all terminal (done) items from this sprint
		_, _ = tx.Exec(r.Context(),
			`INSERT INTO release_items (release_id, work_item_id)
			 SELECT $1, si.work_item_id
			 FROM sprint_items si
			 JOIN work_items wi ON wi.id = si.work_item_id
			 JOIN workflow_states ws ON ws.id = wi.workflow_state_id
			 WHERE si.sprint_id = $2 AND ws.is_terminal = true AND wi.is_cancelled = false
			 ON CONFLICT DO NOTHING`,
			releaseID, sprintID)
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to create release")
		return
	}

	// Fetch and return
	h.getAndRespond(w, r, releaseID, http.StatusCreated)
}

// ---------- Get ----------

func (h *ReleaseHandlers) Get(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	releaseID := chi.URLParam(r, "releaseID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	h.getAndRespond(w, r, releaseID, http.StatusOK)
}

// ---------- Update ----------

func (h *ReleaseHandlers) Update(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	releaseID := chi.URLParam(r, "releaseID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	// Only draft releases can be updated
	var status string
	err := h.db.QueryRow(r.Context(),
		`SELECT status FROM releases WHERE id = $1 AND project_id = $2`, releaseID, projectID).Scan(&status)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "Release not found")
		return
	}
	if status != "draft" {
		writeError(w, http.StatusConflict, "locked", "Published releases cannot be edited")
		return
	}

	var body struct {
		Name        *string `json:"name"`
		Version     *string `json:"version"`
		Description *string `json:"description"`
		Notes       *string `json:"notes"`
	}
	if !readJSON(w, r, &body) {
		return
	}

	fields := []string{}
	args := []any{}
	argN := 1

	for _, f := range []struct {
		col string
		val *string
	}{
		{"name", body.Name},
		{"version", body.Version},
		{"description", body.Description},
		{"notes", body.Notes},
	} {
		if f.val != nil {
			fields = append(fields, fmt.Sprintf("%s = $%d", f.col, argN))
			args = append(args, *f.val)
			argN++
		}
	}

	if len(fields) == 0 {
		writeError(w, http.StatusBadRequest, "validation_error", "No fields to update")
		return
	}

	args = append(args, releaseID, projectID)
	query := fmt.Sprintf(`UPDATE releases SET %s WHERE id = $%d AND project_id = $%d`,
		strings.Join(fields, ", "), argN, argN+1)
	_, err = h.db.Exec(r.Context(), query, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to update release")
		return
	}

	h.getAndRespond(w, r, releaseID, http.StatusOK)
}

// ---------- Add/Remove Items ----------

func (h *ReleaseHandlers) AddItem(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	releaseID := chi.URLParam(r, "releaseID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	var body struct {
		WorkItemID string `json:"work_item_id"`
	}
	if !readJSON(w, r, &body) {
		return
	}

	_, err := h.db.Exec(r.Context(),
		`INSERT INTO release_items (release_id, work_item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		releaseID, body.WorkItemID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to add item")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *ReleaseHandlers) RemoveItem(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	releaseID := chi.URLParam(r, "releaseID")
	workItemID := chi.URLParam(r, "workItemID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	_, _ = h.db.Exec(r.Context(),
		`DELETE FROM release_items WHERE release_id = $1 AND work_item_id = $2`,
		releaseID, workItemID)
	w.WriteHeader(http.StatusNoContent)
}

// ---------- Generate Notes (Template) ----------

func (h *ReleaseHandlers) GenerateNotes(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	releaseID := chi.URLParam(r, "releaseID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	// Get release info
	var name string
	var version *string
	_ = h.db.QueryRow(r.Context(),
		`SELECT name, version FROM releases WHERE id = $1`, releaseID).Scan(&name, &version)

	// Get items grouped by type
	rows, err := h.db.Query(r.Context(),
		`SELECT wi.type, wi.item_number, wi.title
		   FROM release_items ri
		   JOIN work_items wi ON wi.id = ri.work_item_id
		  WHERE ri.release_id = $1
		  ORDER BY wi.type, wi.item_number`, releaseID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to generate notes")
		return
	}
	defer rows.Close()

	stories := []string{}
	bugs := []string{}
	tasks := []string{}

	for rows.Next() {
		var itemType string
		var itemNumber *int
		var title string
		if err := rows.Scan(&itemType, &itemNumber, &title); err != nil {
			continue
		}
		line := fmt.Sprintf("- #%d %s", 0, title)
		if itemNumber != nil {
			line = fmt.Sprintf("- #%d %s", *itemNumber, title)
		}
		switch itemType {
		case "story":
			stories = append(stories, line)
		case "bug":
			bugs = append(bugs, line)
		case "task":
			tasks = append(tasks, line)
		}
	}

	// Build markdown
	var sb strings.Builder
	header := name
	if version != nil && *version != "" {
		header = fmt.Sprintf("%s (v%s)", name, *version)
	}
	sb.WriteString(fmt.Sprintf("# %s\n\n", header))

	if len(stories) > 0 {
		sb.WriteString("## New Features\n")
		for _, s := range stories {
			sb.WriteString(s + "\n")
		}
		sb.WriteString("\n")
	}
	if len(bugs) > 0 {
		sb.WriteString("## Bug Fixes\n")
		for _, b := range bugs {
			sb.WriteString(b + "\n")
		}
		sb.WriteString("\n")
	}
	if len(tasks) > 0 {
		sb.WriteString("## Tasks\n")
		for _, t := range tasks {
			sb.WriteString(t + "\n")
		}
		sb.WriteString("\n")
	}

	sb.WriteString(fmt.Sprintf("---\nPublished: %s\n", time.Now().Format("2006-01-02")))

	notes := sb.String()

	// Save notes to release
	_, _ = h.db.Exec(r.Context(),
		`UPDATE releases SET notes = $1 WHERE id = $2`, notes, releaseID)

	writeJSON(w, http.StatusOK, map[string]string{"notes": notes})
}

// ---------- Enhance Notes (AI) ----------

func (h *ReleaseHandlers) EnhanceNotes(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	releaseID := chi.URLParam(r, "releaseID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	// Get current notes
	var currentNotes *string
	_ = h.db.QueryRow(r.Context(),
		`SELECT notes FROM releases WHERE id = $1`, releaseID).Scan(&currentNotes)

	if currentNotes == nil || *currentNotes == "" {
		writeError(w, http.StatusBadRequest, "no_notes", "Generate template notes first before enhancing with AI")
		return
	}

	// Get AI provider (project config + global env fallback)
	provider, _, ok := loadAIProvider(w, r, h.db, projectID)
	if !ok {
		return
	}

	lang := r.Header.Get("X-Language")
	systemPrompt := `You are a technical writer. Given a structured changelog, rewrite it as professional release notes suitable for stakeholders. Focus on business value and user impact. Keep item numbers. Return only the markdown, no wrapper.`
	if li := ai.LanguageInstruction(lang); li != "" {
		systemPrompt += " " + li
	}

	enhanced, err := provider.RawChat(r.Context(), systemPrompt, *currentNotes)
	if err != nil {
		slog.Error("releases.EnhanceNotes: AI failed", "error", err)
		writeError(w, http.StatusInternalServerError, "ai_error", "AI enhancement failed")
		return
	}

	// Save enhanced notes
	_, _ = h.db.Exec(r.Context(),
		`UPDATE releases SET notes = $1 WHERE id = $2`, enhanced, releaseID)

	writeJSON(w, http.StatusOK, map[string]string{"notes": enhanced})
}

// ---------- Publish ----------

func (h *ReleaseHandlers) Publish(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	releaseID := chi.URLParam(r, "releaseID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	tag, err := h.db.Exec(r.Context(),
		`UPDATE releases SET status = 'published', published_at = NOW()
		  WHERE id = $1 AND project_id = $2 AND status = 'draft'`,
		releaseID, projectID)
	if err != nil || tag.RowsAffected() == 0 {
		writeError(w, http.StatusConflict, "publish_failed", "Release not found or already published")
		return
	}

	h.getAndRespond(w, r, releaseID, http.StatusOK)
}

// ---------- Share / Unshare ----------

func (h *ReleaseHandlers) Share(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	releaseID := chi.URLParam(r, "releaseID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	token := generateShareToken()
	_, err := h.db.Exec(r.Context(),
		`UPDATE releases SET share_token = $1 WHERE id = $2 AND project_id = $3`,
		token, releaseID, projectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to generate share link")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"share_token": token})
}

func (h *ReleaseHandlers) Unshare(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	releaseID := chi.URLParam(r, "releaseID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	_, _ = h.db.Exec(r.Context(),
		`UPDATE releases SET share_token = NULL WHERE id = $1 AND project_id = $2`,
		releaseID, projectID)
	w.WriteHeader(http.StatusNoContent)
}

// ---------- Public Release Page ----------

func (h *ReleaseHandlers) Public(w http.ResponseWriter, r *http.Request) {
	shareToken := chi.URLParam(r, "shareToken")

	var rel releaseResponse
	var projectName string
	err := h.db.QueryRow(r.Context(),
		`SELECT r.id, r.project_id, r.name, r.version, r.description, r.status,
		        r.notes, r.share_token, r.published_at, r.created_by, r.created_at, r.updated_at,
		        p.name,
		        (SELECT COUNT(*) FROM release_items ri WHERE ri.release_id = r.id)
		   FROM releases r
		   JOIN projects p ON p.id = r.project_id
		  WHERE r.share_token = $1 AND r.status = 'published'`, shareToken,
	).Scan(&rel.ID, &rel.ProjectID, &rel.Name, &rel.Version, &rel.Description,
		&rel.Status, &rel.Notes, &rel.ShareToken, &rel.PublishedAt, &rel.CreatedBy,
		&rel.CreatedAt, &rel.UpdatedAt, &projectName, &rel.ItemCount)
	if err != nil {
		if err == pgx.ErrNoRows {
			writeError(w, http.StatusNotFound, "not_found", "Release not found or not published")
		} else {
			writeError(w, http.StatusInternalServerError, "db_error", "Failed to load release")
		}
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"release":      rel,
		"project_name": projectName,
	})
}

// ---------- Helpers ----------

func (h *ReleaseHandlers) getAndRespond(w http.ResponseWriter, r *http.Request, releaseID string, status int) {
	var rel releaseResponse
	err := h.db.QueryRow(r.Context(),
		`SELECT r.id, r.project_id, r.name, r.version, r.description, r.status,
		        r.notes, r.share_token, r.published_at, r.created_by, r.created_at, r.updated_at,
		        (SELECT COUNT(*) FROM release_items ri WHERE ri.release_id = r.id)
		   FROM releases r WHERE r.id = $1`, releaseID,
	).Scan(&rel.ID, &rel.ProjectID, &rel.Name, &rel.Version, &rel.Description,
		&rel.Status, &rel.Notes, &rel.ShareToken, &rel.PublishedAt, &rel.CreatedBy,
		&rel.CreatedAt, &rel.UpdatedAt, &rel.ItemCount)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "Release not found")
		return
	}

	// Also fetch items
	type releaseItem struct {
		ID         string  `json:"id"`
		ItemNumber *int    `json:"item_number"`
		Title      string  `json:"title"`
		Type       string  `json:"type"`
		StateName  string  `json:"state_name"`
		StateColor string  `json:"state_color"`
	}

	rows, _ := h.db.Query(r.Context(),
		`SELECT wi.id, wi.item_number, wi.title, wi.type, ws.name, ws.color
		   FROM release_items ri
		   JOIN work_items wi ON wi.id = ri.work_item_id
		   JOIN workflow_states ws ON ws.id = wi.workflow_state_id
		  WHERE ri.release_id = $1
		  ORDER BY wi.type, wi.item_number`, releaseID)

	items := []releaseItem{}
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var item releaseItem
			if rows.Scan(&item.ID, &item.ItemNumber, &item.Title, &item.Type, &item.StateName, &item.StateColor) == nil {
				items = append(items, item)
			}
		}
	}

	// Fetch linked sprints
	type releaseSprint struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	sprintRows, _ := h.db.Query(r.Context(),
		`SELECT s.id, s.name FROM release_sprints rs JOIN sprints s ON s.id = rs.sprint_id
		  WHERE rs.release_id = $1 ORDER BY s.end_date`, releaseID)

	sprints := []releaseSprint{}
	if sprintRows != nil {
		defer sprintRows.Close()
		for sprintRows.Next() {
			var s releaseSprint
			if sprintRows.Scan(&s.ID, &s.Name) == nil {
				sprints = append(sprints, s)
			}
		}
	}

	writeJSON(w, status, map[string]any{
		"release": rel,
		"items":   items,
		"sprints": sprints,
	})
}

func generateShareToken() string {
	b := make([]byte, 24)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// deref is defined in ai.go
