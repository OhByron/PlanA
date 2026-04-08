-- Migration 037 -- Activity log for audit trail
-- Captures all meaningful changes across the system for the activity feed.

CREATE TABLE activity_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  work_item_id  UUID        REFERENCES work_items(id) ON DELETE CASCADE,
  sprint_id     UUID        REFERENCES sprints(id) ON DELETE SET NULL,
  epic_id       UUID        REFERENCES epics(id) ON DELETE SET NULL,
  actor_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type    TEXT        NOT NULL,
  -- JSONB with changed fields: {"field": {"old": "x", "new": "y"}, ...}
  -- For create/delete events: {"title": "...", "type": "..."}
  changes       JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE activity_log IS 'Audit trail of all changes for the activity feed';
COMMENT ON COLUMN activity_log.event_type IS 'e.g. work_item.created, work_item.updated, comment.created, sprint.updated';
COMMENT ON COLUMN activity_log.changes IS 'JSONB with field-level old/new values or event metadata';

CREATE INDEX idx_activity_log_project ON activity_log(project_id, created_at DESC);
CREATE INDEX idx_activity_log_work_item ON activity_log(work_item_id, created_at DESC)
  WHERE work_item_id IS NOT NULL;
CREATE INDEX idx_activity_log_actor ON activity_log(actor_id, created_at DESC);

-- Also add changed_by to status_changes for backwards compatibility
ALTER TABLE status_changes ADD COLUMN changed_by UUID REFERENCES users(id);
