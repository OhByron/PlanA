package ai

import (
	"context"
	"fmt"
)

// Provider is the interface for AI model integrations.
type Provider interface {
	// SuggestAC generates acceptance criteria suggestions for a work item.
	SuggestAC(ctx context.Context, req SuggestACRequest) (*SuggestACResponse, error)
	// SuggestDescription expands a story title into a full description.
	SuggestDescription(ctx context.Context, req SuggestDescRequest) (*SuggestDescResponse, error)
}

type SuggestACRequest struct {
	StoryTitle       string
	StoryDescription string
	EpicTitle        string
	EpicDescription  string
	ExistingAC       []string // existing AC on this story (Given/When/Then strings)
	SiblingStories   []string // titles of other stories in the same epic
	ProjectName      string
}

type SuggestACResponse struct {
	Suggestions []ACSuggestion `json:"suggestions"`
	Questions   []string       `json:"questions,omitempty"`
}

type ACSuggestion struct {
	Given string `json:"given"`
	When  string `json:"when"`
	Then  string `json:"then"`
}

type SuggestDescRequest struct {
	StoryTitle     string
	CurrentDesc    string // may be empty
	EpicTitle      string
	EpicDescription string
	SiblingStories []string
	ProjectName    string
	StoryType      string // story, bug, task
}

type SuggestDescResponse struct {
	Description string   `json:"description"`
	Questions   []string `json:"questions,omitempty"`
}

// NewProvider creates an AI provider based on the provider type.
func NewProvider(providerType, model, apiKey, endpoint string) (Provider, error) {
	switch providerType {
	case "anthropic":
		return NewAnthropicProvider(apiKey, model), nil
	case "openai", "azure_openai", "custom":
		ep := "https://api.openai.com/v1"
		if endpoint != "" {
			ep = endpoint
		}
		return NewOpenAIProvider(apiKey, model, ep), nil
	default:
		return nil, fmt.Errorf("unsupported AI provider: %s", providerType)
	}
}
