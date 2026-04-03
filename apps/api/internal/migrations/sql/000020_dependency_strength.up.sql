ALTER TABLE work_item_dependencies
  ADD COLUMN strength TEXT NOT NULL DEFAULT 'hard'
  CHECK (strength IN ('hard', 'soft'));
