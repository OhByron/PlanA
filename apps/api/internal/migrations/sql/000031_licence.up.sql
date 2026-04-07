CREATE TABLE app_licence (
  id         INTEGER     PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- singleton row
  key        TEXT        NOT NULL,
  tier       TEXT        NOT NULL DEFAULT 'community',
  organisation TEXT      NOT NULL DEFAULT 'Community',
  expires_at DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed with community default
INSERT INTO app_licence (key, tier) VALUES ('', 'community');
