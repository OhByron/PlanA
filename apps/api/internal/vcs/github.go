package vcs

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// GitHubProvider implements the Provider interface for GitHub.
type GitHubProvider struct{}

func NewGitHubProvider() *GitHubProvider {
	return &GitHubProvider{}
}

// ValidateWebhook checks the HMAC-SHA256 signature in the X-Hub-Signature-256 header.
func (g *GitHubProvider) ValidateWebhook(r *http.Request, secret string) ([]byte, error) {
	sig := r.Header.Get("X-Hub-Signature-256")
	if sig == "" {
		return nil, fmt.Errorf("missing X-Hub-Signature-256 header")
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		return nil, fmt.Errorf("reading body: %w", err)
	}
	r.Body = io.NopCloser(bytes.NewReader(body))

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	expected := "sha256=" + hex.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(sig), []byte(expected)) {
		return nil, fmt.Errorf("signature mismatch")
	}
	return body, nil
}

// ParseEvent normalises a GitHub webhook payload into a generic Event.
func (g *GitHubProvider) ParseEvent(eventType string, payload []byte) (Event, error) {
	switch eventType {
	case "push":
		return g.parsePush(payload)
	case "create", "delete":
		return g.parseBranchRef(eventType, payload)
	case "pull_request":
		return g.parsePullRequest(payload)
	case "pull_request_review":
		return g.parseReview(payload)
	case "check_suite":
		return g.parseCheckSuite(payload)
	default:
		return Event{}, fmt.Errorf("unsupported event type: %s", eventType)
	}
}

// RegisterWebhook creates a webhook on the GitHub repo via the API.
func (g *GitHubProvider) RegisterWebhook(ctx context.Context, token, owner, repo, url, secret string) (int64, error) {
	body, _ := json.Marshal(map[string]any{
		"name":   "web",
		"active": true,
		"events": []string{"push", "create", "delete", "pull_request", "pull_request_review", "check_suite"},
		"config": map[string]string{
			"url":          url,
			"content_type": "json",
			"secret":       secret,
		},
	})

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		fmt.Sprintf("https://api.github.com/repos/%s/%s/hooks", owner, repo),
		bytes.NewReader(body))
	if err != nil {
		return 0, err
	}
	g.setHeaders(req, token)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, fmt.Errorf("github API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		respBody, _ := io.ReadAll(resp.Body)
		return 0, fmt.Errorf("github API returned %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		ID int64 `json:"id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return 0, fmt.Errorf("decoding response: %w", err)
	}
	return result.ID, nil
}

// DeleteWebhook removes a webhook from the GitHub repo.
func (g *GitHubProvider) DeleteWebhook(ctx context.Context, token, owner, repo string, webhookID int64) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete,
		fmt.Sprintf("https://api.github.com/repos/%s/%s/hooks/%d", owner, repo, webhookID), nil)
	if err != nil {
		return err
	}
	g.setHeaders(req, token)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("github API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusNotFound {
		return fmt.Errorf("github API returned %d", resp.StatusCode)
	}
	return nil
}

// TestConnection verifies credentials can access the repo.
func (g *GitHubProvider) TestConnection(ctx context.Context, token, owner, repo string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		fmt.Sprintf("https://api.github.com/repos/%s/%s", owner, repo), nil)
	if err != nil {
		return err
	}
	g.setHeaders(req, token)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("github API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("github API returned %d", resp.StatusCode)
	}
	return nil
}

func (g *GitHubProvider) setHeaders(req *http.Request, token string) {
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("User-Agent", "PlanA/1.0")
}

// ---------- Payload parsing ----------

type ghPushPayload struct {
	Ref     string `json:"ref"`
	Commits []struct {
		ID        string `json:"id"`
		Message   string `json:"message"`
		URL       string `json:"url"`
		Timestamp string `json:"timestamp"`
		Author    struct {
			Name     string `json:"name"`
			Email    string `json:"email"`
			Username string `json:"username"`
		} `json:"author"`
	} `json:"commits"`
}

func (g *GitHubProvider) parsePush(payload []byte) (Event, error) {
	var p ghPushPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return Event{}, fmt.Errorf("parsing push: %w", err)
	}

	// Only process branch pushes, not tag pushes
	if !strings.HasPrefix(p.Ref, "refs/heads/") {
		return Event{}, fmt.Errorf("not a branch push: %s", p.Ref)
	}

	evt := PushEvent{
		Ref: strings.TrimPrefix(p.Ref, "refs/heads/"),
	}
	for _, c := range p.Commits {
		ts, _ := time.Parse(time.RFC3339, c.Timestamp)
		evt.Commits = append(evt.Commits, Commit{
			SHA:         c.ID,
			Message:     c.Message,
			AuthorLogin: c.Author.Username,
			AuthorEmail: c.Author.Email,
			URL:         c.URL,
			Timestamp:   ts,
		})
	}
	return Event{Type: EventPush, Push: &evt}, nil
}

type ghRefPayload struct {
	Ref     string `json:"ref"`
	RefType string `json:"ref_type"`
	// For create events, master_branch is available
	MasterBranch string `json:"master_branch"`
}

func (g *GitHubProvider) parseBranchRef(eventType string, payload []byte) (Event, error) {
	var p ghRefPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return Event{}, fmt.Errorf("parsing ref event: %w", err)
	}

	if p.RefType != "branch" {
		return Event{}, fmt.Errorf("not a branch event: ref_type=%s", p.RefType)
	}

	action := "created"
	evtType := EventBranchCreate
	if eventType == "delete" {
		action = "deleted"
		evtType = EventBranchDelete
	}

	return Event{
		Type: evtType,
		Branch: &BranchEvent{
			Name:   p.Ref,
			Action: action,
		},
	}, nil
}

type ghPRPayload struct {
	Action      string `json:"action"`
	PullRequest struct {
		Number int64  `json:"number"`
		Title  string `json:"title"`
		State  string `json:"state"` // open, closed
		Draft  bool   `json:"draft"`
		Merged bool   `json:"merged"`
		Body   string `json:"body"`
		HTMLURL string `json:"html_url"`
		Head   struct {
			Ref string `json:"ref"`
		} `json:"head"`
		Base struct {
			Ref string `json:"ref"`
		} `json:"base"`
		User struct {
			Login     string `json:"login"`
			AvatarURL string `json:"avatar_url"`
		} `json:"user"`
		MergedAt *time.Time `json:"merged_at"`
		ClosedAt *time.Time `json:"closed_at"`
	} `json:"pull_request"`
}

func (g *GitHubProvider) parsePullRequest(payload []byte) (Event, error) {
	var p ghPRPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return Event{}, fmt.Errorf("parsing pull_request: %w", err)
	}

	state := p.PullRequest.State // "open" or "closed"
	if p.PullRequest.Merged {
		state = "merged"
	}

	return Event{
		Type: EventPullRequest,
		PR: &PREvent{
			ExternalID:   p.PullRequest.Number,
			Title:        p.PullRequest.Title,
			State:        state,
			Draft:        p.PullRequest.Draft,
			SourceBranch: p.PullRequest.Head.Ref,
			TargetBranch: p.PullRequest.Base.Ref,
			AuthorLogin:  p.PullRequest.User.Login,
			AuthorAvatar: p.PullRequest.User.AvatarURL,
			URL:          p.PullRequest.HTMLURL,
			MergedAt:     p.PullRequest.MergedAt,
			ClosedAt:     p.PullRequest.ClosedAt,
			Body:         p.PullRequest.Body,
		},
	}, nil
}

type ghReviewPayload struct {
	Action string `json:"action"`
	Review struct {
		State string `json:"state"` // approved, changes_requested, commented
		User  struct {
			Login string `json:"login"`
		} `json:"user"`
	} `json:"review"`
	PullRequest struct {
		Number int64 `json:"number"`
	} `json:"pull_request"`
}

func (g *GitHubProvider) parseReview(payload []byte) (Event, error) {
	var p ghReviewPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return Event{}, fmt.Errorf("parsing review: %w", err)
	}

	// Only process submitted reviews, not edits or dismissals
	if p.Action != "submitted" {
		return Event{}, fmt.Errorf("ignoring review action: %s", p.Action)
	}

	return Event{
		Type: EventReview,
		Review: &ReviewEvent{
			PRExternalID: p.PullRequest.Number,
			State:        p.Review.State,
			Reviewer:     p.Review.User.Login,
		},
	}, nil
}

type ghCheckSuitePayload struct {
	Action     string `json:"action"`
	CheckSuite struct {
		Conclusion  *string `json:"conclusion"` // success, failure, neutral, etc.
		Status      string  `json:"status"`     // queued, in_progress, completed
		HTMLURL     string  `json:"html_url"`
		PullRequests []struct {
			Number int64 `json:"number"`
		} `json:"pull_requests"`
	} `json:"check_suite"`
}

func (g *GitHubProvider) parseCheckSuite(payload []byte) (Event, error) {
	var p ghCheckSuitePayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return Event{}, fmt.Errorf("parsing check_suite: %w", err)
	}

	if p.Action != "completed" {
		return Event{}, fmt.Errorf("ignoring check_suite action: %s", p.Action)
	}

	if len(p.CheckSuite.PullRequests) == 0 {
		return Event{}, fmt.Errorf("check_suite has no associated pull requests")
	}

	status := "pending"
	if p.CheckSuite.Conclusion != nil {
		switch *p.CheckSuite.Conclusion {
		case "success":
			status = "success"
		case "failure", "timed_out", "action_required":
			status = "failure"
		case "neutral", "skipped", "stale":
			status = "neutral"
		}
	}

	return Event{
		Type: EventCheckSuite,
		Checks: &ChecksEvent{
			PRExternalID: p.CheckSuite.PullRequests[0].Number,
			Status:       status,
			URL:          p.CheckSuite.HTMLURL,
		},
	}, nil
}
