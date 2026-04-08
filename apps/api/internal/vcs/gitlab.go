package vcs

import (
	"bytes"
	"context"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// GitLabProvider implements the Provider interface for GitLab.
type GitLabProvider struct{}

func NewGitLabProvider() *GitLabProvider {
	return &GitLabProvider{}
}

// ValidateWebhook checks the X-Gitlab-Token header against the stored secret.
func (g *GitLabProvider) ValidateWebhook(r *http.Request, secret string) ([]byte, error) {
	token := r.Header.Get("X-Gitlab-Token")
	if token == "" {
		return nil, fmt.Errorf("missing X-Gitlab-Token header")
	}

	if subtle.ConstantTimeCompare([]byte(token), []byte(secret)) != 1 {
		return nil, fmt.Errorf("token mismatch")
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		return nil, fmt.Errorf("reading body: %w", err)
	}
	r.Body = io.NopCloser(bytes.NewReader(body))

	return body, nil
}

// ParseEvent normalises a GitLab webhook payload into a generic Event.
func (g *GitLabProvider) ParseEvent(eventType string, payload []byte) (Event, error) {
	// GitLab uses X-Gitlab-Event header with values like "Push Hook", "Merge Request Hook"
	switch eventType {
	case "Push Hook":
		return g.parsePush(payload)
	case "Merge Request Hook":
		return g.parseMergeRequest(payload)
	case "Note Hook":
		// GitLab sends review comments as notes; we check for MR approval notes
		return Event{}, fmt.Errorf("note hooks not yet supported")
	case "Pipeline Hook":
		return g.parsePipeline(payload)
	default:
		return Event{}, fmt.Errorf("unsupported event type: %s", eventType)
	}
}

// RegisterWebhook creates a webhook on the GitLab project via the API.
func (g *GitLabProvider) RegisterWebhook(ctx context.Context, token, owner, repo, url, secret string) (int64, error) {
	body, _ := json.Marshal(map[string]any{
		"url":                     url,
		"token":                   secret,
		"push_events":             true,
		"merge_requests_events":   true,
		"note_events":             false,
		"pipeline_events":         true,
		"enable_ssl_verification": true,
	})

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		fmt.Sprintf("https://gitlab.com/api/v4/projects/%s%%2F%s/hooks", owner, repo),
		bytes.NewReader(body))
	if err != nil {
		return 0, err
	}
	g.setHeaders(req, token)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, fmt.Errorf("gitlab API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		respBody, _ := io.ReadAll(resp.Body)
		return 0, fmt.Errorf("gitlab API returned %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		ID int64 `json:"id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return 0, fmt.Errorf("decoding response: %w", err)
	}
	return result.ID, nil
}

// DeleteWebhook removes a webhook from the GitLab project.
func (g *GitLabProvider) DeleteWebhook(ctx context.Context, token, owner, repo string, webhookID int64) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete,
		fmt.Sprintf("https://gitlab.com/api/v4/projects/%s%%2F%s/hooks/%d", owner, repo, webhookID), nil)
	if err != nil {
		return err
	}
	g.setHeaders(req, token)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("gitlab API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusNotFound {
		return fmt.Errorf("gitlab API returned %d", resp.StatusCode)
	}
	return nil
}

// TestConnection verifies credentials can access the project.
func (g *GitLabProvider) TestConnection(ctx context.Context, token, owner, repo string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		fmt.Sprintf("https://gitlab.com/api/v4/projects/%s%%2F%s", owner, repo), nil)
	if err != nil {
		return err
	}
	g.setHeaders(req, token)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("gitlab API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("gitlab API returned %d", resp.StatusCode)
	}
	return nil
}

func (g *GitLabProvider) setHeaders(req *http.Request, token string) {
	req.Header.Set("PRIVATE-TOKEN", token)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "PlanA/1.0")
}

// ---------- Payload parsing ----------

type glPushPayload struct {
	Ref     string `json:"ref"`
	Before  string `json:"before"`
	After   string `json:"after"`
	Commits []struct {
		ID        string `json:"id"`
		Message   string `json:"message"`
		URL       string `json:"url"`
		Timestamp string `json:"timestamp"`
		Author    struct {
			Name  string `json:"name"`
			Email string `json:"email"`
		} `json:"author"`
	} `json:"commits"`
}

func (g *GitLabProvider) parsePush(payload []byte) (Event, error) {
	var p glPushPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return Event{}, fmt.Errorf("parsing push: %w", err)
	}

	// Detect branch create/delete from the before/after zero hashes
	zeroHash := "0000000000000000000000000000000000000000"
	branchName := p.Ref
	if len(branchName) > 11 && branchName[:11] == "refs/heads/" {
		branchName = branchName[11:]
	}

	if p.Before == zeroHash {
		// New branch created
		return Event{
			Type: EventBranchCreate,
			Branch: &BranchEvent{
				Name:   branchName,
				SHA:    p.After,
				Action: "created",
			},
		}, nil
	}
	if p.After == zeroHash {
		// Branch deleted
		return Event{
			Type: EventBranchDelete,
			Branch: &BranchEvent{
				Name:   branchName,
				Action: "deleted",
			},
		}, nil
	}

	// Regular push with commits
	evt := PushEvent{
		Ref: branchName,
	}
	for _, c := range p.Commits {
		ts, _ := time.Parse("2006-01-02T15:04:05Z07:00", c.Timestamp)
		evt.Commits = append(evt.Commits, Commit{
			SHA:         c.ID,
			Message:     c.Message,
			AuthorLogin: c.Author.Name,
			AuthorEmail: c.Author.Email,
			URL:         c.URL,
			Timestamp:   ts,
		})
	}
	return Event{Type: EventPush, Push: &evt}, nil
}

type glMRPayload struct {
	ObjectAttributes struct {
		IID          int64      `json:"iid"`
		Title        string     `json:"title"`
		State        string     `json:"state"` // opened, closed, merged
		Draft        bool       `json:"draft"` // or WorkInProgress
		WIP          bool       `json:"work_in_progress"`
		SourceBranch string     `json:"source_branch"`
		TargetBranch string     `json:"target_branch"`
		URL          string     `json:"url"`
		Description  string     `json:"description"`
		MergedAt     *time.Time `json:"merged_at"`
		ClosedAt     *time.Time `json:"closed_at"`
		Action       string     `json:"action"` // open, close, reopen, merge, update, approved, unapproved
	} `json:"object_attributes"`
	User struct {
		Username  string `json:"username"`
		AvatarURL string `json:"avatar_url"`
	} `json:"user"`
}

func (g *GitLabProvider) parseMergeRequest(payload []byte) (Event, error) {
	var p glMRPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return Event{}, fmt.Errorf("parsing merge_request: %w", err)
	}

	// Handle approval actions as review events
	if p.ObjectAttributes.Action == "approved" {
		return Event{
			Type: EventReview,
			Review: &ReviewEvent{
				PRExternalID: p.ObjectAttributes.IID,
				State:        "approved",
				Reviewer:     p.User.Username,
			},
		}, nil
	}
	if p.ObjectAttributes.Action == "unapproved" {
		return Event{
			Type: EventReview,
			Review: &ReviewEvent{
				PRExternalID: p.ObjectAttributes.IID,
				State:        "changes_requested",
				Reviewer:     p.User.Username,
			},
		}, nil
	}

	// Map GitLab state to our normalised state
	state := p.ObjectAttributes.State
	switch state {
	case "opened":
		state = "open"
	case "merged":
		// keep as-is
	case "closed":
		// keep as-is
	}

	draft := p.ObjectAttributes.Draft || p.ObjectAttributes.WIP

	return Event{
		Type: EventPullRequest,
		PR: &PREvent{
			ExternalID:   p.ObjectAttributes.IID,
			Title:        p.ObjectAttributes.Title,
			State:        state,
			Draft:        draft,
			SourceBranch: p.ObjectAttributes.SourceBranch,
			TargetBranch: p.ObjectAttributes.TargetBranch,
			AuthorLogin:  p.User.Username,
			AuthorAvatar: p.User.AvatarURL,
			URL:          p.ObjectAttributes.URL,
			MergedAt:     p.ObjectAttributes.MergedAt,
			ClosedAt:     p.ObjectAttributes.ClosedAt,
			Body:         p.ObjectAttributes.Description,
		},
	}, nil
}

type glPipelinePayload struct {
	ObjectAttributes struct {
		Status string `json:"status"` // pending, running, success, failed, canceled, skipped
		URL    string `json:"url"`
	} `json:"object_attributes"`
	MergeRequest *struct {
		IID int64 `json:"iid"`
	} `json:"merge_request"`
}

func (g *GitLabProvider) parsePipeline(payload []byte) (Event, error) {
	var p glPipelinePayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return Event{}, fmt.Errorf("parsing pipeline: %w", err)
	}

	if p.MergeRequest == nil {
		return Event{}, fmt.Errorf("pipeline has no associated merge request")
	}

	status := "pending"
	switch p.ObjectAttributes.Status {
	case "success":
		status = "success"
	case "failed":
		status = "failure"
	case "canceled", "skipped":
		status = "neutral"
	case "pending", "running":
		status = "pending"
	}

	return Event{
		Type: EventCheckSuite,
		Checks: &ChecksEvent{
			PRExternalID: p.MergeRequest.IID,
			Status:       status,
			URL:          p.ObjectAttributes.URL,
		},
	}, nil
}
