ALTER TABLE projects
  DROP COLUMN IF EXISTS ai_provider,
  DROP COLUMN IF EXISTS ai_model,
  DROP COLUMN IF EXISTS ai_api_key,
  DROP COLUMN IF EXISTS ai_endpoint;
