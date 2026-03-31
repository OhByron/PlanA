-- User preference for daily digest email. Defaults to true for all users.
ALTER TABLE users ADD COLUMN daily_digest BOOLEAN NOT NULL DEFAULT true;
