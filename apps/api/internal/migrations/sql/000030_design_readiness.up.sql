ALTER TABLE work_items
  ADD COLUMN design_ready BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN design_link  TEXT;

COMMENT ON COLUMN work_items.design_ready IS 'Manual checkbox: designs are complete and approved.';
COMMENT ON COLUMN work_items.design_link IS 'Link to design artifact (Figma, Azure DevOps, etc). Required when design_ready is true.';
