ALTER TABLE projects
  ADD COLUMN default_project_months INTEGER NOT NULL DEFAULT 6,
  ADD COLUMN default_epic_weeks    INTEGER NOT NULL DEFAULT 6;

COMMENT ON COLUMN projects.default_project_months IS
  'Expected project/feature duration in months. Used for timeline planning.';
COMMENT ON COLUMN projects.default_epic_weeks IS
  'Default epic duration in weeks. Used to auto-calculate epic due dates.';
