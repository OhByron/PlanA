-- Migration 014 — Project-level AI provider configuration
-- Users bring their own API key and model choice.

ALTER TABLE projects
  ADD COLUMN ai_provider   TEXT CHECK (ai_provider IN ('anthropic', 'openai', 'azure_openai', 'custom')),
  ADD COLUMN ai_model      TEXT,
  ADD COLUMN ai_api_key    TEXT,
  ADD COLUMN ai_endpoint   TEXT;

COMMENT ON COLUMN projects.ai_provider IS 'AI provider: anthropic, openai, azure_openai, or custom (OpenAI-compatible)';
COMMENT ON COLUMN projects.ai_model IS 'Model ID e.g. claude-sonnet-4-20250514, gpt-4o';
COMMENT ON COLUMN projects.ai_api_key IS 'User-provided API key for their chosen provider';
COMMENT ON COLUMN projects.ai_endpoint IS 'Custom endpoint URL (for azure_openai or custom providers)';
