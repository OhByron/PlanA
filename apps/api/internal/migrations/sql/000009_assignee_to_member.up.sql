-- Migration 009 — Change assignee references from users to project_members
-- This allows assigning work to team members who haven't registered yet.

ALTER TABLE work_items DROP CONSTRAINT IF EXISTS work_items_assignee_id_fkey;
ALTER TABLE epics DROP CONSTRAINT IF EXISTS epics_assignee_id_fkey;

-- The columns remain UUID — they now store project_members.id instead of users.id.
-- No FK constraint because assignees may be in different projects; the app enforces validity.
COMMENT ON COLUMN work_items.assignee_id IS 'References project_members.id (not users.id)';
COMMENT ON COLUMN epics.assignee_id IS 'References project_members.id (not users.id)';
