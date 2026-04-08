-- Migration 036 — Custom workflow states
-- Replaces hardcoded work item statuses with org-level configurable states.

-- ---------------------------------------------------------------------------
-- Org-level workflow state catalog
-- ---------------------------------------------------------------------------
CREATE TABLE workflow_states (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  slug          TEXT        NOT NULL,
  color         TEXT        NOT NULL DEFAULT '#6B7280',
  position      INTEGER     NOT NULL,
  is_initial    BOOLEAN     NOT NULL DEFAULT FALSE,
  is_terminal   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, slug),
  UNIQUE (org_id, position)
);

CREATE INDEX idx_workflow_states_org ON workflow_states(org_id, position);

CREATE TRIGGER trg_workflow_states_updated_at
  BEFORE UPDATE ON workflow_states FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE workflow_states IS 'Org-level workflow state definitions. Backlog (is_initial) and Done (is_terminal) are immutable bookends.';

-- ---------------------------------------------------------------------------
-- Project-level subset (which org states a project uses)
-- ---------------------------------------------------------------------------
CREATE TABLE project_workflow_states (
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workflow_state_id UUID NOT NULL REFERENCES workflow_states(id) ON DELETE CASCADE,
  position          INTEGER NOT NULL,
  PRIMARY KEY (project_id, workflow_state_id),
  UNIQUE (project_id, position)
);

COMMENT ON TABLE project_workflow_states IS 'Optional project-level subset of org workflow states. If empty, project inherits all org states.';

-- ---------------------------------------------------------------------------
-- Transition hooks: "when item enters state X, notify role Y"
-- ---------------------------------------------------------------------------
CREATE TABLE workflow_transition_hooks (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  trigger_state_id  UUID        NOT NULL REFERENCES workflow_states(id) ON DELETE CASCADE,
  action_type       TEXT        NOT NULL CHECK (action_type IN ('notify_role')),
  config            JSONB       NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transition_hooks_state ON workflow_transition_hooks(trigger_state_id);

CREATE TRIGGER trg_transition_hooks_updated_at
  BEFORE UPDATE ON workflow_transition_hooks FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- Seed default states for all existing orgs
-- ---------------------------------------------------------------------------
INSERT INTO workflow_states (org_id, name, slug, color, position, is_initial, is_terminal)
SELECT o.id, s.name, s.slug, s.color, s.position, s.is_initial, s.is_terminal
FROM organizations o
CROSS JOIN (VALUES
  ('Backlog',     'backlog',     '#6B7280', 0, TRUE,  FALSE),
  ('Ready',       'ready',       '#3B82F6', 1, FALSE, FALSE),
  ('In Progress', 'in_progress', '#8B5CF6', 2, FALSE, FALSE),
  ('In Review',   'in_review',   '#F59E0B', 3, FALSE, FALSE),
  ('Done',        'done',        '#22C55E', 4, FALSE, TRUE)
) AS s(name, slug, color, position, is_initial, is_terminal);

-- ---------------------------------------------------------------------------
-- Convert work_items from text status to FK
-- ---------------------------------------------------------------------------

-- Add cancelled flag
ALTER TABLE work_items ADD COLUMN is_cancelled BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill is_cancelled from current status
UPDATE work_items SET is_cancelled = TRUE WHERE status = 'cancelled';

-- Add workflow_state_id column
ALTER TABLE work_items ADD COLUMN workflow_state_id UUID REFERENCES workflow_states(id);

-- Backfill workflow_state_id from current status text
UPDATE work_items
SET workflow_state_id = (
  SELECT ws.id
  FROM projects p
    JOIN teams t ON t.id = p.team_id
    JOIN workflow_states ws ON ws.org_id = t.organization_id
  WHERE p.id = work_items.project_id
    AND ws.slug = CASE WHEN work_items.status = 'cancelled' THEN 'backlog' ELSE work_items.status END
  LIMIT 1
);

-- Drop old status column and make FK not null
ALTER TABLE work_items DROP COLUMN status;
ALTER TABLE work_items ALTER COLUMN workflow_state_id SET NOT NULL;

-- Drop old partial index and recreate
DROP INDEX IF EXISTS idx_work_items_active_project;
CREATE INDEX idx_work_items_active_project ON work_items(project_id, workflow_state_id)
  WHERE is_cancelled = FALSE;

-- ---------------------------------------------------------------------------
-- Convert status_changes from text to FK
-- ---------------------------------------------------------------------------
ALTER TABLE status_changes ADD COLUMN old_state_id UUID REFERENCES workflow_states(id);
ALTER TABLE status_changes ADD COLUMN new_state_id UUID REFERENCES workflow_states(id);
-- No backfill needed for status_changes since no users exist
ALTER TABLE status_changes DROP COLUMN old_status;
ALTER TABLE status_changes DROP COLUMN new_status;

-- ---------------------------------------------------------------------------
-- Replace merge_transition_status with configurable state FKs
-- ---------------------------------------------------------------------------
ALTER TABLE projects ADD COLUMN pr_open_transition_state_id UUID REFERENCES workflow_states(id);
ALTER TABLE projects ADD COLUMN pr_merge_transition_state_id UUID REFERENCES workflow_states(id);

-- Seed pr_merge_transition_state_id from merge_transition_status for existing projects
UPDATE projects
SET pr_merge_transition_state_id = (
  SELECT ws.id
  FROM teams t
    JOIN workflow_states ws ON ws.org_id = t.organization_id
  WHERE t.id = projects.team_id
    AND ws.slug = projects.merge_transition_status
  LIMIT 1
)
WHERE merge_transition_status IS NOT NULL;

ALTER TABLE projects DROP COLUMN IF EXISTS merge_transition_status;
