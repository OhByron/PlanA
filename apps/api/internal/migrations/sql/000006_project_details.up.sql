-- Migration 006 — Enrich projects with due date, status, and customer contact

ALTER TABLE projects
  ADD COLUMN status          TEXT DEFAULT 'active' CHECK (status IN ('active', 'on_hold', 'completed', 'cancelled')),
  ADD COLUMN due_date        DATE,
  ADD COLUMN contact_name    TEXT,
  ADD COLUMN contact_email   TEXT,
  ADD COLUMN contact_phone   TEXT;
