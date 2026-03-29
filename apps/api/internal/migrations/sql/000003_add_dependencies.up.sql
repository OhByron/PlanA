-- Migration 003 — work item dependency tracking
-- Supports directional dependencies between work items and/or epics.
-- Relationship types:
--   depends_on  — source cannot start/complete until target is done (blocking)
--   relates_to  — informational link, no blocking semantics

CREATE TABLE work_item_dependencies (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id   UUID        NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  target_id   UUID        NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL CHECK (type IN ('depends_on', 'relates_to')),
  created_by  UUID        NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_id, target_id, type),
  CHECK (source_id != target_id)
);

CREATE INDEX idx_dependencies_source ON work_item_dependencies(source_id);
CREATE INDEX idx_dependencies_target ON work_item_dependencies(target_id);
