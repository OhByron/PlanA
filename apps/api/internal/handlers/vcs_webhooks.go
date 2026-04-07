package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/OhByron/PlanA/internal/vcs"
)

// VCSWebhookHandlers receives and processes inbound webhooks from GitHub/GitLab.
type VCSWebhookHandlers struct {
	db     DBPOOL
	github vcs.Provider
	gitlab vcs.Provider
}

func NewVCSWebhookHandlers(db DBPOOL) *VCSWebhookHandlers {
	return &VCSWebhookHandlers{
		db:     db,
		github: vcs.NewGitHubProvider(),
		gitlab: vcs.NewGitLabProvider(),
	}
}

// ---------- connection lookup ----------

type connRecord struct {
	ID        string
	ProjectID string
	Provider  string
	Owner     string
	Repo      string
	Secret    string
	Enabled   bool
}

func (h *VCSWebhookHandlers) getConnection(ctx context.Context, connectionID string) (*connRecord, error) {
	var c connRecord
	err := h.db.QueryRow(ctx,
		`SELECT id, project_id, provider, owner, repo, webhook_secret, enabled
		   FROM vcs_connections WHERE id = $1`, connectionID,
	).Scan(&c.ID, &c.ProjectID, &c.Provider, &c.Owner, &c.Repo, &c.Secret, &c.Enabled)
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// ---------- audit log ----------

func (h *VCSWebhookHandlers) logEvent(ctx context.Context, connectionID, provider, eventType, deliveryID string, payload json.RawMessage, processed bool, errMsg string) {
	_, err := h.db.Exec(ctx,
		`INSERT INTO vcs_webhook_events (connection_id, provider, event_type, delivery_id, payload, processed, error)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		connectionID, provider, eventType, deliveryID, payload, processed, nilIfEmpty(errMsg))
	if err != nil {
		slog.Error("vcs_webhooks: failed to log event", "error", err)
	}
}

// ---------- GitHub endpoint ----------

func (h *VCSWebhookHandlers) HandleGitHub(w http.ResponseWriter, r *http.Request) {
	connectionID := chi.URLParam(r, "connectionID")
	eventType := r.Header.Get("X-GitHub-Event")
	deliveryID := r.Header.Get("X-GitHub-Delivery")

	conn, err := h.getConnection(r.Context(), connectionID)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if !conn.Enabled {
		http.Error(w, "connection disabled", http.StatusServiceUnavailable)
		return
	}

	body, err := h.github.ValidateWebhook(r, conn.Secret)
	if err != nil {
		slog.Warn("vcs_webhooks: GitHub signature validation failed", "connectionID", connectionID, "error", err)
		http.Error(w, "invalid signature", http.StatusUnauthorized)
		return
	}

	// Parse event
	evt, err := h.github.ParseEvent(eventType, body)
	if err != nil {
		// Log but return 200 so GitHub doesn't retry for unsupported events
		h.logEvent(r.Context(), connectionID, "github", eventType, deliveryID, json.RawMessage(body), false, err.Error())
		w.WriteHeader(http.StatusOK)
		return
	}

	// Process event
	procErr := h.processEvent(r.Context(), conn, evt)
	errMsg := ""
	if procErr != nil {
		errMsg = procErr.Error()
		slog.Error("vcs_webhooks: processing failed", "connectionID", connectionID, "event", eventType, "error", procErr)
	}

	h.logEvent(r.Context(), connectionID, "github", eventType, deliveryID, json.RawMessage(body), procErr == nil, errMsg)
	w.WriteHeader(http.StatusOK)
}

// ---------- GitLab endpoint ----------

func (h *VCSWebhookHandlers) HandleGitLab(w http.ResponseWriter, r *http.Request) {
	connectionID := chi.URLParam(r, "connectionID")
	eventType := r.Header.Get("X-Gitlab-Event")
	deliveryID := r.Header.Get("X-Gitlab-Event-UUID")

	conn, err := h.getConnection(r.Context(), connectionID)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if !conn.Enabled {
		http.Error(w, "connection disabled", http.StatusServiceUnavailable)
		return
	}

	body, err := h.gitlab.ValidateWebhook(r, conn.Secret)
	if err != nil {
		slog.Warn("vcs_webhooks: GitLab token validation failed", "connectionID", connectionID, "error", err)
		http.Error(w, "invalid token", http.StatusUnauthorized)
		return
	}

	evt, err := h.gitlab.ParseEvent(eventType, body)
	if err != nil {
		h.logEvent(r.Context(), connectionID, "gitlab", eventType, deliveryID, json.RawMessage(body), false, err.Error())
		w.WriteHeader(http.StatusOK)
		return
	}

	procErr := h.processEvent(r.Context(), conn, evt)
	errMsg := ""
	if procErr != nil {
		errMsg = procErr.Error()
		slog.Error("vcs_webhooks: processing failed", "connectionID", connectionID, "event", eventType, "error", procErr)
	}

	h.logEvent(r.Context(), connectionID, "gitlab", eventType, deliveryID, json.RawMessage(body), procErr == nil, errMsg)
	w.WriteHeader(http.StatusOK)
}

// ---------- Event dispatch ----------

func (h *VCSWebhookHandlers) processEvent(ctx context.Context, conn *connRecord, evt vcs.Event) error {
	switch evt.Type {
	case vcs.EventPush:
		return h.processPush(ctx, conn, evt.Push)
	case vcs.EventBranchCreate:
		return h.processBranchCreate(ctx, conn, evt.Branch)
	case vcs.EventBranchDelete:
		return h.processBranchDelete(ctx, conn, evt.Branch)
	case vcs.EventPullRequest:
		return h.processPullRequest(ctx, conn, evt.PR)
	case vcs.EventReview:
		return h.processReview(ctx, conn, evt.Review)
	case vcs.EventCheckSuite:
		return h.processCheckSuite(ctx, conn, evt.Checks)
	default:
		return fmt.Errorf("unknown event type: %s", evt.Type)
	}
}

// ---------- Push processing ----------

func (h *VCSWebhookHandlers) processPush(ctx context.Context, conn *connRecord, evt *vcs.PushEvent) error {
	for _, c := range evt.Commits {
		// Find referenced work items
		itemNums := vcs.ExtractAllItemNumbers(c.Message)
		if len(itemNums) == 0 {
			// Still store the commit, just without a work item link
			h.upsertCommit(ctx, conn.ID, nil, c)
			continue
		}

		for _, num := range itemNums {
			workItemID := h.resolveWorkItem(ctx, conn.ProjectID, num)
			h.upsertCommit(ctx, conn.ID, workItemID, c)
		}
	}

	// Also try to link the branch itself
	branchItemNum, found := vcs.ExtractItemNumber(evt.Ref)
	if found {
		workItemID := h.resolveWorkItem(ctx, conn.ProjectID, branchItemNum)
		if workItemID != nil {
			h.upsertBranch(ctx, conn.ID, workItemID, evt.Ref, "", "")
		}
	}

	return nil
}

// ---------- Branch processing ----------

func (h *VCSWebhookHandlers) processBranchCreate(ctx context.Context, conn *connRecord, evt *vcs.BranchEvent) error {
	itemNum, found := vcs.ExtractItemNumber(evt.Name)
	var workItemID *string
	if found {
		workItemID = h.resolveWorkItem(ctx, conn.ProjectID, itemNum)
	}

	h.upsertBranch(ctx, conn.ID, workItemID, evt.Name, evt.SHA, "")
	return nil
}

func (h *VCSWebhookHandlers) processBranchDelete(ctx context.Context, conn *connRecord, evt *vcs.BranchEvent) error {
	_, err := h.db.Exec(ctx,
		`DELETE FROM vcs_branches WHERE connection_id = $1 AND name = $2`,
		conn.ID, evt.Name)
	if err != nil {
		slog.Error("vcs_webhooks: branch delete failed", "error", err)
	}
	return err
}

// ---------- Pull request processing ----------

func (h *VCSWebhookHandlers) processPullRequest(ctx context.Context, conn *connRecord, evt *vcs.PREvent) error {
	// Try to find a work item reference in: branch name, PR title, PR body
	var workItemID *string
	for _, text := range []string{evt.SourceBranch, evt.Title, evt.Body} {
		if num, found := vcs.ExtractItemNumber(text); found {
			workItemID = h.resolveWorkItem(ctx, conn.ProjectID, num)
			if workItemID != nil {
				break
			}
		}
	}

	_, err := h.db.Exec(ctx,
		`INSERT INTO vcs_pull_requests
		   (connection_id, work_item_id, external_id, title, state, draft,
		    source_branch, target_branch, author_login, author_avatar, url,
		    merged_at, closed_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
		 ON CONFLICT (connection_id, external_id) DO UPDATE SET
		    work_item_id = COALESCE(EXCLUDED.work_item_id, vcs_pull_requests.work_item_id),
		    title = EXCLUDED.title,
		    state = EXCLUDED.state,
		    draft = EXCLUDED.draft,
		    source_branch = EXCLUDED.source_branch,
		    target_branch = EXCLUDED.target_branch,
		    author_login = EXCLUDED.author_login,
		    author_avatar = EXCLUDED.author_avatar,
		    url = EXCLUDED.url,
		    merged_at = EXCLUDED.merged_at,
		    closed_at = EXCLUDED.closed_at,
		    updated_at = NOW()`,
		conn.ID, workItemID, evt.ExternalID, evt.Title, evt.State, evt.Draft,
		evt.SourceBranch, evt.TargetBranch, evt.AuthorLogin, evt.AuthorAvatar,
		evt.URL, evt.MergedAt, evt.ClosedAt)
	if err != nil {
		return fmt.Errorf("upsert PR: %w", err)
	}

	// Auto-transition on merge
	if evt.State == "merged" && workItemID != nil {
		h.autoTransition(ctx, conn.ProjectID, *workItemID, evt.ExternalID)
	}

	return nil
}

// ---------- Review processing ----------

func (h *VCSWebhookHandlers) processReview(ctx context.Context, conn *connRecord, evt *vcs.ReviewEvent) error {
	_, err := h.db.Exec(ctx,
		`UPDATE vcs_pull_requests SET review_status = $1, updated_at = NOW()
		  WHERE connection_id = $2 AND external_id = $3`,
		evt.State, conn.ID, evt.PRExternalID)
	if err != nil {
		return fmt.Errorf("update review status: %w", err)
	}
	return nil
}

// ---------- Check suite processing ----------

func (h *VCSWebhookHandlers) processCheckSuite(ctx context.Context, conn *connRecord, evt *vcs.ChecksEvent) error {
	_, err := h.db.Exec(ctx,
		`UPDATE vcs_pull_requests SET checks_status = $1, updated_at = NOW()
		  WHERE connection_id = $2 AND external_id = $3`,
		evt.Status, conn.ID, evt.PRExternalID)
	if err != nil {
		return fmt.Errorf("update checks status: %w", err)
	}
	return nil
}

// ---------- Auto-transition ----------

func (h *VCSWebhookHandlers) autoTransition(ctx context.Context, projectID, workItemID string, prNumber int64) {
	var targetStatus *string
	err := h.db.QueryRow(ctx,
		`SELECT merge_transition_status FROM projects WHERE id = $1`, projectID,
	).Scan(&targetStatus)
	if err != nil || targetStatus == nil {
		return // disabled or project not found
	}

	tag, err := h.db.Exec(ctx,
		`UPDATE work_items SET status = $1
		  WHERE id = $2 AND status NOT IN ($1, 'cancelled')`,
		*targetStatus, workItemID)
	if err != nil {
		slog.Error("vcs_webhooks: auto-transition failed", "workItemID", workItemID, "error", err)
		return
	}

	if tag.RowsAffected() > 0 {
		slog.Info("vcs_webhooks: auto-transitioned work item",
			"workItemID", workItemID, "status", *targetStatus, "pr", prNumber)

		// Create a notification for the assignee
		var assigneeID *string
		var itemNumber *int
		_ = h.db.QueryRow(ctx,
			`SELECT assignee_id, item_number FROM work_items WHERE id = $1`, workItemID,
		).Scan(&assigneeID, &itemNumber)

		if assigneeID != nil {
			msg := fmt.Sprintf("PR #%d was merged. Work item #%d automatically moved to %s.",
				prNumber, 0, *targetStatus)
			if itemNumber != nil {
				msg = fmt.Sprintf("PR #%d was merged. Work item #%d automatically moved to %s.",
					prNumber, *itemNumber, *targetStatus)
			}
			_, _ = h.db.Exec(ctx,
				`INSERT INTO notifications (user_id, type, message, work_item_id)
				 VALUES ($1, 'status_change', $2, $3)`,
				*assigneeID, msg, workItemID)
		}
	}
}

// ---------- Helpers ----------

func (h *VCSWebhookHandlers) resolveWorkItem(ctx context.Context, projectID string, itemNumber int) *string {
	var id string
	err := h.db.QueryRow(ctx,
		`SELECT id FROM work_items WHERE project_id = $1 AND item_number = $2`,
		projectID, itemNumber,
	).Scan(&id)
	if err != nil {
		return nil
	}
	return &id
}

func (h *VCSWebhookHandlers) upsertBranch(ctx context.Context, connectionID string, workItemID *string, name, sha, url string) {
	_, err := h.db.Exec(ctx,
		`INSERT INTO vcs_branches (connection_id, work_item_id, name, sha, url)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (connection_id, name) DO UPDATE SET
		    work_item_id = COALESCE(EXCLUDED.work_item_id, vcs_branches.work_item_id),
		    sha = EXCLUDED.sha,
		    updated_at = NOW()`,
		connectionID, workItemID, name, nilIfEmpty(sha), nilIfEmpty(url))
	if err != nil {
		slog.Error("vcs_webhooks: branch upsert failed", "error", err)
	}
}

func (h *VCSWebhookHandlers) upsertCommit(ctx context.Context, connectionID string, workItemID *string, c vcs.Commit) {
	ts := c.Timestamp
	if ts.IsZero() {
		ts = time.Now()
	}
	_, err := h.db.Exec(ctx,
		`INSERT INTO vcs_commits (connection_id, work_item_id, sha, message, author_login, author_email, url, committed_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 ON CONFLICT (connection_id, sha) DO NOTHING`,
		connectionID, workItemID, c.SHA, c.Message, nilIfEmpty(c.AuthorLogin), nilIfEmpty(c.AuthorEmail), nilIfEmpty(c.URL), ts)
	if err != nil && err != pgx.ErrNoRows {
		slog.Error("vcs_webhooks: commit upsert failed", "error", err)
	}
}
