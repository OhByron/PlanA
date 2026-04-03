DROP INDEX IF EXISTS idx_work_items_active_project;
DROP INDEX IF EXISTS idx_projects_active;
ALTER TABLE projects DROP COLUMN IF EXISTS retention_days;
ALTER TABLE projects DROP COLUMN IF EXISTS archived_at;
