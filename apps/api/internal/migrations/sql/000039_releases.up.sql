-- Migration 039 -- Release management
-- Groups completed work items into versioned releases with optional public sharing.

CREATE TABLE releases (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  version       TEXT,
  description   TEXT,
  status        TEXT        NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft', 'published', 'archived')),
  notes         TEXT,
  share_token   TEXT        UNIQUE,
  published_at  TIMESTAMPTZ,
  created_by    UUID        NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE release_items (
  release_id    UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  work_item_id  UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  PRIMARY KEY (release_id, work_item_id)
);

CREATE TABLE release_sprints (
  release_id    UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  sprint_id     UUID NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  PRIMARY KEY (release_id, sprint_id)
);

CREATE INDEX idx_releases_project ON releases(project_id, created_at DESC);
CREATE INDEX idx_release_items_release ON release_items(release_id);
CREATE INDEX idx_release_items_work_item ON release_items(work_item_id);
CREATE INDEX idx_releases_share_token ON releases(share_token) WHERE share_token IS NOT NULL;

CREATE TRIGGER trg_releases_updated_at
  BEFORE UPDATE ON releases FOR EACH ROW EXECUTE FUNCTION update_updated_at();
