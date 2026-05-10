package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/OhByron/PlanA/internal/auth"
	"github.com/OhByron/PlanA/internal/vcs"
)

// VCSActivityHandlers provides read endpoints for VCS data linked to work items.
type VCSActivityHandlers struct {
	db        DBPOOL
	encryptor *vcs.TokenEncryptor
}

func NewVCSActivityHandlers(db DBPOOL, encryptor *vcs.TokenEncryptor) *VCSActivityHandlers {
	return &VCSActivityHandlers{db: db, encryptor: encryptor}
}

// ---------- Response types ----------

type vcsBranch struct {
	ID           string    `json:"id"`
	ConnectionID string    `json:"connection_id"`
	Name         string    `json:"name"`
	SHA          *string   `json:"sha"`
	URL          *string   `json:"url"`
	Provider     string    `json:"provider"`
	RepoOwner    string    `json:"repo_owner"`
	RepoName     string    `json:"repo_name"`
	CreatedAt    time.Time `json:"created_at"`
}

type vcsPullRequest struct {
	ID           string     `json:"id"`
	ConnectionID string     `json:"connection_id"`
	ExternalID   int64      `json:"external_id"`
	Title        string     `json:"title"`
	State        string     `json:"state"`
	Draft        bool       `json:"draft"`
	SourceBranch string     `json:"source_branch"`
	TargetBranch string     `json:"target_branch"`
	AuthorLogin  *string    `json:"author_login"`
	AuthorAvatar *string    `json:"author_avatar"`
	URL          string     `json:"url"`
	ChecksStatus *string    `json:"checks_status"`
	ChecksURL    *string    `json:"checks_url"`
	ReviewStatus *string    `json:"review_status"`
	MergedAt     *time.Time `json:"merged_at"`
	ClosedAt     *time.Time `json:"closed_at"`
	Provider     string     `json:"provider"`
	RepoOwner    string     `json:"repo_owner"`
	RepoName     string     `json:"repo_name"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

type vcsCommit struct {
	ID           string    `json:"id"`
	ConnectionID string    `json:"connection_id"`
	SHA          string    `json:"sha"`
	Message      string    `json:"message"`
	AuthorLogin  *string   `json:"author_login"`
	AuthorEmail  *string   `json:"author_email"`
	URL          *string   `json:"url"`
	Provider     string    `json:"provider"`
	RepoOwner    string    `json:"repo_owner"`
	RepoName     string    `json:"repo_name"`
	CommittedAt  time.Time `json:"committed_at"`
}

type vcsSummary struct {
	BranchCount  int     `json:"branch_count"`
	OpenPRCount  int     `json:"open_pr_count"`
	MergedPRs    int     `json:"merged_prs"`
	CommitCount  int     `json:"commit_count"`
	ChecksStatus *string `json:"checks_status"`
	ReviewStatus *string `json:"review_status"`
}

// ---------- Bulk VCS Summary (for board cards) ----------

func (h *VCSActivityHandlers) BulkSummary(w http.ResponseWriter, r *http.Request) {
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
		`SELECT wi.id,
		        COALESCE((SELECT COUNT(*) FROM vcs_branches b
		                    JOIN vcs_connections c ON c.id = b.connection_id
		                   WHERE b.work_item_id = wi.id AND c.project_id = $1), 0) AS branch_count,
		        COALESCE((SELECT COUNT(*) FROM vcs_pull_requests pr
		                    JOIN vcs_connections c ON c.id = pr.connection_id
		                   WHERE pr.work_item_id = wi.id AND c.project_id = $1 AND pr.state = 'open'), 0) AS open_prs,
		        COALESCE((SELECT COUNT(*) FROM vcs_pull_requests pr
		                    JOIN vcs_connections c ON c.id = pr.connection_id
		                   WHERE pr.work_item_id = wi.id AND c.project_id = $1 AND pr.state = 'merged'), 0) AS merged_prs,
		        (SELECT pr.checks_status FROM vcs_pull_requests pr
		           JOIN vcs_connections c ON c.id = pr.connection_id
		          WHERE pr.work_item_id = wi.id AND c.project_id = $1 AND pr.state = 'open'
		          ORDER BY pr.updated_at DESC LIMIT 1) AS checks_status
		   FROM work_items wi
		  WHERE wi.project_id = $1
		    AND EXISTS (
		      SELECT 1 FROM vcs_branches b JOIN vcs_connections c ON c.id = b.connection_id WHERE b.work_item_id = wi.id AND c.project_id = $1
		      UNION ALL
		      SELECT 1 FROM vcs_pull_requests pr JOIN vcs_connections c ON c.id = pr.connection_id WHERE pr.work_item_id = wi.id AND c.project_id = $1
		    )`, projectID)
	if err != nil {
		slog.Error("vcs_activity.BulkSummary: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to load VCS summaries")
		return
	}
	defer rows.Close()

	type bulkItem struct {
		WorkItemID   string  `json:"work_item_id"`
		BranchCount  int     `json:"branch_count"`
		OpenPRCount  int     `json:"open_pr_count"`
		MergedPRs    int     `json:"merged_prs"`
		ChecksStatus *string `json:"checks_status"`
	}

	result := []bulkItem{}
	for rows.Next() {
		var b bulkItem
		if err := rows.Scan(&b.WorkItemID, &b.BranchCount, &b.OpenPRCount, &b.MergedPRs, &b.ChecksStatus); err != nil {
			slog.Error("vcs_activity.BulkSummary: scan failed", "error", err)
			continue
		}
		result = append(result, b)
	}
	writeJSON(w, http.StatusOK, result)
}

// ---------- VCS Summary ----------

func (h *VCSActivityHandlers) VCSSummary(w http.ResponseWriter, r *http.Request) {
	workItemID := chi.URLParam(r, "workItemID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	projectID := resolveProjectID(r.Context(), h.db, workItemID)
	if projectID == "" {
		writeError(w, http.StatusNotFound, "not_found", "Work item not found")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	var s vcsSummary
	err := h.db.QueryRow(r.Context(),
		`SELECT
		   (SELECT COUNT(*) FROM vcs_branches WHERE work_item_id = $1),
		   (SELECT COUNT(*) FROM vcs_pull_requests WHERE work_item_id = $1 AND state = 'open'),
		   (SELECT COUNT(*) FROM vcs_pull_requests WHERE work_item_id = $1 AND state = 'merged'),
		   (SELECT COUNT(*) FROM vcs_commits WHERE work_item_id = $1)`,
		workItemID,
	).Scan(&s.BranchCount, &s.OpenPRCount, &s.MergedPRs, &s.CommitCount)
	if err != nil {
		slog.Error("vcs_activity.VCSSummary: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to load VCS summary")
		return
	}

	// Get the latest PR checks/review status
	_ = h.db.QueryRow(r.Context(),
		`SELECT checks_status, review_status FROM vcs_pull_requests
		  WHERE work_item_id = $1 AND state = 'open'
		  ORDER BY updated_at DESC LIMIT 1`,
		workItemID,
	).Scan(&s.ChecksStatus, &s.ReviewStatus)

	writeJSON(w, http.StatusOK, s)
}

// ---------- List Branches ----------

func (h *VCSActivityHandlers) ListBranches(w http.ResponseWriter, r *http.Request) {
	workItemID := chi.URLParam(r, "workItemID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	projectID := resolveProjectID(r.Context(), h.db, workItemID)
	if projectID == "" {
		writeError(w, http.StatusNotFound, "not_found", "Work item not found")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	rows, err := h.db.Query(r.Context(),
		`SELECT b.id, b.connection_id, b.name, b.sha, b.url,
		        c.provider, c.owner, c.repo, b.created_at
		   FROM vcs_branches b
		   JOIN vcs_connections c ON c.id = b.connection_id
		  WHERE b.work_item_id = $1
		  ORDER BY b.created_at DESC`, workItemID)
	if err != nil {
		slog.Error("vcs_activity.ListBranches: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to load branches")
		return
	}
	defer rows.Close()

	branches := []vcsBranch{}
	for rows.Next() {
		var b vcsBranch
		if err := rows.Scan(&b.ID, &b.ConnectionID, &b.Name, &b.SHA, &b.URL,
			&b.Provider, &b.RepoOwner, &b.RepoName, &b.CreatedAt); err != nil {
			slog.Error("vcs_activity.ListBranches: scan failed", "error", err)
			continue
		}
		branches = append(branches, b)
	}
	writeJSON(w, http.StatusOK, branches)
}

// ---------- List Pull Requests ----------

func (h *VCSActivityHandlers) ListPRs(w http.ResponseWriter, r *http.Request) {
	workItemID := chi.URLParam(r, "workItemID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	projectID := resolveProjectID(r.Context(), h.db, workItemID)
	if projectID == "" {
		writeError(w, http.StatusNotFound, "not_found", "Work item not found")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	rows, err := h.db.Query(r.Context(),
		`SELECT p.id, p.connection_id, p.external_id, p.title, p.state, p.draft,
		        p.source_branch, p.target_branch, p.author_login, p.author_avatar,
		        p.url, p.checks_status, p.checks_url, p.review_status, p.merged_at, p.closed_at,
		        c.provider, c.owner, c.repo, p.created_at, p.updated_at
		   FROM vcs_pull_requests p
		   JOIN vcs_connections c ON c.id = p.connection_id
		  WHERE p.work_item_id = $1
		  ORDER BY p.created_at DESC`, workItemID)
	if err != nil {
		slog.Error("vcs_activity.ListPRs: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to load pull requests")
		return
	}
	defer rows.Close()

	prs := []vcsPullRequest{}
	for rows.Next() {
		var p vcsPullRequest
		if err := rows.Scan(&p.ID, &p.ConnectionID, &p.ExternalID, &p.Title, &p.State,
			&p.Draft, &p.SourceBranch, &p.TargetBranch, &p.AuthorLogin, &p.AuthorAvatar,
			&p.URL, &p.ChecksStatus, &p.ChecksURL, &p.ReviewStatus, &p.MergedAt, &p.ClosedAt,
			&p.Provider, &p.RepoOwner, &p.RepoName, &p.CreatedAt, &p.UpdatedAt); err != nil {
			slog.Error("vcs_activity.ListPRs: scan failed", "error", err)
			continue
		}
		prs = append(prs, p)
	}
	writeJSON(w, http.StatusOK, prs)
}

// ---------- List Commits ----------

func (h *VCSActivityHandlers) ListCommits(w http.ResponseWriter, r *http.Request) {
	workItemID := chi.URLParam(r, "workItemID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	projectID := resolveProjectID(r.Context(), h.db, workItemID)
	if projectID == "" {
		writeError(w, http.StatusNotFound, "not_found", "Work item not found")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	rows, err := h.db.Query(r.Context(),
		`SELECT co.id, co.connection_id, co.sha, co.message,
		        co.author_login, co.author_email, co.url,
		        c.provider, c.owner, c.repo, co.committed_at
		   FROM vcs_commits co
		   JOIN vcs_connections c ON c.id = co.connection_id
		  WHERE co.work_item_id = $1
		  ORDER BY co.committed_at DESC
		  LIMIT 50`, workItemID)
	if err != nil {
		slog.Error("vcs_activity.ListCommits: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to load commits")
		return
	}
	defer rows.Close()

	commits := []vcsCommit{}
	for rows.Next() {
		var co vcsCommit
		if err := rows.Scan(&co.ID, &co.ConnectionID, &co.SHA, &co.Message,
			&co.AuthorLogin, &co.AuthorEmail, &co.URL,
			&co.Provider, &co.RepoOwner, &co.RepoName, &co.CommittedAt); err != nil {
			slog.Error("vcs_activity.ListCommits: scan failed", "error", err)
			continue
		}
		commits = append(commits, co)
	}
	writeJSON(w, http.StatusOK, commits)
}

// ---------- Create Branch ----------

var nonAlphaNumBranch = regexp.MustCompile(`[^a-z0-9]+`)

func (h *VCSActivityHandlers) CreateBranch(w http.ResponseWriter, r *http.Request) {
	workItemID := chi.URLParam(r, "workItemID")
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	projectID := resolveProjectID(r.Context(), h.db, workItemID)
	if projectID == "" {
		writeError(w, http.StatusNotFound, "not_found", "Work item not found")
		return
	}
	if !requireProjectAccess(r.Context(), h.db, w, projectID, claims.UserID) {
		return
	}

	// Get work item details for branch name
	var itemNumber int
	var title string
	err := h.db.QueryRow(r.Context(),
		`SELECT item_number, title FROM work_items WHERE id = $1`, workItemID,
	).Scan(&itemNumber, &title)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "Work item not found")
		return
	}

	// Build branch name
	slug := strings.ToLower(strings.TrimSpace(title))
	slug = nonAlphaNumBranch.ReplaceAllString(slug, "-")
	slug = strings.Trim(slug, "-")
	if len(slug) > 40 {
		slug = slug[:40]
		slug = strings.TrimRight(slug, "-")
	}
	branchName := fmt.Sprintf("feature/#%d-%s", itemNumber, slug)

	// Find the first enabled connection for this project
	var connID, provider, owner, repo, defaultBranch string
	var encryptedToken []byte
	err = h.db.QueryRow(r.Context(),
		`SELECT id, provider, owner, repo, default_branch, encrypted_token
		   FROM vcs_connections
		  WHERE project_id = $1 AND enabled = true AND encrypted_token IS NOT NULL
		  ORDER BY created_at LIMIT 1`, projectID,
	).Scan(&connID, &provider, &owner, &repo, &defaultBranch, &encryptedToken)
	if err != nil {
		writeError(w, http.StatusBadRequest, "no_connection", "No enabled VCS connection found for this project")
		return
	}

	token, err := h.encryptor.Decrypt(encryptedToken)
	if err != nil {
		slog.Error("vcs_activity.CreateBranch: decrypt failed", "error", err)
		writeError(w, http.StatusInternalServerError, "server_error", "Failed to decrypt token")
		return
	}

	// Get the SHA of the default branch to branch from
	var apiErr error
	switch provider {
	case "github":
		apiErr = h.createGitHubBranch(r.Context(), token, owner, repo, defaultBranch, branchName)
	case "gitlab":
		apiErr = h.createGitLabBranch(r.Context(), token, owner, repo, defaultBranch, branchName)
	}

	if apiErr != nil {
		slog.Error("vcs_activity.CreateBranch: API call failed", "error", apiErr)
		writeError(w, http.StatusBadGateway, "provider_error", fmt.Sprintf("Failed to create branch: %v", apiErr))
		return
	}

	// Record the branch in our database
	_, _ = h.db.Exec(r.Context(),
		`INSERT INTO vcs_branches (connection_id, work_item_id, name)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (connection_id, name) DO UPDATE SET work_item_id = $2, updated_at = NOW()`,
		connID, workItemID, branchName)

	writeJSON(w, http.StatusCreated, map[string]string{
		"branch":   branchName,
		"provider": provider,
		"repo":     fmt.Sprintf("%s/%s", owner, repo),
	})
}

func (h *VCSActivityHandlers) createGitHubBranch(ctx context.Context, token, owner, repo, baseBranch, newBranch string) error {
	// Get the SHA of the base branch
	refURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/git/ref/heads/%s", owner, repo, baseBranch)
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, refURL, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "PlanA/1.0")

	resp, err := vcsHTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("get base ref: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("get base ref: HTTP %d", resp.StatusCode)
	}

	var refResp struct {
		Object struct {
			SHA string `json:"sha"`
		} `json:"object"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&refResp); err != nil {
		return fmt.Errorf("decode ref: %w", err)
	}

	// Create the new branch
	body, _ := json.Marshal(map[string]string{
		"ref": "refs/heads/" + newBranch,
		"sha": refResp.Object.SHA,
	})
	createURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/git/refs", owner, repo)
	req2, _ := http.NewRequestWithContext(ctx, http.MethodPost, createURL, strings.NewReader(string(body)))
	req2.Header.Set("Authorization", "Bearer "+token)
	req2.Header.Set("Accept", "application/vnd.github+json")
	req2.Header.Set("User-Agent", "PlanA/1.0")

	resp2, err := vcsHTTPClient.Do(req2)
	if err != nil {
		return fmt.Errorf("create ref: %w", err)
	}
	defer resp2.Body.Close()

	if resp2.StatusCode != http.StatusCreated {
		return fmt.Errorf("create ref: HTTP %d", resp2.StatusCode)
	}
	return nil
}

func (h *VCSActivityHandlers) createGitLabBranch(ctx context.Context, token, owner, repo, baseBranch, newBranch string) error {
	projectID := url.PathEscape(owner) + "%2F" + url.PathEscape(repo)
	apiURL := fmt.Sprintf("https://gitlab.com/api/v4/projects/%s/repository/branches?branch=%s&ref=%s",
		projectID, url.QueryEscape(newBranch), url.QueryEscape(baseBranch))
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, nil)
	req.Header.Set("PRIVATE-TOKEN", token)
	req.Header.Set("User-Agent", "PlanA/1.0")

	resp, err := vcsHTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("create branch: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("create branch: HTTP %d", resp.StatusCode)
	}
	return nil
}
