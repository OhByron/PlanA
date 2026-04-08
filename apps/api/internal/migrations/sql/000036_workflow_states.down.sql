-- Restore text status column on work_items
ALTER TABLE work_items ADD COLUMN status TEXT NOT NULL DEFAULT 'backlog';

-- Backfill from workflow_state_id
UPDATE work_items wi
SET status = ws.slug
FROM workflow_states ws
WHERE ws.id = wi.workflow_state_id;

-- Set cancelled items
UPDATE work_items SET status = 'cancelled' WHERE is_cancelled = TRUE;

-- Restore CHECK
ALTER TABLE work_items ADD CONSTRAINT work_items_status_check
  CHECK (status IN ('backlog','ready','in_progress','in_review','done','cancelled'));

ALTER TABLE work_items DROP COLUMN workflow_state_id;
ALTER TABLE work_items DROP COLUMN is_cancelled;

-- Restore partial index
DROP INDEX IF EXISTS idx_work_items_active_project;
CREATE INDEX idx_work_items_active_project ON work_items(project_id, status)
  WHERE status NOT IN ('done', 'cancelled');

-- Restore status_changes text columns
ALTER TABLE status_changes ADD COLUMN old_status TEXT;
ALTER TABLE status_changes ADD COLUMN new_status TEXT;
ALTER TABLE status_changes DROP COLUMN IF EXISTS old_state_id;
ALTER TABLE status_changes DROP COLUMN IF EXISTS new_state_id;

-- Restore merge_transition_status
ALTER TABLE projects ADD COLUMN merge_transition_status TEXT DEFAULT 'done'
  CHECK (merge_transition_status IS NULL
      OR merge_transition_status IN ('in_review', 'done'));
ALTER TABLE projects DROP COLUMN IF EXISTS pr_open_transition_state_id;
ALTER TABLE projects DROP COLUMN IF EXISTS pr_merge_transition_state_id;

-- Drop new tables
DROP TABLE IF EXISTS workflow_transition_hooks;
DROP TABLE IF EXISTS project_workflow_states;
DROP TABLE IF EXISTS workflow_states;
