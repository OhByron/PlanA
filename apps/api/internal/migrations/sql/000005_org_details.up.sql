-- Migration 005 — Enrich organizations with contact/address details and archive support

ALTER TABLE organizations
  ADD COLUMN contact_name  TEXT,
  ADD COLUMN contact_email TEXT,
  ADD COLUMN contact_phone TEXT,
  ADD COLUMN address_line1 TEXT,
  ADD COLUMN address_line2 TEXT,
  ADD COLUMN city          TEXT,
  ADD COLUMN state         TEXT,
  ADD COLUMN postal_code   TEXT,
  ADD COLUMN country       TEXT,
  ADD COLUMN archived_at   TIMESTAMPTZ;

CREATE INDEX idx_organizations_archived ON organizations(archived_at)
  WHERE archived_at IS NULL;
