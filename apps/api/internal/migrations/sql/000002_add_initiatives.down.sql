-- Migration 002 — down: remove initiatives

DROP INDEX IF EXISTS idx_epics_initiative_id;
ALTER TABLE epics DROP COLUMN IF EXISTS initiative_id;
DROP TRIGGER IF EXISTS trg_initiatives_updated_at ON initiatives;
DROP INDEX IF EXISTS idx_initiatives_org_id;
DROP TABLE IF EXISTS initiatives;
