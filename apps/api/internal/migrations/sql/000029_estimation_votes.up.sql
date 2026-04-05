CREATE TABLE estimation_votes (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id  UUID        NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  member_id     UUID        NOT NULL REFERENCES project_members(id) ON DELETE CASCADE,
  value         INTEGER     NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (work_item_id, member_id)
);

CREATE INDEX idx_estimation_votes_item ON estimation_votes(work_item_id);
