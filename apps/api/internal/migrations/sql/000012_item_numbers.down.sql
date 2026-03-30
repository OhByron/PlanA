DROP INDEX IF EXISTS idx_work_items_project_number;
DROP INDEX IF EXISTS idx_epics_project_number;
ALTER TABLE work_items DROP COLUMN IF EXISTS item_number;
ALTER TABLE epics DROP COLUMN IF EXISTS item_number;
ALTER TABLE projects DROP COLUMN IF EXISTS item_counter;
