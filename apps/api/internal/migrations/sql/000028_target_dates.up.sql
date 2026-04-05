ALTER TABLE work_items ADD COLUMN target_date DATE;
ALTER TABLE epics ADD COLUMN target_date DATE;

COMMENT ON COLUMN work_items.target_date IS 'Committed delivery date — distinct from due_date which is the planned end.';
COMMENT ON COLUMN epics.target_date IS 'Committed delivery date for the epic.';
