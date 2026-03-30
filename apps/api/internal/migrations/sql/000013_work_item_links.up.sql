-- Migration 013 — Free-form links on work items and epics

CREATE TABLE work_item_links (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID        NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  label        TEXT        NOT NULL,
  url          TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_work_item_links_work_item ON work_item_links(work_item_id);
