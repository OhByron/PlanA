-- Archive support for projects
ALTER TABLE projects
  ADD COLUMN archived_at     TIMESTAMPTZ,
  ADD COLUMN retention_days  INTEGER NOT NULL DEFAULT 365;

COMMENT ON COLUMN projects.retention_days IS
  'Days to retain archived project data before eligible for purge. Default 1 year.';

-- Partial index: queries filtering active projects skip archived rows
CREATE INDEX idx_projects_active ON projects(team_id, created_at)
  WHERE archived_at IS NULL;

-- Partial index on work items for active projects only
CREATE INDEX idx_work_items_active_project ON work_items(project_id, status)
  WHERE status NOT IN ('done', 'cancelled');
