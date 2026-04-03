DROP TABLE IF EXISTS sprint_dependencies;
DROP TABLE IF EXISTS epic_dependencies;
ALTER TABLE epics DROP COLUMN IF EXISTS start_date;
ALTER TABLE epics DROP COLUMN IF EXISTS due_date;
