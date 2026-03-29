-- Migration 008 — Invitation system and password auth

-- Password hash for email/password login (nullable — OAuth users won't have one)
ALTER TABLE users
  ADD COLUMN password_hash TEXT;

-- Invitations link a project member slot to a registration token
CREATE TABLE invitations (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  member_id      UUID        NOT NULL REFERENCES project_members(id) ON DELETE CASCADE,
  email          TEXT        NOT NULL,
  token          TEXT        NOT NULL UNIQUE,
  invited_by     UUID        NOT NULL REFERENCES users(id),
  accepted_at    TIMESTAMPTZ,
  expires_at     TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_project_id ON invitations(project_id);
