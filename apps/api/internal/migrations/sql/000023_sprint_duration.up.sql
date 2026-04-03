ALTER TABLE projects
  ADD COLUMN sprint_duration_weeks INTEGER NOT NULL DEFAULT 2;

COMMENT ON COLUMN projects.sprint_duration_weeks IS
  'Default sprint length in weeks. Used to auto-calculate sprint end dates.';
