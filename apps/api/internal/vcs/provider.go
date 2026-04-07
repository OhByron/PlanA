package vcs

import (
	"context"
	"net/http"
	"time"
)

// Provider abstracts GitHub and GitLab API differences.
type Provider interface {
	// ValidateWebhook checks the request signature and returns the raw body if valid.
	ValidateWebhook(r *http.Request, secret string) ([]byte, error)

	// ParseEvent normalises a provider-specific payload into a generic Event.
	ParseEvent(eventType string, payload []byte) (Event, error)

	// RegisterWebhook creates a webhook on the remote repo. Returns the provider's webhook ID.
	RegisterWebhook(ctx context.Context, token, owner, repo, url, secret string) (int64, error)

	// DeleteWebhook removes a webhook from the remote repo.
	DeleteWebhook(ctx context.Context, token, owner, repo string, webhookID int64) error

	// TestConnection verifies that the provided credentials can access the repo.
	TestConnection(ctx context.Context, token, owner, repo string) error
}

// Event is the normalised representation of a VCS webhook event.
type Event struct {
	Type   EventType
	Push   *PushEvent
	Branch *BranchEvent
	PR     *PREvent
	Review *ReviewEvent
	Checks *ChecksEvent
}

type EventType string

const (
	EventPush         EventType = "push"
	EventBranchCreate EventType = "branch_create"
	EventBranchDelete EventType = "branch_delete"
	EventPullRequest  EventType = "pull_request"
	EventReview       EventType = "pull_request_review"
	EventCheckSuite   EventType = "check_suite"
)

type PushEvent struct {
	Ref     string
	Commits []Commit
}

type BranchEvent struct {
	Name   string
	SHA    string
	Action string // "created" or "deleted"
}

type PREvent struct {
	ExternalID   int64
	Title        string
	State        string // open, closed, merged
	Draft        bool
	SourceBranch string
	TargetBranch string
	AuthorLogin  string
	AuthorAvatar string
	URL          string
	MergedAt     *time.Time
	ClosedAt     *time.Time
	Body         string
}

type ReviewEvent struct {
	PRExternalID int64
	State        string // approved, changes_requested, commented
	Reviewer     string
}

type ChecksEvent struct {
	PRExternalID int64
	Status       string // pending, success, failure, neutral
}

type Commit struct {
	SHA         string
	Message     string
	AuthorLogin string
	AuthorEmail string
	URL         string
	Timestamp   time.Time
}
