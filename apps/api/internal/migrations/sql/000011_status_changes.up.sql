-- Migration 011 — Status change audit log for burndown charts

CREATE TABLE status_changes (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id   UUID        NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  sprint_id      UUID        REFERENCES sprints(id) ON DELETE SET NULL,
  old_status     TEXT,
  new_status     TEXT        NOT NULL,
  points         INTEGER,
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_status_changes_sprint ON status_changes(sprint_id, changed_at);
CREATE INDEX idx_status_changes_work_item ON status_changes(work_item_id);
