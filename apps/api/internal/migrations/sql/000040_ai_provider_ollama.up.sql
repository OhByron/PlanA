-- Migration 040 — Allow 'ollama' as a valid ai_provider value.
-- Native /api/chat backend used by the bundled Ollama service for local LLMs
-- (gemma4:26b is the default; tunable via AI_DEFAULT_MODEL).

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_ai_provider_check;

ALTER TABLE projects
  ADD CONSTRAINT projects_ai_provider_check
  CHECK (ai_provider IN ('anthropic', 'openai', 'azure_openai', 'custom', 'ollama'));
