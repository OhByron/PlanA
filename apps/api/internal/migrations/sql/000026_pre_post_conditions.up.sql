ALTER TABLE work_items
  ADD COLUMN pre_conditions  JSONB,
  ADD COLUMN post_conditions JSONB;
