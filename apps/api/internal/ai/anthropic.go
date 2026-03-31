package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

type AnthropicProvider struct {
	apiKey string
	model  string
}

func NewAnthropicProvider(apiKey, model string) *AnthropicProvider {
	if model == "" {
		model = "claude-sonnet-4-20250514"
	}
	return &AnthropicProvider{apiKey: apiKey, model: model}
}

func (p *AnthropicProvider) SuggestAC(ctx context.Context, req SuggestACRequest) (*SuggestACResponse, error) {
	systemPrompt := `You are an experienced Business Systems Analyst helping define acceptance criteria for user stories in an Agile project.

Rules:
- Use Given/When/Then (BDD) format
- Be specific and testable — avoid vague words like "appropriate" or "correct"
- Consider edge cases and error conditions
- If the story is ambiguous, ask clarifying questions instead of guessing
- Return 3-5 acceptance criteria unless the story is very simple
- Match the domain and tone of the project

Return your response as JSON with this exact structure:
{
  "suggestions": [{"given": "...", "when": "...", "then": "..."}],
  "questions": ["...", "..."]
}

Only include "questions" if you genuinely need more information. If the story is clear enough, return only "suggestions" with an empty questions array.`

	userPrompt := fmt.Sprintf(`Project: %s

Epic: %s
%s

Story: %s
%s

`, req.ProjectName, req.EpicTitle, req.EpicDescription, req.StoryTitle, req.StoryDescription)

	if len(req.ExistingAC) > 0 {
		userPrompt += "Existing acceptance criteria (don't duplicate these):\n"
		for _, ac := range req.ExistingAC {
			userPrompt += "- " + ac + "\n"
		}
		userPrompt += "\n"
	}

	if len(req.SiblingStories) > 0 {
		userPrompt += "Other stories in this epic:\n"
		for _, s := range req.SiblingStories {
			userPrompt += "- " + s + "\n"
		}
		userPrompt += "\n"
	}

	userPrompt += "Suggest acceptance criteria for this story."

	// Call Anthropic Messages API
	body := map[string]any{
		"model":      p.model,
		"max_tokens": 1024,
		"system":     systemPrompt,
		"messages": []map[string]string{
			{"role": "user", "content": userPrompt},
		},
	}

	jsonBody, _ := json.Marshal(body)
	httpReq, err := http.NewRequestWithContext(ctx, "POST", "https://api.anthropic.com/v1/messages", bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("building request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", p.apiKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("calling Anthropic API: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("Anthropic API returned %d: %s", resp.StatusCode, respBody)
	}

	// Parse response
	var anthropicResp struct {
		Content []struct {
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.Unmarshal(respBody, &anthropicResp); err != nil {
		return nil, fmt.Errorf("parsing Anthropic response: %w", err)
	}

	if len(anthropicResp.Content) == 0 {
		return nil, fmt.Errorf("empty response from Anthropic")
	}

	// Extract JSON from the response text (may be wrapped in markdown code blocks)
	text := anthropicResp.Content[0].Text
	// Try to find JSON in the text
	jsonStart := -1
	jsonEnd := -1
	for i, c := range text {
		if c == '{' && jsonStart == -1 {
			jsonStart = i
		}
		if c == '}' {
			jsonEnd = i + 1
		}
	}

	var result SuggestACResponse
	if jsonStart >= 0 && jsonEnd > jsonStart {
		if err := json.Unmarshal([]byte(text[jsonStart:jsonEnd]), &result); err != nil {
			return nil, fmt.Errorf("parsing AC suggestions: %w (raw: %s)", err, text)
		}
	} else {
		return nil, fmt.Errorf("no JSON found in response: %s", text)
	}

	return &result, nil
}

func (p *AnthropicProvider) SuggestDefect(ctx context.Context, req SuggestDefectRequest) (*SuggestDefectResponse, error) {
	systemPrompt := `You are a senior QA analyst creating defect reports from test failures in an Agile project.

Rules:
- Write a clear, technical defect description (2-3 paragraphs) explaining:
  1. What was expected vs what actually happened
  2. The likely root cause based on the error details
  3. Impact and severity assessment
- Generate 2-4 acceptance criteria in Given/When/Then format that define "fixed"
- Be specific: reference the test name, error message, and stack trace details
- The acceptance criteria should be testable — a QE can verify the fix with them
- If the error is ambiguous, include clarifying questions

Return JSON:
{
  "description": "The defect description...",
  "acceptance_criteria": [{"given": "...", "when": "...", "then": "..."}],
  "questions": []
}

Only include "questions" if genuinely needed. Otherwise return an empty array.`

	userPrompt := fmt.Sprintf(`Project: %s
Parent Story: %s
Test Name: %s
Suite: %s
Status: %s

Error Details:
%s

Generate a defect report with description and acceptance criteria for the fix.`,
		req.ProjectName, req.ParentTitle, req.TestName, req.SuiteName, req.Status, req.ErrorMessage)

	body := map[string]any{
		"model":      p.model,
		"max_tokens": 1500,
		"system":     systemPrompt,
		"messages":   []map[string]string{{"role": "user", "content": userPrompt}},
	}

	jsonBody, _ := json.Marshal(body)
	httpReq, err := http.NewRequestWithContext(ctx, "POST", "https://api.anthropic.com/v1/messages", bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("building request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", p.apiKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("calling Anthropic API: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("Anthropic API returned %d: %s", resp.StatusCode, respBody)
	}

	var anthropicResp struct {
		Content []struct{ Text string `json:"text"` } `json:"content"`
	}
	if err := json.Unmarshal(respBody, &anthropicResp); err != nil {
		return nil, fmt.Errorf("parsing response: %w", err)
	}
	if len(anthropicResp.Content) == 0 {
		return nil, fmt.Errorf("empty response")
	}

	text := anthropicResp.Content[0].Text
	jsonStart, jsonEnd := -1, -1
	for i, c := range text {
		if c == '{' && jsonStart == -1 {
			jsonStart = i
		}
		if c == '}' {
			jsonEnd = i + 1
		}
	}

	var result SuggestDefectResponse
	if jsonStart >= 0 && jsonEnd > jsonStart {
		if err := json.Unmarshal([]byte(text[jsonStart:jsonEnd]), &result); err != nil {
			return nil, fmt.Errorf("parsing defect suggestion: %w (raw: %s)", err, text)
		}
	} else {
		return nil, fmt.Errorf("no JSON found in response: %s", text)
	}

	return &result, nil
}

func (p *AnthropicProvider) SuggestDecomposition(ctx context.Context, req SuggestDecompRequest) (*SuggestDecompResponse, error) {
	systemPrompt := `You are an experienced Scrum Master helping decompose user stories into actionable tasks for a cross-functional Agile team.

Rules:
- Suggest 3-8 tasks depending on story complexity
- Each task should be assignable to a single discipline: dev, qe, ux, ba, or bsa
- Include at least one QE task (testing is not optional)
- Include UX/BA tasks only when the story involves user-facing changes or requirements analysis
- Points should reflect relative effort (1=trivial, 2=small, 3=medium, 5=large, 8=complex)
- Task titles should be specific and actionable, not generic ("Implement login API" not "Do backend work")
- Don't duplicate existing tasks
- If the story is too vague to decompose, ask clarifying questions

Return JSON:
{
  "tasks": [{"title": "...", "role": "dev|qe|ux|ba|bsa", "points": N, "rationale": "..."}],
  "questions": []
}`

	userPrompt := fmt.Sprintf(`Project: %s
Epic: %s
%s

Story: %s
%s

`, req.ProjectName, req.EpicTitle, req.EpicDescription, req.StoryTitle, req.StoryDescription)

	if len(req.ExistingTasks) > 0 {
		userPrompt += "Existing tasks (don't duplicate):\n"
		for _, t := range req.ExistingTasks {
			userPrompt += "- " + t + "\n"
		}
		userPrompt += "\n"
	}

	if len(req.TeamRoles) > 0 {
		userPrompt += "Available team roles: " + fmt.Sprintf("%v", req.TeamRoles) + "\n\n"
	}

	userPrompt += "Suggest tasks to decompose this story."

	body := map[string]any{
		"model":      p.model,
		"max_tokens": 1500,
		"system":     systemPrompt,
		"messages":   []map[string]string{{"role": "user", "content": userPrompt}},
	}

	jsonBody, _ := json.Marshal(body)
	httpReq, err := http.NewRequestWithContext(ctx, "POST", "https://api.anthropic.com/v1/messages", bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("building request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", p.apiKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("calling Anthropic API: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("Anthropic API returned %d: %s", resp.StatusCode, respBody)
	}

	var anthropicResp struct {
		Content []struct{ Text string `json:"text"` } `json:"content"`
	}
	if err := json.Unmarshal(respBody, &anthropicResp); err != nil {
		return nil, fmt.Errorf("parsing response: %w", err)
	}
	if len(anthropicResp.Content) == 0 {
		return nil, fmt.Errorf("empty response")
	}

	text := anthropicResp.Content[0].Text
	jsonStart, jsonEnd := -1, -1
	for i, c := range text {
		if c == '{' && jsonStart == -1 {
			jsonStart = i
		}
		if c == '}' {
			jsonEnd = i + 1
		}
	}

	var result SuggestDecompResponse
	if jsonStart >= 0 && jsonEnd > jsonStart {
		if err := json.Unmarshal([]byte(text[jsonStart:jsonEnd]), &result); err != nil {
			return nil, fmt.Errorf("parsing decomposition: %w (raw: %s)", err, text)
		}
	} else {
		return nil, fmt.Errorf("no JSON found in response: %s", text)
	}

	return &result, nil
}

func (p *AnthropicProvider) SuggestDescription(ctx context.Context, req SuggestDescRequest) (*SuggestDescResponse, error) {
	systemPrompt := `You are an experienced Business Systems Analyst helping write clear, detailed descriptions for user stories in an Agile project.

Rules:
- Write a concise but thorough description (2-4 paragraphs)
- Include: context/background, what the user needs, why it matters, key requirements
- Mention edge cases or constraints if obvious from the title
- Match the tone and domain of the project
- If the story is a bug, describe the expected vs actual behavior
- If a current description exists, improve and expand it — don't start from scratch
- If the title is too vague to write a good description, ask clarifying questions instead

Return your response as JSON:
{"description": "The full description text...", "questions": []}

Only include "questions" if the title is genuinely too ambiguous. Otherwise return the description with an empty questions array.`

	userPrompt := fmt.Sprintf("Project: %s\nEpic: %s\n%s\nStory type: %s\nStory title: %s\n",
		req.ProjectName, req.EpicTitle, req.EpicDescription, req.StoryType, req.StoryTitle)
	if req.CurrentDesc != "" {
		userPrompt += "Current description (improve this):\n" + req.CurrentDesc + "\n"
	}
	if len(req.SiblingStories) > 0 {
		userPrompt += "\nOther stories in this epic:\n"
		for _, s := range req.SiblingStories {
			userPrompt += "- " + s + "\n"
		}
	}
	userPrompt += "\nWrite a description for this story."

	body := map[string]any{
		"model":      p.model,
		"max_tokens": 1024,
		"system":     systemPrompt,
		"messages":   []map[string]string{{"role": "user", "content": userPrompt}},
	}

	jsonBody, _ := json.Marshal(body)
	httpReq, err := http.NewRequestWithContext(ctx, "POST", "https://api.anthropic.com/v1/messages", bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("building request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", p.apiKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("calling Anthropic API: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("Anthropic API returned %d: %s", resp.StatusCode, respBody)
	}

	var anthropicResp struct {
		Content []struct{ Text string `json:"text"` } `json:"content"`
	}
	if err := json.Unmarshal(respBody, &anthropicResp); err != nil {
		return nil, fmt.Errorf("parsing response: %w", err)
	}
	if len(anthropicResp.Content) == 0 {
		return nil, fmt.Errorf("empty response")
	}

	text := anthropicResp.Content[0].Text
	jsonStart, jsonEnd := -1, -1
	for i, c := range text {
		if c == '{' && jsonStart == -1 { jsonStart = i }
		if c == '}' { jsonEnd = i + 1 }
	}

	var result SuggestDescResponse
	if jsonStart >= 0 && jsonEnd > jsonStart {
		if err := json.Unmarshal([]byte(text[jsonStart:jsonEnd]), &result); err != nil {
			return nil, fmt.Errorf("parsing description: %w", err)
		}
	} else {
		// If no JSON, treat the whole text as the description
		result.Description = text
	}

	return &result, nil
}
