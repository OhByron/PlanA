-- Migration 007 — Project-level team members
-- These are the people working on a project. They may or may not have a PlanA user account.
-- This replaces the team_members table for day-to-day project work.

CREATE TABLE project_members (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id      UUID                 REFERENCES users(id) ON DELETE SET NULL,
  name         TEXT        NOT NULL,
  email        TEXT,
  phone        TEXT,
  job_role     TEXT        NOT NULL CHECK (job_role IN ('pm', 'po', 'bsa', 'ba', 'qe', 'ux', 'dev')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, email)
);

CREATE INDEX idx_project_members_project_id ON project_members(project_id);
CREATE INDEX idx_project_members_user_id ON project_members(user_id) WHERE user_id IS NOT NULL;

CREATE TRIGGER trg_project_members_updated_at
  BEFORE UPDATE ON project_members FOR EACH ROW EXECUTE FUNCTION update_updated_at();
