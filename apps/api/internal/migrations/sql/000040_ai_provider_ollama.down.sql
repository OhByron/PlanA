-- Revert: drop ollama from the allowed set. Any rows currently using ollama
-- will be cleared first to avoid the new CHECK constraint failing.

UPDATE projects SET ai_provider = NULL WHERE ai_provider = 'ollama';

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_ai_provider_check;

ALTER TABLE projects
  ADD CONSTRAINT projects_ai_provider_check
  CHECK (ai_provider IN ('anthropic', 'openai', 'azure_openai', 'custom'));
