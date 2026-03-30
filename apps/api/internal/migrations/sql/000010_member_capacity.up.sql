-- Migration 010 — Add capacity (points per sprint) to project members

ALTER TABLE project_members
  ADD COLUMN capacity INTEGER;

COMMENT ON COLUMN project_members.capacity IS 'Story points this member can handle per sprint. Used for WIP limits and capacity planning.';
