package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// OllamaProvider talks directly to Ollama's /api/chat endpoint.
//
// We bypass any OpenAI-compatibility shim because Ollama's native endpoint is
// the only one that exposes two flags we care about for thinking-mode models
// like gemma4:
//
//   - think: false  — without this, gemma4 emits all tokens into
//     message.thinking and leaves message.content empty, so callers reading
//     .content silently get blank strings.
//   - options.num_ctx — Ollama defaults to a 4-8K context window and
//     silently truncates longer prompts.
type OllamaProvider struct {
	model    string
	endpoint string
	numCtx   int
	client   *http.Client
}

// NewOllamaProvider builds a provider for an Ollama-compatible host.
// model defaults to gemma4:26b, endpoint to http://localhost:11434,
// numCtx to 16384 (≈50K chars input headroom).
func NewOllamaProvider(model, endpoint string, numCtx int) *OllamaProvider {
	if model == "" {
		model = "gemma4:26b"
	}
	if endpoint == "" {
		endpoint = "http://localhost:11434"
	}
	if numCtx <= 0 {
		numCtx = 16384
	}
	return &OllamaProvider{
		model:    model,
		endpoint: endpoint,
		numCtx:   numCtx,
		client:   &http.Client{Timeout: 600 * time.Second},
	}
}

type ollamaMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// chat invokes /api/chat. If jsonFormat is true the model is instructed to
// emit valid JSON (Ollama's `format: "json"`). Returns the assistant content.
func (p *OllamaProvider) chat(ctx context.Context, system, user string, jsonFormat bool) (string, error) {
	body := map[string]any{
		"model":  p.model,
		"stream": false,
		"think":  false,
		"options": map[string]any{
			"temperature": 0.3,
			"num_ctx":     p.numCtx,
		},
		"messages": []ollamaMessage{
			{Role: "system", Content: system},
			{Role: "user", Content: user},
		},
	}
	if jsonFormat {
		body["format"] = "json"
	}

	jsonBody, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, "POST", p.endpoint+"/api/chat", bytes.NewReader(jsonBody))
	if err != nil {
		return "", fmt.Errorf("building request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("calling Ollama: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("Ollama returned %d: %s", resp.StatusCode, respBody)
	}

	var parsed struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	}
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", fmt.Errorf("parsing Ollama response: %w", err)
	}
	if parsed.Message.Content == "" {
		// Empty content with 200 OK is the classic thinking-mode trap when
		// `think: false` is missing or ignored. Surface a clear error so
		// operators don't chase silent failures.
		return "", fmt.Errorf("Ollama returned empty content (model %s may be in thinking mode)", p.model)
	}
	return parsed.Message.Content, nil
}

func (p *OllamaProvider) SuggestAC(ctx context.Context, req SuggestACRequest) (*SuggestACResponse, error) {
	systemPrompt := `You are an experienced Business Systems Analyst helping define acceptance criteria for user stories in an Agile project. Use Given/When/Then format. Be specific and testable. Consider edge cases. If ambiguous, ask clarifying questions. Return JSON: {"suggestions": [{"given": "...", "when": "...", "then": "..."}], "questions": ["..."]}` + LanguageInstruction(req.Language)

	userPrompt := fmt.Sprintf("Project: %s\nEpic: %s\n%s\nStory: %s\n%s\n",
		req.ProjectName, req.EpicTitle, req.EpicDescription, req.StoryTitle, req.StoryDescription)
	if len(req.ExistingAC) > 0 {
		userPrompt += "Existing AC (don't duplicate):\n"
		for _, ac := range req.ExistingAC {
			userPrompt += "- " + ac + "\n"
		}
	}
	if len(req.SiblingStories) > 0 {
		userPrompt += "Sibling stories:\n"
		for _, s := range req.SiblingStories {
			userPrompt += "- " + s + "\n"
		}
	}
	userPrompt += "Suggest acceptance criteria."

	content, err := p.chat(ctx, systemPrompt, userPrompt, true)
	if err != nil {
		return nil, err
	}
	jsonStr, err := extractJSON(content)
	if err != nil {
		return nil, fmt.Errorf("parsing AC suggestions: %w (raw: %s)", err, content)
	}
	var result SuggestACResponse
	if err := json.Unmarshal([]byte(jsonStr), &result); err != nil {
		return nil, fmt.Errorf("parsing AC suggestions: %w (raw: %s)", err, content)
	}
	return &result, nil
}

func (p *OllamaProvider) SuggestDescription(ctx context.Context, req SuggestDescRequest) (*SuggestDescResponse, error) {
	systemPrompt := `You are a BSA writing story descriptions. Write 2-4 concise paragraphs covering context, requirements, and edge cases. Return JSON: {"description": "...", "questions": []}` + LanguageInstruction(req.Language)

	userPrompt := fmt.Sprintf("Project: %s\nEpic: %s\n%s\nType: %s\nTitle: %s\n",
		req.ProjectName, req.EpicTitle, req.EpicDescription, req.StoryType, req.StoryTitle)
	if req.CurrentDesc != "" {
		userPrompt += "Current description (improve this):\n" + req.CurrentDesc + "\n"
	}
	userPrompt += "Write a description."

	content, err := p.chat(ctx, systemPrompt, userPrompt, true)
	if err != nil {
		return nil, err
	}
	jsonStr, err := extractJSON(content)
	var result SuggestDescResponse
	if err != nil {
		// If JSON extraction fails, treat the whole text as the description.
		result.Description = content
		return &result, nil
	}
	if err := json.Unmarshal([]byte(jsonStr), &result); err != nil {
		result.Description = content
	}
	return &result, nil
}

func (p *OllamaProvider) SuggestDefect(ctx context.Context, req SuggestDefectRequest) (*SuggestDefectResponse, error) {
	systemPrompt := `You are a senior QA analyst creating defect reports from test failures. Write a clear description (expected vs actual, root cause, impact). Generate 2-4 acceptance criteria in Given/When/Then format for verifying the fix. Return JSON: {"description": "...", "acceptance_criteria": [{"given": "...", "when": "...", "then": "..."}], "questions": []}` + LanguageInstruction(req.Language)

	userPrompt := fmt.Sprintf("Project: %s\nParent Story: %s\nTest: %s\nSuite: %s\nStatus: %s\n\nError:\n%s\n\nGenerate defect report.",
		req.ProjectName, req.ParentTitle, req.TestName, req.SuiteName, req.Status, req.ErrorMessage)

	content, err := p.chat(ctx, systemPrompt, userPrompt, true)
	if err != nil {
		return nil, err
	}
	jsonStr, err := extractJSON(content)
	if err != nil {
		return nil, fmt.Errorf("parsing defect suggestion: %w (raw: %s)", err, content)
	}
	var result SuggestDefectResponse
	if err := json.Unmarshal([]byte(jsonStr), &result); err != nil {
		return nil, fmt.Errorf("parsing defect suggestion: %w (raw: %s)", err, content)
	}
	return &result, nil
}

func (p *OllamaProvider) SuggestDecomposition(ctx context.Context, req SuggestDecompRequest) (*SuggestDecompResponse, error) {
	systemPrompt := `You are a Scrum Master decomposing stories into tasks. Suggest 3-8 tasks for disciplines: dev, qe, ux, ba, bsa. Include at least one QE task. Points: 1-8 scale. Return JSON: {"tasks": [{"title": "...", "role": "dev|qe|ux|ba|bsa", "points": N, "rationale": "..."}], "questions": []}` + LanguageInstruction(req.Language)

	userPrompt := fmt.Sprintf("Project: %s\nEpic: %s\n%s\nStory: %s\n%s\n",
		req.ProjectName, req.EpicTitle, req.EpicDescription, req.StoryTitle, req.StoryDescription)
	if len(req.ExistingTasks) > 0 {
		userPrompt += "Existing tasks (don't duplicate):\n"
		for _, t := range req.ExistingTasks {
			userPrompt += "- " + t + "\n"
		}
	}
	if len(req.TeamRoles) > 0 {
		userPrompt += fmt.Sprintf("Available team roles: %v\n", req.TeamRoles)
	}
	userPrompt += "Suggest task decomposition."

	content, err := p.chat(ctx, systemPrompt, userPrompt, true)
	if err != nil {
		return nil, err
	}
	jsonStr, err := extractJSON(content)
	if err != nil {
		return nil, fmt.Errorf("parsing decomposition: %w (raw: %s)", err, content)
	}
	var result SuggestDecompResponse
	if err := json.Unmarshal([]byte(jsonStr), &result); err != nil {
		return nil, fmt.Errorf("parsing decomposition: %w (raw: %s)", err, content)
	}
	return &result, nil
}

// RawChat is used for free-form generation (sprint goals, release-notes
// rewrites, executive summaries). We do NOT request JSON formatting here —
// callers either parse opportunistically or treat the text as markdown.
func (p *OllamaProvider) RawChat(ctx context.Context, systemPrompt, userPrompt string) (string, error) {
	return p.chat(ctx, systemPrompt, userPrompt, false)
}
