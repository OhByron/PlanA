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
	// SuggestDefect generates a defect description and ACs from a test failure.
	SuggestDefect(ctx context.Context, req SuggestDefectRequest) (*SuggestDefectResponse, error)
	// SuggestDecomposition suggests child tasks for a story based on its context.
	SuggestDecomposition(ctx context.Context, req SuggestDecompRequest) (*SuggestDecompResponse, error)
}

// LanguageInstruction returns a prompt instruction for the AI to respond in the
// user's preferred language. Returns empty string for English or unset.
func LanguageInstruction(lang string) string {
	if lang == "" || lang == "en" {
		return ""
	}
	names := map[string]string{
		"fr": "French", "de": "German", "es": "Spanish", "it": "Italian",
		"pt": "Portuguese", "nl": "Dutch", "pl": "Polish", "da": "Danish",
		"sv": "Swedish", "nb": "Norwegian", "is": "Icelandic", "ru": "Russian",
		"el": "Greek", "tr": "Turkish", "lv": "Latvian", "lt": "Lithuanian",
		"et": "Estonian", "hu": "Hungarian", "sr": "Serbian", "hr": "Croatian",
		"hi": "Hindi", "ar": "Arabic", "ja": "Japanese", "zh": "Chinese",
		"ko": "Korean",
	}
	name, ok := names[lang]
	if !ok {
		return ""
	}
	return "\n\nCRITICAL LANGUAGE REQUIREMENT: You MUST write ALL text content in " + name + ". This includes every string value in the JSON response: descriptions, questions, suggestions (given/when/then clauses), rationale, task titles, and any other human-readable text. The only things that stay in English are the JSON keys themselves. Every single string value the user will read must be in " + name + ". Do not mix languages."
}

type SuggestACRequest struct {
	StoryTitle       string
	StoryDescription string
	EpicTitle        string
	EpicDescription  string
	ExistingAC       []string // existing AC on this story (Given/When/Then strings)
	SiblingStories   []string // titles of other stories in the same epic
	ProjectName      string
	Language         string   // user's language preference (e.g. "fr", "de", "ja")
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
	Language       string
}

type SuggestDescResponse struct {
	Description string   `json:"description"`
	Questions   []string `json:"questions,omitempty"`
}

// SuggestDefectRequest provides test failure context for generating defect reports.
type SuggestDefectRequest struct {
	TestName     string
	SuiteName    string
	Status       string // 'fail' or 'error'
	ErrorMessage string
	ProjectName  string
	ParentTitle  string // parent story title, if any
	Language     string
}

// SuggestDefectResponse contains an AI-generated defect description and acceptance criteria.
type SuggestDefectResponse struct {
	Description string         `json:"description"`
	Criteria    []ACSuggestion `json:"acceptance_criteria"`
	Questions   []string       `json:"questions,omitempty"`
}

// SuggestDecompRequest provides story context for generating task decomposition suggestions.
type SuggestDecompRequest struct {
	StoryTitle       string
	StoryDescription string
	EpicTitle        string
	EpicDescription  string
	ExistingTasks    []string // titles of existing child tasks
	ProjectName      string
	Language         string
	TeamRoles        []string // available roles (dev, qe, ux, ba, etc.)
}

// TaskSuggestion is a single suggested child task.
type TaskSuggestion struct {
	Title    string `json:"title"`
	Role     string `json:"role"`     // suggested job_role for assignee (dev, qe, ux, ba)
	Points   int    `json:"points"`   // suggested story points
	Rationale string `json:"rationale"` // brief explanation of why this task is needed
}

// SuggestDecompResponse contains AI-generated task decomposition for a story.
type SuggestDecompResponse struct {
	Tasks     []TaskSuggestion `json:"tasks"`
	Questions []string         `json:"questions,omitempty"`
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
