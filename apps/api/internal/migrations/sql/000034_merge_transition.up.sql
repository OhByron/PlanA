-- Migration 034 — merge auto-transition config
-- Adds a per-project setting for automatically transitioning work items
-- when a linked pull request is merged.

ALTER TABLE projects
  ADD COLUMN merge_transition_status TEXT DEFAULT 'done'
    CHECK (merge_transition_status IS NULL
        OR merge_transition_status IN ('in_review', 'done'));

COMMENT ON COLUMN projects.merge_transition_status IS
  'Status to assign work items when a linked PR is merged. NULL disables auto-transition.';
