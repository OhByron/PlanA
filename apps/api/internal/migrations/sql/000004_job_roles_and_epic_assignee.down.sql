ALTER TABLE epics DROP COLUMN IF EXISTS assignee_id;
DROP INDEX IF EXISTS idx_epics_assignee_id;
ALTER TABLE team_members DROP COLUMN IF EXISTS job_role;
