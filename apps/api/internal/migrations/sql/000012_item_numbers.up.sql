-- Migration 012 — Sequential item numbers per project
-- Format: project has a counter, each work item and epic gets the next number.
-- Displayed as "SLUG-N" (e.g., PLANA-42).

-- Counter on the project
ALTER TABLE projects
  ADD COLUMN item_counter INTEGER NOT NULL DEFAULT 0;

-- Number on work items and epics
ALTER TABLE work_items
  ADD COLUMN item_number INTEGER;

ALTER TABLE epics
  ADD COLUMN item_number INTEGER;

CREATE UNIQUE INDEX idx_work_items_project_number ON work_items(project_id, item_number)
  WHERE item_number IS NOT NULL;

CREATE UNIQUE INDEX idx_epics_project_number ON epics(project_id, item_number)
  WHERE item_number IS NOT NULL;

-- Backfill existing items with sequential numbers
DO $$
DECLARE
  proj RECORD;
  counter INTEGER;
  item RECORD;
BEGIN
  FOR proj IN SELECT id FROM projects LOOP
    counter := 0;
    FOR item IN
      SELECT id, 'epic' as kind FROM epics WHERE project_id = proj.id
      UNION ALL
      SELECT id, 'work_item' as kind FROM work_items WHERE project_id = proj.id
      ORDER BY kind, id
    LOOP
      counter := counter + 1;
      IF item.kind = 'epic' THEN
        UPDATE epics SET item_number = counter WHERE id = item.id;
      ELSE
        UPDATE work_items SET item_number = counter WHERE id = item.id;
      END IF;
    END LOOP;
    UPDATE projects SET item_counter = counter WHERE id = proj.id;
  END LOOP;
END $$;
