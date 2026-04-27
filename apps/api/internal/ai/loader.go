package ai

import (
	"context"
	"errors"
	"os"
	"strconv"

	"github.com/jackc/pgx/v5"
)

// ErrNotConfigured is returned by LoadProviderForProject when the project has
// no AI provider set and no global default is configured (i.e. AI_DEFAULT_PROVIDER
// is empty). Handlers should map this to an HTTP 400 with a "configure AI" hint.
var ErrNotConfigured = errors.New("ai not configured for project and no global default")

// dbRow is the minimal pgx interface needed to load a project's AI config.
// Both *pgxpool.Pool and the handlers package's DBPOOL satisfy this implicitly
// through QueryRow.
type dbRow interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// LoadProviderForProject reads a project's AI configuration, falls back to
// global env-driven defaults for any unset fields, and returns a ready-to-call
// Provider plus the project's display name.
//
// Defaults come from these env vars (set in docker-compose for the bundled
// Ollama backend):
//
//	AI_DEFAULT_PROVIDER  (e.g. "ollama")
//	AI_DEFAULT_MODEL     (e.g. "gemma4:26b")
//	AI_DEFAULT_ENDPOINT  (e.g. "http://ollama:11434")
//	AI_DEFAULT_NUM_CTX   (Ollama only; integer, default 16384)
//
// Returns ErrNotConfigured when the project has no provider set AND no global
// default is available — handlers should surface a "configure AI" message.
//
// API-key-bearing providers (anthropic, openai, azure_openai, custom) still
// require ai_api_key on the project; ollama does not.
func LoadProviderForProject(ctx context.Context, db dbRow, projectID string) (Provider, string, error) {
	var providerType, model, apiKey, endpoint *string
	var projectName string
	if err := db.QueryRow(ctx,
		`SELECT name, ai_provider, ai_model, ai_api_key, ai_endpoint FROM projects WHERE id = $1`,
		projectID,
	).Scan(&projectName, &providerType, &model, &apiKey, &endpoint); err != nil {
		return nil, "", err
	}

	pType := derefOr(providerType, os.Getenv("AI_DEFAULT_PROVIDER"))
	if pType == "" {
		return nil, projectName, ErrNotConfigured
	}

	pModel := derefOr(model, os.Getenv("AI_DEFAULT_MODEL"))
	pEndpoint := derefOr(endpoint, os.Getenv("AI_DEFAULT_ENDPOINT"))
	pKey := deref(apiKey)

	// Cloud providers require a key. Ollama is unauthenticated.
	if pType != "ollama" && pKey == "" {
		return nil, projectName, ErrNotConfigured
	}

	prov, err := NewProvider(pType, pModel, pKey, pEndpoint)
	if err != nil {
		return nil, projectName, err
	}
	return prov, projectName, nil
}

// HasAIConfigured returns whether AI is usable for a project (project-level
// config or global default). Used by the GET /ai-settings handler so the
// frontend can render an "AI ready" indicator without exposing keys.
func HasAIConfigured(ctx context.Context, db dbRow, projectID string) bool {
	var providerType, apiKey *string
	_ = db.QueryRow(ctx,
		`SELECT ai_provider, ai_api_key FROM projects WHERE id = $1`, projectID,
	).Scan(&providerType, &apiKey)

	pType := derefOr(providerType, os.Getenv("AI_DEFAULT_PROVIDER"))
	if pType == "" {
		return false
	}
	if pType == "ollama" {
		return true
	}
	return deref(apiKey) != ""
}

// defaultNumCtx reads AI_DEFAULT_NUM_CTX, falling back to 16384.
func defaultNumCtx() int {
	if v := os.Getenv("AI_DEFAULT_NUM_CTX"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return 16384
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func derefOr(s *string, fallback string) string {
	if s != nil && *s != "" {
		return *s
	}
	return fallback
}
