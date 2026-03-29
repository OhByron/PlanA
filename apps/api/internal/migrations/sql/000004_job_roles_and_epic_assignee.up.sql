-- Migration 004 — Add job roles to team members and assignee to epics
--
-- job_role is the domain role (what they do on the project).
-- The existing 'role' column remains for access control (admin/member/viewer).

ALTER TABLE team_members
  ADD COLUMN job_role TEXT CHECK (job_role IN ('pm', 'po', 'bsa', 'ba', 'qe', 'ux', 'dev'));

-- Epics can now be assigned to a person (typically BSA or BA).
ALTER TABLE epics
  ADD COLUMN assignee_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX idx_epics_assignee_id ON epics(assignee_id);
