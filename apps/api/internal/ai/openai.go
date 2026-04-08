package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

type OpenAIProvider struct {
	apiKey   string
	model    string
	endpoint string
}

func NewOpenAIProvider(apiKey, model, endpoint string) *OpenAIProvider {
	if model == "" {
		model = "gpt-4o"
	}
	return &OpenAIProvider{apiKey: apiKey, model: model, endpoint: endpoint}
}

func (p *OpenAIProvider) SuggestAC(ctx context.Context, req SuggestACRequest) (*SuggestACResponse, error) {
	systemPrompt := `You are an experienced Business Systems Analyst helping define acceptance criteria for user stories in an Agile project. Use Given/When/Then format. Be specific and testable. Consider edge cases. If ambiguous, ask clarifying questions. Return JSON: {"suggestions": [{"given": "...", "when": "...", "then": "..."}], "questions": ["..."]}` + LanguageInstruction(req.Language)

	userPrompt := fmt.Sprintf("Project: %s\nEpic: %s\n%s\nStory: %s\n%s\nSuggest acceptance criteria.",
		req.ProjectName, req.EpicTitle, req.EpicDescription, req.StoryTitle, req.StoryDescription)

	body := map[string]any{
		"model":      p.model,
		"max_tokens": 1024,
		"messages": []map[string]string{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": userPrompt},
		},
		"response_format": map[string]string{"type": "json_object"},
	}

	jsonBody, _ := json.Marshal(body)
	httpReq, err := http.NewRequestWithContext(ctx, "POST", p.endpoint+"/chat/completions", bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("building request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+p.apiKey)

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("calling OpenAI API: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("OpenAI API returned %d: %s", resp.StatusCode, respBody)
	}

	var openaiResp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(respBody, &openaiResp); err != nil {
		return nil, fmt.Errorf("parsing OpenAI response: %w", err)
	}
	if len(openaiResp.Choices) == 0 {
		return nil, fmt.Errorf("empty response from OpenAI")
	}

	var result SuggestACResponse
	if err := json.Unmarshal([]byte(openaiResp.Choices[0].Message.Content), &result); err != nil {
		return nil, fmt.Errorf("parsing AC suggestions: %w", err)
	}

	return &result, nil
}

func (p *OpenAIProvider) SuggestDefect(ctx context.Context, req SuggestDefectRequest) (*SuggestDefectResponse, error) {
	systemPrompt := `You are a senior QA analyst creating defect reports from test failures. Write a clear description (expected vs actual, root cause, impact). Generate 2-4 acceptance criteria in Given/When/Then format for verifying the fix. Return JSON: {"description": "...", "acceptance_criteria": [{"given": "...", "when": "...", "then": "..."}], "questions": []}` + LanguageInstruction(req.Language)

	userPrompt := fmt.Sprintf("Project: %s\nParent Story: %s\nTest: %s\nSuite: %s\nStatus: %s\n\nError:\n%s\n\nGenerate defect report.",
		req.ProjectName, req.ParentTitle, req.TestName, req.SuiteName, req.Status, req.ErrorMessage)

	body := map[string]any{
		"model": p.model, "max_tokens": 1500,
		"messages":        []map[string]string{{"role": "system", "content": systemPrompt}, {"role": "user", "content": userPrompt}},
		"response_format": map[string]string{"type": "json_object"},
	}

	jsonBody, _ := json.Marshal(body)
	httpReq, err := http.NewRequestWithContext(ctx, "POST", p.endpoint+"/chat/completions", bytes.NewReader(jsonBody))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+p.apiKey)

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("OpenAI API returned %d: %s", resp.StatusCode, respBody)
	}

	var openaiResp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(respBody, &openaiResp); err != nil {
		return nil, err
	}
	if len(openaiResp.Choices) == 0 {
		return nil, fmt.Errorf("empty response")
	}

	var result SuggestDefectResponse
	if err := json.Unmarshal([]byte(openaiResp.Choices[0].Message.Content), &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (p *OpenAIProvider) SuggestDecomposition(ctx context.Context, req SuggestDecompRequest) (*SuggestDecompResponse, error) {
	systemPrompt := `You are a Scrum Master decomposing stories into tasks. Suggest 3-8 tasks for disciplines: dev, qe, ux, ba, bsa. Include at least one QE task. Points: 1-8 scale. Return JSON: {"tasks": [{"title": "...", "role": "dev|qe|ux|ba|bsa", "points": N, "rationale": "..."}], "questions": []}` + LanguageInstruction(req.Language)

	userPrompt := fmt.Sprintf("Project: %s\nEpic: %s\n%s\nStory: %s\n%s\n",
		req.ProjectName, req.EpicTitle, req.EpicDescription, req.StoryTitle, req.StoryDescription)
	if len(req.ExistingTasks) > 0 {
		userPrompt += "Existing tasks: "
		for _, t := range req.ExistingTasks {
			userPrompt += t + "; "
		}
		userPrompt += "\n"
	}
	userPrompt += "Suggest task decomposition."

	body := map[string]any{
		"model": p.model, "max_tokens": 1500,
		"messages":        []map[string]string{{"role": "system", "content": systemPrompt}, {"role": "user", "content": userPrompt}},
		"response_format": map[string]string{"type": "json_object"},
	}

	jsonBody, _ := json.Marshal(body)
	httpReq, err := http.NewRequestWithContext(ctx, "POST", p.endpoint+"/chat/completions", bytes.NewReader(jsonBody))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+p.apiKey)

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("OpenAI API returned %d: %s", resp.StatusCode, respBody)
	}

	var openaiResp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(respBody, &openaiResp); err != nil {
		return nil, err
	}
	if len(openaiResp.Choices) == 0 {
		return nil, fmt.Errorf("empty response")
	}

	var result SuggestDecompResponse
	if err := json.Unmarshal([]byte(openaiResp.Choices[0].Message.Content), &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (p *OpenAIProvider) SuggestDescription(ctx context.Context, req SuggestDescRequest) (*SuggestDescResponse, error) {
	systemPrompt := `You are a BSA writing story descriptions. Write 2-4 concise paragraphs covering context, requirements, and edge cases. Return JSON: {"description": "...", "questions": []}` + LanguageInstruction(req.Language)

	userPrompt := fmt.Sprintf("Project: %s\nEpic: %s\n%s\nType: %s\nTitle: %s\n%s\nWrite a description.",
		req.ProjectName, req.EpicTitle, req.EpicDescription, req.StoryType, req.StoryTitle,
		func() string {
			if req.CurrentDesc != "" {
				return "Current: " + req.CurrentDesc
			}
			return ""
		}())

	body := map[string]any{
		"model": p.model, "max_tokens": 1024,
		"messages":        []map[string]string{{"role": "system", "content": systemPrompt}, {"role": "user", "content": userPrompt}},
		"response_format": map[string]string{"type": "json_object"},
	}

	jsonBody, _ := json.Marshal(body)
	httpReq, err := http.NewRequestWithContext(ctx, "POST", p.endpoint+"/chat/completions", bytes.NewReader(jsonBody))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+p.apiKey)

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("OpenAI API returned %d: %s", resp.StatusCode, respBody)
	}

	var openaiResp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(respBody, &openaiResp); err != nil {
		return nil, err
	}
	if len(openaiResp.Choices) == 0 {
		return nil, fmt.Errorf("empty response")
	}

	var result SuggestDescResponse
	if err := json.Unmarshal([]byte(openaiResp.Choices[0].Message.Content), &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (p *OpenAIProvider) RawChat(ctx context.Context, systemPrompt, userPrompt string) (string, error) {
	body := map[string]any{
		"model": p.model, "max_tokens": 512,
		"messages": []map[string]string{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": userPrompt},
		},
	}
	jsonBody, _ := json.Marshal(body)
	httpReq, err := http.NewRequestWithContext(ctx, "POST", p.endpoint+"/chat/completions", bytes.NewReader(jsonBody))
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+p.apiKey)
	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("OpenAI API returned %d: %s", resp.StatusCode, respBody)
	}
	var openaiResp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(respBody, &openaiResp); err != nil {
		return "", err
	}
	if len(openaiResp.Choices) == 0 {
		return "", fmt.Errorf("empty response")
	}
	return openaiResp.Choices[0].Message.Content, nil
}
