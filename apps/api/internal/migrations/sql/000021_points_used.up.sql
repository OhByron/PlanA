-- Actual points consumed on completion, separate from the estimate (story_points).
-- NULL means not yet recorded; defaults to story_points when moved to done if not set.
ALTER TABLE work_items
  ADD COLUMN points_used INTEGER;

COMMENT ON COLUMN work_items.points_used IS
  'Actual effort in story points. Compared against story_points (estimate) for velocity accuracy.';
