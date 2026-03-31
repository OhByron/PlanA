-- Shareable, token-authenticated links for stakeholder dashboards.
-- Each token grants read-only access to a single project's dashboard view.
CREATE TABLE share_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL DEFAULT 'Stakeholder',
  expires_at  TIMESTAMPTZ,
  created_by  UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ
);

CREATE INDEX idx_share_tokens_token ON share_tokens(token) WHERE revoked_at IS NULL;
CREATE INDEX idx_share_tokens_project ON share_tokens(project_id);
