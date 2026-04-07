-- Migration 035 — add checks URL to pull requests
ALTER TABLE vcs_pull_requests ADD COLUMN checks_url TEXT;

COMMENT ON COLUMN vcs_pull_requests.checks_url IS 'Link to the CI/CD check run or pipeline';
