-- Migration 038 -- Outbound webhooks
-- Lets users register webhook URLs that PlanA calls when events occur.

CREATE TABLE outbound_webhooks (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  url           TEXT        NOT NULL,
  secret        TEXT        NOT NULL,
  event_types   TEXT[]      NOT NULL,
  enabled       BOOLEAN     NOT NULL DEFAULT TRUE,
  description   TEXT,
  created_by    UUID        NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE outbound_webhook_deliveries (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id    UUID        NOT NULL REFERENCES outbound_webhooks(id) ON DELETE CASCADE,
  event_type    TEXT        NOT NULL,
  payload       JSONB       NOT NULL,
  status_code   INTEGER,
  response_body TEXT,
  error         TEXT,
  attempts      INTEGER     NOT NULL DEFAULT 1,
  delivered_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_outbound_webhooks_project ON outbound_webhooks(project_id);
CREATE INDEX idx_webhook_deliveries_webhook ON outbound_webhook_deliveries(webhook_id, created_at DESC);

CREATE TRIGGER trg_outbound_webhooks_updated_at
  BEFORE UPDATE ON outbound_webhooks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
