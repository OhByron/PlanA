-- PlanA — initial database schema
-- PostgreSQL 16+  •  wal_level must be set to 'logical' (required for Electric SQL sync)

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ---------------------------------------------------------------------------
-- Core: Users & Auth
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT        NOT NULL UNIQUE,
  name        TEXT        NOT NULL,
  avatar_url  TEXT,
  github_id   TEXT        UNIQUE,
  google_id   TEXT        UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE auth_sessions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auth_sessions_user_id    ON auth_sessions(user_id);
CREATE INDEX idx_auth_sessions_expires_at ON auth_sessions(expires_at);


-- ---------------------------------------------------------------------------
-- Org & Team hierarchy
-- ---------------------------------------------------------------------------
CREATE TABLE organizations (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  slug       TEXT        NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE organization_members (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('admin', 'member', 'viewer')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE teams (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  slug            TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, slug)
);

CREATE TABLE team_members (
  team_id    UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('admin', 'member', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id)
);


-- ---------------------------------------------------------------------------
-- Initiatives  (cross-team, quarter/year scale; lives at org level)
-- ---------------------------------------------------------------------------
CREATE TABLE initiatives (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title           TEXT        NOT NULL,
  description     TEXT,
  status          TEXT        NOT NULL DEFAULT 'planned'
                              CHECK (status IN ('planned', 'active', 'completed', 'cancelled')),
  priority        TEXT        NOT NULL DEFAULT 'medium'
                              CHECK (priority IN ('urgent', 'high', 'medium', 'low')),
  start_date      DATE,
  target_date     DATE,
  order_index     FLOAT       NOT NULL DEFAULT 0,
  created_by      UUID        NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_initiatives_org_id ON initiatives(organization_id);


-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------
CREATE TABLE projects (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  slug        TEXT        NOT NULL,
  description TEXT,
  methodology TEXT        NOT NULL DEFAULT 'scrum'
                          CHECK (methodology IN ('scrum', 'kanban', 'shape_up')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (team_id, slug)
);

-- Definition of Done items (per project, ordered checklist)
CREATE TABLE dod_items (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  text        TEXT    NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dod_items_project_id ON dod_items(project_id);


-- ---------------------------------------------------------------------------
-- Epics
-- ---------------------------------------------------------------------------
CREATE TABLE epics (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID        NOT NULL REFERENCES projects(id)     ON DELETE CASCADE,
  initiative_id   UUID                    REFERENCES initiatives(id) ON DELETE SET NULL,
  title           TEXT        NOT NULL,
  description     TEXT,
  status          TEXT        NOT NULL DEFAULT 'open'
                              CHECK (status IN ('open', 'in_progress', 'done', 'cancelled')),
  priority        TEXT        NOT NULL DEFAULT 'medium'
                              CHECK (priority IN ('urgent', 'high', 'medium', 'low')),
  order_index     FLOAT       NOT NULL DEFAULT 0,
  created_by      UUID        NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_epics_project_id    ON epics(project_id);
CREATE INDEX idx_epics_initiative_id ON epics(initiative_id);


-- ---------------------------------------------------------------------------
-- Work Items  (stories · bugs · tasks — unified table, discriminated by type)
-- ---------------------------------------------------------------------------
CREATE TABLE work_items (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID        NOT NULL REFERENCES projects(id)   ON DELETE CASCADE,
  epic_id        UUID                    REFERENCES epics(id)   ON DELETE SET NULL,
  parent_id      UUID                    REFERENCES work_items(id) ON DELETE CASCADE,
  type           TEXT        NOT NULL CHECK (type IN ('story', 'bug', 'task')),
  title          TEXT        NOT NULL,
  description    JSONB,                  -- Tiptap editor JSON
  status         TEXT        NOT NULL DEFAULT 'backlog'
                             CHECK (status IN
                               ('backlog','ready','in_progress','in_review','done','cancelled')),
  priority       TEXT        NOT NULL DEFAULT 'medium'
                             CHECK (priority IN ('urgent','high','medium','low')),
  assignee_id    UUID                    REFERENCES users(id) ON DELETE SET NULL,
  story_points   INTEGER,
  labels         TEXT[]      NOT NULL DEFAULT '{}',
  order_index    FLOAT       NOT NULL DEFAULT 0,
  is_blocked     BOOLEAN     NOT NULL DEFAULT FALSE,
  blocked_reason TEXT,
  created_by     UUID        NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_work_items_project_id  ON work_items(project_id);
CREATE INDEX idx_work_items_epic_id     ON work_items(epic_id);
CREATE INDEX idx_work_items_parent_id   ON work_items(parent_id);
CREATE INDEX idx_work_items_assignee_id ON work_items(assignee_id);
CREATE INDEX idx_work_items_status      ON work_items(status);
CREATE INDEX idx_work_items_is_blocked  ON work_items(project_id, is_blocked)
  WHERE is_blocked = TRUE;


-- ---------------------------------------------------------------------------
-- Acceptance Criteria  (BDD: Given / When / Then)
-- ---------------------------------------------------------------------------
CREATE TABLE acceptance_criteria (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id  UUID        NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  given_clause  TEXT        NOT NULL DEFAULT '',
  when_clause   TEXT        NOT NULL DEFAULT '',
  then_clause   TEXT        NOT NULL DEFAULT '',
  order_index   INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_acceptance_criteria_work_item_id ON acceptance_criteria(work_item_id);


-- ---------------------------------------------------------------------------
-- Work-item DoD checklist state
-- ---------------------------------------------------------------------------
CREATE TABLE work_item_dod (
  work_item_id UUID        NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  dod_item_id  UUID        NOT NULL REFERENCES dod_items(id)  ON DELETE CASCADE,
  checked      BOOLEAN     NOT NULL DEFAULT FALSE,
  checked_by   UUID                 REFERENCES users(id),
  checked_at   TIMESTAMPTZ,
  PRIMARY KEY (work_item_id, dod_item_id)
);


-- ---------------------------------------------------------------------------
-- Sprints / Cycles
-- ---------------------------------------------------------------------------
CREATE TABLE sprints (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  goal       TEXT,
  start_date DATE,
  end_date   DATE,
  status     TEXT        NOT NULL DEFAULT 'planned'
                         CHECK (status IN ('planned','active','completed','cancelled')),
  velocity   INTEGER,                -- calculated when sprint is completed
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sprints_project_id ON sprints(project_id);
CREATE INDEX idx_sprints_status     ON sprints(project_id, status);

CREATE TABLE sprint_items (
  sprint_id    UUID  NOT NULL REFERENCES sprints(id)    ON DELETE CASCADE,
  work_item_id UUID  NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  order_index  FLOAT NOT NULL DEFAULT 0,
  added_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (sprint_id, work_item_id)
);

CREATE INDEX idx_sprint_items_sprint_id ON sprint_items(sprint_id);


-- ---------------------------------------------------------------------------
-- Comments  (rich text via Tiptap JSON)
-- ---------------------------------------------------------------------------
CREATE TABLE comments (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID        NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  body         JSONB       NOT NULL,   -- Tiptap JSON
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comments_work_item_id ON comments(work_item_id);


-- ---------------------------------------------------------------------------
-- Impediments  (explicit "blocked" log)
-- ---------------------------------------------------------------------------
CREATE TABLE impediments (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID        NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  raised_by    UUID        NOT NULL REFERENCES users(id),
  description  TEXT        NOT NULL,
  resolved_at  TIMESTAMPTZ,
  resolved_by  UUID                 REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_impediments_work_item_id ON impediments(work_item_id);
CREATE INDEX idx_impediments_unresolved   ON impediments(work_item_id, resolved_at)
  WHERE resolved_at IS NULL;


-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
CREATE TABLE notifications (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  type         TEXT        NOT NULL,   -- 'assigned' | 'mentioned' | 'status_changed' | ...
  work_item_id UUID                    REFERENCES work_items(id) ON DELETE CASCADE,
  actor_id     UUID                    REFERENCES users(id)      ON DELETE SET NULL,
  data         JSONB       NOT NULL DEFAULT '{}',
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_unread  ON notifications(user_id, read_at)
  WHERE read_at IS NULL;


-- ---------------------------------------------------------------------------
-- Design Attachments  (Figma links with version tracking)
-- ---------------------------------------------------------------------------
CREATE TABLE design_attachments (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id           UUID        NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  type                   TEXT        NOT NULL DEFAULT 'figma'
                                     CHECK (type IN ('figma','url','image')),
  url                    TEXT        NOT NULL,
  title                  TEXT,
  figma_file_key         TEXT,
  figma_node_id          TEXT,
  figma_locked_version   TEXT,       -- version at time of "approved"
  figma_current_version  TEXT,       -- latest known Figma version (from webhook)
  figma_status           TEXT        DEFAULT 'linked'
                                     CHECK (figma_status IN
                                       ('linked','stale','approved','in_review')),
  created_by             UUID        NOT NULL REFERENCES users(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_design_attachments_work_item_id ON design_attachments(work_item_id);


-- ---------------------------------------------------------------------------
-- Auto-update updated_at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_initiatives_updated_at
  BEFORE UPDATE ON initiatives FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_teams_updated_at
  BEFORE UPDATE ON teams FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_epics_updated_at
  BEFORE UPDATE ON epics FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_work_items_updated_at
  BEFORE UPDATE ON work_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_acceptance_criteria_updated_at
  BEFORE UPDATE ON acceptance_criteria FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_sprints_updated_at
  BEFORE UPDATE ON sprints FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_comments_updated_at
  BEFORE UPDATE ON comments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_design_attachments_updated_at
  BEFORE UPDATE ON design_attachments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
