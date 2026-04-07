package handlers

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/OhByron/PlanA/internal/auth"
	"github.com/OhByron/PlanA/internal/vcs"
)

// VCSConnectionHandlers manages repository connections for a project.
type VCSConnectionHandlers struct {
	db        DBPOOL
	encryptor *vcs.TokenEncryptor
}

func NewVCSConnectionHandlers(db DBPOOL, encryptor *vcs.TokenEncryptor) *VCSConnectionHandlers {
	return &VCSConnectionHandlers{db: db, encryptor: encryptor}
}

// ---------- Response / Request types ----------

type VCSConnection struct {
	ID             string    `json:"id"`
	ProjectID      string    `json:"project_id"`
	Provider       string    `json:"provider"`
	Owner          string    `json:"owner"`
	Repo           string    `json:"repo"`
	DefaultBranch  string    `json:"default_branch"`
	AuthMethod     string    `json:"auth_method"`
	HasToken       bool      `json:"has_token"`
	InstallationID *int64    `json:"installation_id,omitempty"`
	WebhookSecret  string    `json:"-"`
	Enabled        bool      `json:"enabled"`
	CreatedBy      string    `json:"created_by"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// ---------- Admin check ----------

// checkProjectAdmin verifies the user is a PM/PO on the project or an org admin.
func checkProjectAdmin(ctx context.Context, db DBPOOL, projectID, userID string) bool {
	var allowed bool
	err := db.QueryRow(ctx,
		`SELECT EXISTS(
			SELECT 1 FROM project_members
			  WHERE project_id = $1 AND user_id = $2 AND job_role IN ('pm', 'po')
			UNION ALL
			SELECT 1 FROM organization_members om
			  JOIN teams t ON t.organization_id = om.organization_id
			  JOIN projects p ON p.team_id = t.id
			  WHERE p.id = $1 AND om.user_id = $2 AND om.role = 'admin'
		)`, projectID, userID,
	).Scan(&allowed)
	return err == nil && allowed
}

// ---------- List ----------

func (h *VCSConnectionHandlers) List(w http.ResponseWriter, r *http.Request) {
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
		`SELECT id, project_id, provider, owner, repo, default_branch, auth_method,
		        encrypted_token IS NOT NULL AS has_token, installation_id, enabled,
		        created_by, created_at, updated_at
		   FROM vcs_connections
		  WHERE project_id = $1
		  ORDER BY created_at`, projectID)
	if err != nil {
		slog.Error("vcs_connections.List: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list connections")
		return
	}
	defer rows.Close()

	var conns []VCSConnection
	for rows.Next() {
		var c VCSConnection
		if err := rows.Scan(
			&c.ID, &c.ProjectID, &c.Provider, &c.Owner, &c.Repo, &c.DefaultBranch,
			&c.AuthMethod, &c.HasToken, &c.InstallationID, &c.Enabled,
			&c.CreatedBy, &c.CreatedAt, &c.UpdatedAt,
		); err != nil {
			slog.Error("vcs_connections.List: scan failed", "error", err)
			continue
		}
		conns = append(conns, c)
	}
	if conns == nil {
		conns = []VCSConnection{}
	}
	writeJSON(w, http.StatusOK, conns)
}

// ---------- Create ----------

type createVCSConnectionRequest struct {
	Provider       string `json:"provider"`
	Owner          string `json:"owner"`
	Repo           string `json:"repo"`
	DefaultBranch  string `json:"default_branch"`
	AuthMethod     string `json:"auth_method"`
	Token          string `json:"token"`
	InstallationID *int64 `json:"installation_id"`
}

func (h *VCSConnectionHandlers) Create(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}
	if !checkProjectAdmin(r.Context(), h.db, projectID, claims.UserID) {
		writeError(w, http.StatusForbidden, "forbidden", "Only project admins (PM/PO) can manage VCS connections")
		return
	}

	var body createVCSConnectionRequest
	if !readJSON(w, r, &body) {
		return
	}

	// Validate required fields
	if body.Provider == "" || body.Owner == "" || body.Repo == "" || body.AuthMethod == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "provider, owner, repo, and auth_method are required")
		return
	}
	if body.Provider != "github" && body.Provider != "gitlab" {
		writeError(w, http.StatusBadRequest, "validation_error", "provider must be 'github' or 'gitlab'")
		return
	}
	if body.AuthMethod != "github_app" && body.AuthMethod != "pat" && body.AuthMethod != "oauth" {
		writeError(w, http.StatusBadRequest, "validation_error", "auth_method must be 'github_app', 'pat', or 'oauth'")
		return
	}
	if body.AuthMethod != "github_app" && body.Token == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "token is required for PAT and OAuth auth methods")
		return
	}
	if body.AuthMethod == "github_app" && body.InstallationID == nil {
		writeError(w, http.StatusBadRequest, "validation_error", "installation_id is required for GitHub App auth method")
		return
	}
	if body.DefaultBranch == "" {
		body.DefaultBranch = "main"
	}

	// Generate webhook secret
	webhookSecret, err := vcs.GenerateWebhookSecret()
	if err != nil {
		slog.Error("vcs_connections.Create: failed to generate webhook secret", "error", err)
		writeError(w, http.StatusInternalServerError, "server_error", "Failed to generate webhook secret")
		return
	}

	// Encrypt token if provided
	var encryptedToken []byte
	if body.Token != "" {
		encryptedToken, err = h.encryptor.Encrypt(body.Token)
		if err != nil {
			slog.Error("vcs_connections.Create: failed to encrypt token", "error", err)
			writeError(w, http.StatusInternalServerError, "server_error", "Failed to encrypt token")
			return
		}
	}

	var conn VCSConnection
	err = h.db.QueryRow(r.Context(),
		`INSERT INTO vcs_connections
		   (project_id, provider, owner, repo, default_branch, auth_method,
		    encrypted_token, installation_id, webhook_secret, created_by)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		 RETURNING id, project_id, provider, owner, repo, default_branch, auth_method,
		           encrypted_token IS NOT NULL, installation_id, enabled, created_by,
		           created_at, updated_at`,
		projectID, body.Provider, strings.ToLower(body.Owner), strings.ToLower(body.Repo),
		body.DefaultBranch, body.AuthMethod, encryptedToken, body.InstallationID,
		webhookSecret, claims.UserID,
	).Scan(
		&conn.ID, &conn.ProjectID, &conn.Provider, &conn.Owner, &conn.Repo,
		&conn.DefaultBranch, &conn.AuthMethod, &conn.HasToken, &conn.InstallationID,
		&conn.Enabled, &conn.CreatedBy, &conn.CreatedAt, &conn.UpdatedAt,
	)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "unique") {
			writeError(w, http.StatusConflict, "conflict", "This repository is already connected to this project")
			return
		}
		slog.Error("vcs_connections.Create: insert failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to create connection")
		return
	}

	// Include webhook_secret in the create response so the admin can register it
	type createResponse struct {
		VCSConnection
		WebhookSecret string `json:"webhook_secret"`
		WebhookURL    string `json:"webhook_url"`
	}

	writeJSON(w, http.StatusCreated, createResponse{
		VCSConnection: conn,
		WebhookSecret: webhookSecret,
		WebhookURL:    fmt.Sprintf("/api/webhooks/%s/%s", body.Provider, conn.ID),
	})
}

// ---------- Get ----------

func (h *VCSConnectionHandlers) Get(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	connectionID := chi.URLParam(r, "connectionID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	var c VCSConnection
	err := h.db.QueryRow(r.Context(),
		`SELECT id, project_id, provider, owner, repo, default_branch, auth_method,
		        encrypted_token IS NOT NULL AS has_token, installation_id, enabled,
		        created_by, created_at, updated_at
		   FROM vcs_connections
		  WHERE id = $1 AND project_id = $2`, connectionID, projectID,
	).Scan(
		&c.ID, &c.ProjectID, &c.Provider, &c.Owner, &c.Repo, &c.DefaultBranch,
		&c.AuthMethod, &c.HasToken, &c.InstallationID, &c.Enabled,
		&c.CreatedBy, &c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "Connection not found")
		return
	}
	writeJSON(w, http.StatusOK, c)
}

// ---------- Update ----------

type updateVCSConnectionRequest struct {
	DefaultBranch *string `json:"default_branch"`
	Token         *string `json:"token"`
	Enabled       *bool   `json:"enabled"`
}

func (h *VCSConnectionHandlers) Update(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	connectionID := chi.URLParam(r, "connectionID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}
	if !checkProjectAdmin(r.Context(), h.db, projectID, claims.UserID) {
		writeError(w, http.StatusForbidden, "forbidden", "Only project admins (PM/PO) can manage VCS connections")
		return
	}

	var body updateVCSConnectionRequest
	if !readJSON(w, r, &body) {
		return
	}

	// Build dynamic update
	sets := []string{}
	args := []any{}
	argIdx := 1

	if body.DefaultBranch != nil {
		sets = append(sets, fmt.Sprintf("default_branch = $%d", argIdx))
		args = append(args, *body.DefaultBranch)
		argIdx++
	}
	if body.Enabled != nil {
		sets = append(sets, fmt.Sprintf("enabled = $%d", argIdx))
		args = append(args, *body.Enabled)
		argIdx++
	}
	if body.Token != nil {
		encrypted, err := h.encryptor.Encrypt(*body.Token)
		if err != nil {
			slog.Error("vcs_connections.Update: failed to encrypt token", "error", err)
			writeError(w, http.StatusInternalServerError, "server_error", "Failed to encrypt token")
			return
		}
		sets = append(sets, fmt.Sprintf("encrypted_token = $%d", argIdx))
		args = append(args, encrypted)
		argIdx++
	}

	if len(sets) == 0 {
		writeError(w, http.StatusBadRequest, "validation_error", "No fields to update")
		return
	}

	args = append(args, connectionID, projectID)
	query := fmt.Sprintf(
		`UPDATE vcs_connections SET %s WHERE id = $%d AND project_id = $%d
		 RETURNING id, project_id, provider, owner, repo, default_branch, auth_method,
		           encrypted_token IS NOT NULL, installation_id, enabled, created_by,
		           created_at, updated_at`,
		strings.Join(sets, ", "), argIdx, argIdx+1,
	)

	var c VCSConnection
	err := h.db.QueryRow(r.Context(), query, args...).Scan(
		&c.ID, &c.ProjectID, &c.Provider, &c.Owner, &c.Repo, &c.DefaultBranch,
		&c.AuthMethod, &c.HasToken, &c.InstallationID, &c.Enabled,
		&c.CreatedBy, &c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "Connection not found")
		return
	}
	writeJSON(w, http.StatusOK, c)
}

// ---------- Delete ----------

func (h *VCSConnectionHandlers) Delete(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	connectionID := chi.URLParam(r, "connectionID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}
	if !checkProjectAdmin(r.Context(), h.db, projectID, claims.UserID) {
		writeError(w, http.StatusForbidden, "forbidden", "Only project admins (PM/PO) can manage VCS connections")
		return
	}

	tag, err := h.db.Exec(r.Context(),
		`DELETE FROM vcs_connections WHERE id = $1 AND project_id = $2`,
		connectionID, projectID)
	if err != nil {
		slog.Error("vcs_connections.Delete: delete failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to delete connection")
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "not_found", "Connection not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---------- Test Connection ----------

func (h *VCSConnectionHandlers) TestConnection(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	connectionID := chi.URLParam(r, "connectionID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	// Fetch connection with encrypted token
	var provider, owner, repo string
	var encryptedToken []byte
	err := h.db.QueryRow(r.Context(),
		`SELECT provider, owner, repo, encrypted_token
		   FROM vcs_connections
		  WHERE id = $1 AND project_id = $2`, connectionID, projectID,
	).Scan(&provider, &owner, &repo, &encryptedToken)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "Connection not found")
		return
	}

	if encryptedToken == nil {
		writeError(w, http.StatusBadRequest, "no_token", "Connection has no token configured")
		return
	}

	token, err := h.encryptor.Decrypt(encryptedToken)
	if err != nil {
		slog.Error("vcs_connections.TestConnection: failed to decrypt token", "error", err)
		writeError(w, http.StatusInternalServerError, "server_error", "Failed to decrypt token")
		return
	}

	// Build the test URL based on provider
	var testURL string
	switch provider {
	case "github":
		testURL = fmt.Sprintf("https://api.github.com/repos/%s/%s", owner, repo)
	case "gitlab":
		testURL = fmt.Sprintf("https://gitlab.com/api/v4/projects/%s%%2F%s", owner, repo)
	}

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, testURL, nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server_error", "Failed to create request")
		return
	}

	switch provider {
	case "github":
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Accept", "application/vnd.github+json")
		req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	case "gitlab":
		req.Header.Set("PRIVATE-TOKEN", token)
	}
	req.Header.Set("User-Agent", "PlanA/1.0")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"success": false,
			"error":   fmt.Sprintf("Connection failed: %v", err),
		})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		writeJSON(w, http.StatusOK, map[string]any{
			"success":  true,
			"provider": provider,
			"repo":     fmt.Sprintf("%s/%s", owner, repo),
		})
	} else {
		writeJSON(w, http.StatusOK, map[string]any{
			"success":     false,
			"status_code": resp.StatusCode,
			"error":       fmt.Sprintf("Provider returned HTTP %d", resp.StatusCode),
		})
	}
}
