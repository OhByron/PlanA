package handlers

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/OhByron/PlanA/internal/auth"
)

// VCSActivityHandlers provides read endpoints for VCS data linked to work items.
type VCSActivityHandlers struct {
	db DBPOOL
}

func NewVCSActivityHandlers(db DBPOOL) *VCSActivityHandlers {
	return &VCSActivityHandlers{db: db}
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
	ID            string     `json:"id"`
	ConnectionID  string     `json:"connection_id"`
	ExternalID    int64      `json:"external_id"`
	Title         string     `json:"title"`
	State         string     `json:"state"`
	Draft         bool       `json:"draft"`
	SourceBranch  string     `json:"source_branch"`
	TargetBranch  string     `json:"target_branch"`
	AuthorLogin   *string    `json:"author_login"`
	AuthorAvatar  *string    `json:"author_avatar"`
	URL           string     `json:"url"`
	ChecksStatus  *string    `json:"checks_status"`
	ReviewStatus  *string    `json:"review_status"`
	MergedAt      *time.Time `json:"merged_at"`
	ClosedAt      *time.Time `json:"closed_at"`
	Provider      string     `json:"provider"`
	RepoOwner     string     `json:"repo_owner"`
	RepoName      string     `json:"repo_name"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
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
		        p.url, p.checks_status, p.review_status, p.merged_at, p.closed_at,
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
			&p.URL, &p.ChecksStatus, &p.ReviewStatus, &p.MergedAt, &p.ClosedAt,
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
