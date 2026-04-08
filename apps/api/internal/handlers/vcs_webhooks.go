package handlers

import (
	"bytes"
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
	db        DBPOOL
	encryptor *vcs.TokenEncryptor
	appURL    string
	github    vcs.Provider
	gitlab    vcs.Provider
}

func NewVCSWebhookHandlers(db DBPOOL, encryptor *vcs.TokenEncryptor, appURL string) *VCSWebhookHandlers {
	return &VCSWebhookHandlers{
		db:        db,
		encryptor: encryptor,
		appURL:    appURL,
		github:    vcs.NewGitHubProvider(),
		gitlab:    vcs.NewGitLabProvider(),
	}
}

// ---------- connection lookup ----------

type connRecord struct {
	ID             string
	ProjectID      string
	Provider       string
	Owner          string
	Repo           string
	Secret         string
	Enabled        bool
	EncryptedToken []byte
}

func (h *VCSWebhookHandlers) getConnection(ctx context.Context, connectionID string) (*connRecord, error) {
	var c connRecord
	err := h.db.QueryRow(ctx,
		`SELECT id, project_id, provider, owner, repo, webhook_secret, enabled, encrypted_token
		   FROM vcs_connections WHERE id = $1`, connectionID,
	).Scan(&c.ID, &c.ProjectID, &c.Provider, &c.Owner, &c.Repo, &c.Secret, &c.Enabled, &c.EncryptedToken)
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

	// Auto-transition to in_review when a non-draft PR is opened
	if evt.State == "open" && !evt.Draft && workItemID != nil {
		h.transitionToInReview(ctx, conn.ProjectID, *workItemID, evt.ExternalID)
	}

	// Post a bot comment linking back to PlanA on new PRs
	if evt.State == "open" && workItemID != nil {
		h.postPRComment(ctx, conn, *workItemID, evt.ExternalID)
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

	// Notify the work item assignee about the review
	var workItemID, assigneeID *string
	var itemNumber *int
	_ = h.db.QueryRow(ctx,
		`SELECT pr.work_item_id, wi.assignee_id, wi.item_number
		   FROM vcs_pull_requests pr
		   JOIN work_items wi ON wi.id = pr.work_item_id
		  WHERE pr.connection_id = $1 AND pr.external_id = $2
		    AND pr.work_item_id IS NOT NULL`,
		conn.ID, evt.PRExternalID,
	).Scan(&workItemID, &assigneeID, &itemNumber)

	if assigneeID != nil && workItemID != nil && itemNumber != nil {
		var msg string
		switch evt.State {
		case "approved":
			msg = fmt.Sprintf("PR #%d for work item #%d was approved by %s.",
				evt.PRExternalID, *itemNumber, evt.Reviewer)
		case "changes_requested":
			msg = fmt.Sprintf("PR #%d for work item #%d has changes requested by %s.",
				evt.PRExternalID, *itemNumber, evt.Reviewer)
		default:
			msg = fmt.Sprintf("PR #%d for work item #%d received a review from %s.",
				evt.PRExternalID, *itemNumber, evt.Reviewer)
		}
		_, _ = h.db.Exec(ctx,
			`INSERT INTO notifications (user_id, type, message, work_item_id)
			 VALUES ($1, 'status_change', $2, $3)`,
			*assigneeID, msg, *workItemID)
	}

	return nil
}

// ---------- Check suite processing ----------

func (h *VCSWebhookHandlers) processCheckSuite(ctx context.Context, conn *connRecord, evt *vcs.ChecksEvent) error {
	_, err := h.db.Exec(ctx,
		`UPDATE vcs_pull_requests SET checks_status = $1, checks_url = $2, updated_at = NOW()
		  WHERE connection_id = $3 AND external_id = $4`,
		evt.Status, nilIfEmpty(evt.URL), conn.ID, evt.PRExternalID)
	if err != nil {
		return fmt.Errorf("update checks status: %w", err)
	}
	return nil
}

// ---------- Auto-transition ----------

func (h *VCSWebhookHandlers) autoTransition(ctx context.Context, projectID, workItemID string, prNumber int64) {
	var targetStateID *string
	err := h.db.QueryRow(ctx,
		`SELECT pr_merge_transition_state_id FROM projects WHERE id = $1`, projectID,
	).Scan(&targetStateID)
	if err != nil || targetStateID == nil {
		return // disabled or project not found
	}

	// Only transition if not cancelled and not already at/past target
	tag, err := h.db.Exec(ctx,
		`UPDATE work_items SET workflow_state_id = $1, updated_at = NOW()
		  WHERE id = $2 AND is_cancelled = FALSE
		    AND workflow_state_id != $1`,
		*targetStateID, workItemID)
	if err != nil {
		slog.Error("vcs_webhooks: auto-transition failed", "workItemID", workItemID, "error", err)
		return
	}

	if tag.RowsAffected() > 0 {
		var stateName string
		_ = h.db.QueryRow(ctx, `SELECT name FROM workflow_states WHERE id = $1`, *targetStateID).Scan(&stateName)
		slog.Info("vcs_webhooks: auto-transitioned work item",
			"workItemID", workItemID, "state", stateName, "pr", prNumber)

		var assigneeID *string
		var itemNumber *int
		_ = h.db.QueryRow(ctx,
			`SELECT assignee_id, item_number FROM work_items WHERE id = $1`, workItemID,
		).Scan(&assigneeID, &itemNumber)

		if assigneeID != nil && itemNumber != nil {
			msg := fmt.Sprintf("PR #%d was merged. Work item #%d automatically moved to %s.",
				prNumber, *itemNumber, stateName)
			_, _ = h.db.Exec(ctx,
				`INSERT INTO notifications (user_id, type, message, work_item_id)
				 VALUES ($1, 'status_change', $2, $3)`,
				*assigneeID, msg, workItemID)
		}
	}
}

// transitionOnPROpen moves a work item to the configured PR-open state,
// but only if the item's current state position is less than the target.
func (h *VCSWebhookHandlers) transitionToInReview(ctx context.Context, projectID, workItemID string, prNumber int64) {
	var targetStateID *string
	err := h.db.QueryRow(ctx,
		`SELECT pr_open_transition_state_id FROM projects WHERE id = $1`, projectID,
	).Scan(&targetStateID)
	if err != nil || targetStateID == nil {
		return // disabled
	}

	// Only transition forward (current position < target position)
	tag, err := h.db.Exec(ctx,
		`UPDATE work_items wi SET workflow_state_id = $1, updated_at = NOW()
		  FROM workflow_states cur_ws, workflow_states tgt_ws
		 WHERE wi.id = $2
		   AND cur_ws.id = wi.workflow_state_id
		   AND tgt_ws.id = $1
		   AND cur_ws.position < tgt_ws.position
		   AND wi.is_cancelled = FALSE`,
		*targetStateID, workItemID)
	if err != nil {
		slog.Error("vcs_webhooks: PR open transition failed", "workItemID", workItemID, "error", err)
		return
	}

	if tag.RowsAffected() > 0 {
		var stateName string
		_ = h.db.QueryRow(ctx, `SELECT name FROM workflow_states WHERE id = $1`, *targetStateID).Scan(&stateName)
		slog.Info("vcs_webhooks: moved on PR open",
			"workItemID", workItemID, "state", stateName, "pr", prNumber)

		var assigneeID *string
		var itemNumber *int
		_ = h.db.QueryRow(ctx,
			`SELECT assignee_id, item_number FROM work_items WHERE id = $1`, workItemID,
		).Scan(&assigneeID, &itemNumber)

		if assigneeID != nil && itemNumber != nil {
			msg := fmt.Sprintf("PR #%d opened. Work item #%d moved to %s.",
				prNumber, *itemNumber, stateName)
			_, _ = h.db.Exec(ctx,
				`INSERT INTO notifications (user_id, type, message, work_item_id)
				 VALUES ($1, 'status_change', $2, $3)`,
				*assigneeID, msg, workItemID)
		}
	}
}

// ---------- Bot comment on PR ----------

// postPRComment adds a comment to the PR linking back to the work item in PlanA.
// Only posts once per PR (checks for existing comment before posting).
func (h *VCSWebhookHandlers) postPRComment(ctx context.Context, conn *connRecord, workItemID string, prNumber int64) {
	if conn.EncryptedToken == nil || h.encryptor == nil {
		return
	}

	token, err := h.encryptor.Decrypt(conn.EncryptedToken)
	if err != nil {
		slog.Error("vcs_webhooks: failed to decrypt token for PR comment", "error", err)
		return
	}

	// Look up work item details for the comment
	var itemNumber *int
	var title, projectID string
	err = h.db.QueryRow(ctx,
		`SELECT item_number, title, project_id FROM work_items WHERE id = $1`, workItemID,
	).Scan(&itemNumber, &title, &projectID)
	if err != nil || itemNumber == nil {
		return
	}

	itemURL := fmt.Sprintf("%s/p/%s/items/%s", h.appURL, projectID, workItemID)
	body := fmt.Sprintf("**PlanA** linked this PR to work item [#%d - %s](%s)", *itemNumber, title, itemURL)

	switch conn.Provider {
	case "github":
		h.postGitHubComment(ctx, token, conn.Owner, conn.Repo, prNumber, body)
	case "gitlab":
		h.postGitLabComment(ctx, token, conn.Owner, conn.Repo, prNumber, body)
	}
}

func (h *VCSWebhookHandlers) postGitHubComment(ctx context.Context, token, owner, repo string, prNumber int64, body string) {
	payload, _ := json.Marshal(map[string]string{"body": body})
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/issues/%d/comments", owner, repo, prNumber)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("User-Agent", "PlanA/1.0")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		slog.Error("vcs_webhooks: GitHub comment failed", "error", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		slog.Warn("vcs_webhooks: GitHub comment returned non-201", "status", resp.StatusCode)
	}
}

func (h *VCSWebhookHandlers) postGitLabComment(ctx context.Context, token, owner, repo string, mrIID int64, body string) {
	payload, _ := json.Marshal(map[string]string{"body": body})
	url := fmt.Sprintf("https://gitlab.com/api/v4/projects/%s%%2F%s/merge_requests/%d/notes", owner, repo, mrIID)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return
	}
	req.Header.Set("PRIVATE-TOKEN", token)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "PlanA/1.0")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		slog.Error("vcs_webhooks: GitLab comment failed", "error", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		slog.Warn("vcs_webhooks: GitLab comment returned non-201", "status", resp.StatusCode)
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
