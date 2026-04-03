-- Add date planning fields to epics
ALTER TABLE epics
  ADD COLUMN start_date DATE,
  ADD COLUMN due_date   DATE;

-- Epic-to-epic dependencies (delivery ordering between epics)
CREATE TABLE epic_dependencies (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id   UUID        NOT NULL REFERENCES epics(id) ON DELETE CASCADE,
  target_id   UUID        NOT NULL REFERENCES epics(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL CHECK (type IN ('depends_on', 'relates_to')),
  strength    TEXT        NOT NULL DEFAULT 'hard' CHECK (strength IN ('hard', 'soft')),
  created_by  UUID        NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_id, target_id, type),
  CHECK  (source_id != target_id)
);

CREATE INDEX idx_epic_deps_source ON epic_dependencies(source_id);
CREATE INDEX idx_epic_deps_target ON epic_dependencies(target_id);

-- Sprint-to-sprint dependencies (execution ordering between sprints)
CREATE TABLE sprint_dependencies (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id   UUID        NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  target_id   UUID        NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL CHECK (type IN ('depends_on', 'relates_to')),
  strength    TEXT        NOT NULL DEFAULT 'hard' CHECK (strength IN ('hard', 'soft')),
  created_by  UUID        NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_id, target_id, type),
  CHECK  (source_id != target_id)
);

CREATE INDEX idx_sprint_deps_source ON sprint_dependencies(source_id);
CREATE INDEX idx_sprint_deps_target ON sprint_dependencies(target_id);
