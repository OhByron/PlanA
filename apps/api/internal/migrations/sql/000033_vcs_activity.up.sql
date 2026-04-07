-- Migration 033 — VCS activity tables
-- Stores branches, pull requests, commits, and webhook event audit log.

-- ---------------------------------------------------------------------------
-- Branches
-- ---------------------------------------------------------------------------
CREATE TABLE vcs_branches (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id   UUID        NOT NULL REFERENCES vcs_connections(id) ON DELETE CASCADE,
  work_item_id    UUID        REFERENCES work_items(id) ON DELETE SET NULL,
  name            TEXT        NOT NULL,
  sha             TEXT,
  url             TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (connection_id, name)
);

CREATE INDEX idx_vcs_branches_work_item ON vcs_branches(work_item_id)
  WHERE work_item_id IS NOT NULL;

CREATE TRIGGER trg_vcs_branches_updated_at
  BEFORE UPDATE ON vcs_branches FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- Pull Requests / Merge Requests
-- ---------------------------------------------------------------------------
CREATE TABLE vcs_pull_requests (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id   UUID        NOT NULL REFERENCES vcs_connections(id) ON DELETE CASCADE,
  work_item_id    UUID        REFERENCES work_items(id) ON DELETE SET NULL,
  external_id     BIGINT      NOT NULL,  -- GitHub PR number or GitLab MR iid
  title           TEXT        NOT NULL,
  state           TEXT        NOT NULL CHECK (state IN ('open', 'closed', 'merged')),
  draft           BOOLEAN     NOT NULL DEFAULT FALSE,
  source_branch   TEXT        NOT NULL,
  target_branch   TEXT        NOT NULL,
  author_login    TEXT,
  author_avatar   TEXT,
  url             TEXT        NOT NULL,
  checks_status   TEXT        CHECK (checks_status IN ('pending', 'success', 'failure', 'neutral')),
  review_status   TEXT        CHECK (review_status IN ('pending', 'approved', 'changes_requested', 'commented')),
  merged_at       TIMESTAMPTZ,
  closed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (connection_id, external_id)
);

CREATE INDEX idx_vcs_prs_work_item ON vcs_pull_requests(work_item_id)
  WHERE work_item_id IS NOT NULL;
CREATE INDEX idx_vcs_prs_state ON vcs_pull_requests(connection_id, state);

CREATE TRIGGER trg_vcs_prs_updated_at
  BEFORE UPDATE ON vcs_pull_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- Commits
-- ---------------------------------------------------------------------------
CREATE TABLE vcs_commits (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id   UUID        NOT NULL REFERENCES vcs_connections(id) ON DELETE CASCADE,
  work_item_id    UUID        REFERENCES work_items(id) ON DELETE SET NULL,
  sha             TEXT        NOT NULL,
  message         TEXT        NOT NULL,
  author_login    TEXT,
  author_email    TEXT,
  url             TEXT,
  committed_at    TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (connection_id, sha)
);

CREATE INDEX idx_vcs_commits_work_item ON vcs_commits(work_item_id)
  WHERE work_item_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Webhook event audit log
-- ---------------------------------------------------------------------------
CREATE TABLE vcs_webhook_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id   UUID        REFERENCES vcs_connections(id) ON DELETE SET NULL,
  provider        TEXT        NOT NULL,
  event_type      TEXT        NOT NULL,   -- push, pull_request, pull_request_review, etc.
  delivery_id     TEXT,                   -- X-GitHub-Delivery or X-Gitlab-Event-UUID
  payload         JSONB       NOT NULL,
  processed       BOOLEAN     NOT NULL DEFAULT FALSE,
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vcs_webhook_events_unprocessed ON vcs_webhook_events(processed, created_at)
  WHERE processed = FALSE;
