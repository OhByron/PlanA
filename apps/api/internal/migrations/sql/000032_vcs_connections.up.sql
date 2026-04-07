-- Migration 032 — VCS repository connections
-- Links a PlanA project to a GitHub or GitLab repository.

CREATE TABLE vcs_connections (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider        TEXT        NOT NULL CHECK (provider IN ('github', 'gitlab')),
  owner           TEXT        NOT NULL,   -- org or user that owns the repo
  repo            TEXT        NOT NULL,   -- repository name
  default_branch  TEXT        NOT NULL DEFAULT 'main',
  auth_method     TEXT        NOT NULL CHECK (auth_method IN ('github_app', 'pat', 'oauth')),
  encrypted_token BYTEA,                  -- AES-256-GCM encrypted PAT or OAuth token
  installation_id BIGINT,                 -- GitHub App installation ID (NULL for PAT/OAuth)
  webhook_secret  TEXT        NOT NULL,   -- server-generated HMAC secret
  webhook_id      BIGINT,                 -- provider's webhook ID (for cleanup on delete)
  enabled         BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by      UUID        NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, provider, owner, repo)
);

COMMENT ON TABLE vcs_connections IS 'Links a PlanA project to an external Git repository';
COMMENT ON COLUMN vcs_connections.encrypted_token IS 'AES-256-GCM encrypted access token; NULL when using GitHub App auth';
COMMENT ON COLUMN vcs_connections.webhook_secret IS 'Random secret used to validate inbound webhooks from the provider';

CREATE INDEX idx_vcs_connections_project ON vcs_connections(project_id);
CREATE INDEX idx_vcs_connections_repo    ON vcs_connections(provider, owner, repo);

CREATE TRIGGER trg_vcs_connections_updated_at
  BEFORE UPDATE ON vcs_connections FOR EACH ROW EXECUTE FUNCTION update_updated_at();
