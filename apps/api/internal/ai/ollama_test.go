package ai

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// captures the request body and replies with a canned /api/chat envelope
// containing the given content string. If status != 0, that status is sent.
func newOllamaStub(t *testing.T, content string, status int, capture *map[string]any) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/chat" {
			t.Errorf("expected /api/chat, got %s", r.URL.Path)
		}
		if r.Method != http.MethodPost {
			t.Errorf("expected POST, got %s", r.Method)
		}
		if ct := r.Header.Get("Content-Type"); ct != "application/json" {
			t.Errorf("expected application/json, got %q", ct)
		}
		body, _ := io.ReadAll(r.Body)
		if capture != nil {
			_ = json.Unmarshal(body, capture)
		}
		if status == 0 {
			status = http.StatusOK
		}
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"model":   "gemma4:26b",
			"message": map[string]string{"role": "assistant", "content": content},
			"done":    true,
		})
	}))
}

func TestOllama_SuggestAC_ParsesJSONAndSendsCorrectRequest(t *testing.T) {
	var captured map[string]any
	srv := newOllamaStub(t,
		`{"suggestions":[{"given":"a logged-in user","when":"they click save","then":"the form persists"}],"questions":[]}`,
		0, &captured)
	defer srv.Close()

	p := NewOllamaProvider("gemma4:26b", srv.URL, 16384)
	res, err := p.SuggestAC(context.Background(), SuggestACRequest{
		StoryTitle:  "Save form",
		ProjectName: "Acme",
	})
	if err != nil {
		t.Fatalf("SuggestAC: %v", err)
	}
	if len(res.Suggestions) != 1 || res.Suggestions[0].When != "they click save" {
		t.Fatalf("unexpected result: %+v", res)
	}

	// Verify the request body carried the EolasKMS-pattern flags.
	if captured["model"] != "gemma4:26b" {
		t.Errorf("model = %v, want gemma4:26b", captured["model"])
	}
	if captured["stream"] != false {
		t.Errorf("stream = %v, want false", captured["stream"])
	}
	if captured["think"] != false {
		t.Errorf("think = %v, want false (gemma4 thinking-mode trap)", captured["think"])
	}
	if captured["format"] != "json" {
		t.Errorf("format = %v, want \"json\"", captured["format"])
	}
	opts, _ := captured["options"].(map[string]any)
	if opts == nil || opts["num_ctx"].(float64) != 16384 {
		t.Errorf("options.num_ctx = %v, want 16384", opts)
	}
}

func TestOllama_RawChat_DoesNotSetJSONFormat(t *testing.T) {
	var captured map[string]any
	srv := newOllamaStub(t, "## Release 1.0\n- shipped widgets", 0, &captured)
	defer srv.Close()

	p := NewOllamaProvider("gemma4:26b", srv.URL, 16384)
	out, err := p.RawChat(context.Background(), "system", "user")
	if err != nil {
		t.Fatalf("RawChat: %v", err)
	}
	if !strings.Contains(out, "shipped widgets") {
		t.Fatalf("output missing content: %q", out)
	}
	// RawChat is for free-form (markdown release notes etc.) so we MUST NOT
	// force JSON mode.
	if _, hasFormat := captured["format"]; hasFormat {
		t.Errorf("RawChat must not request JSON format, got %v", captured["format"])
	}
}

func TestOllama_EmptyContentSurfacesThinkingModeError(t *testing.T) {
	srv := newOllamaStub(t, "", 0, nil)
	defer srv.Close()

	p := NewOllamaProvider("gemma4:26b", srv.URL, 16384)
	_, err := p.RawChat(context.Background(), "s", "u")
	if err == nil {
		t.Fatal("expected error for empty content")
	}
	if !strings.Contains(err.Error(), "thinking mode") {
		t.Errorf("error should hint at thinking-mode trap, got: %v", err)
	}
}

func TestOllama_NonOKStatusReturnsError(t *testing.T) {
	srv := newOllamaStub(t, "unused", http.StatusBadGateway, nil)
	defer srv.Close()

	p := NewOllamaProvider("gemma4:26b", srv.URL, 16384)
	_, err := p.RawChat(context.Background(), "s", "u")
	if err == nil {
		t.Fatal("expected error for 502")
	}
	if !strings.Contains(err.Error(), "502") {
		t.Errorf("error should mention status code, got: %v", err)
	}
}

func TestNewProvider_OllamaCase(t *testing.T) {
	t.Setenv("AI_DEFAULT_NUM_CTX", "8192")
	prov, err := NewProvider("ollama", "gemma4:26b", "ignored", "http://example:11434")
	if err != nil {
		t.Fatalf("NewProvider: %v", err)
	}
	op, ok := prov.(*OllamaProvider)
	if !ok {
		t.Fatalf("got %T, want *OllamaProvider", prov)
	}
	if op.model != "gemma4:26b" || op.endpoint != "http://example:11434" || op.numCtx != 8192 {
		t.Errorf("provider built with wrong settings: %+v", op)
	}
}

func TestNewOllamaProvider_AppliesDefaults(t *testing.T) {
	p := NewOllamaProvider("", "", 0)
	if p.model != "gemma4:26b" {
		t.Errorf("default model = %q, want gemma4:26b", p.model)
	}
	if p.endpoint != "http://localhost:11434" {
		t.Errorf("default endpoint = %q, want http://localhost:11434", p.endpoint)
	}
	if p.numCtx != 16384 {
		t.Errorf("default numCtx = %d, want 16384", p.numCtx)
	}
}
