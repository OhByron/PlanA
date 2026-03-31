-- Add source_test_result_id to work_items for defect traceability.
-- When a bug is created from a failed test result, this links back to the exact result.
ALTER TABLE work_items
  ADD COLUMN source_test_result_id UUID REFERENCES test_results(id) ON DELETE SET NULL;
