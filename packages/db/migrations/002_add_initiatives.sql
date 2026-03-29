-- Migration 002 — Add initiatives table
-- Initiatives are cross-team, quarter/year-scale planning objects that live at
-- the organisation level and optionally group Epics across multiple projects.

-- ---------------------------------------------------------------------------
-- Up
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

CREATE TRIGGER trg_initiatives_updated_at
  BEFORE UPDATE ON initiatives FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE epics
  ADD COLUMN initiative_id UUID REFERENCES initiatives(id) ON DELETE SET NULL;

CREATE INDEX idx_epics_initiative_id ON epics(initiative_id);

-- ---------------------------------------------------------------------------
-- Down
-- ---------------------------------------------------------------------------
-- DROP INDEX idx_epics_initiative_id;
-- ALTER TABLE epics DROP COLUMN initiative_id;
-- DROP TRIGGER trg_initiatives_updated_at ON initiatives;
-- DROP INDEX idx_initiatives_org_id;
-- DROP TABLE initiatives;
