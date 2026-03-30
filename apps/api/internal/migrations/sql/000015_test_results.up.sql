-- Migration 015 — Test results ingestion
-- Stores pass/fail/blocked results from JUnit XML imports or webhooks.
-- Each result links to a work item by item_number match or explicit ID.

CREATE TABLE test_results (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  work_item_id   UUID        REFERENCES work_items(id) ON DELETE SET NULL,
  test_name      TEXT        NOT NULL,
  status         TEXT        NOT NULL CHECK (status IN ('pass', 'fail', 'error', 'skip')),
  duration_ms    INTEGER,
  error_message  TEXT,
  source         TEXT        NOT NULL DEFAULT 'manual',
  suite_name     TEXT,
  run_id         TEXT,
  reported_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_test_results_project ON test_results(project_id, reported_at DESC);
CREATE INDEX idx_test_results_work_item ON test_results(work_item_id) WHERE work_item_id IS NOT NULL;
CREATE INDEX idx_test_results_run ON test_results(run_id) WHERE run_id IS NOT NULL;
