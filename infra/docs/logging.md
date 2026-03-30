# Logging

## Current Setup

The PlanA API outputs structured JSON logs to stdout via Go's `slog` package. Each log line includes:
- `time` — ISO 8601 timestamp
- `level` — INFO, ERROR, WARN
- `msg` — human-readable message
- `method`, `path`, `status`, `duration_ms` — for HTTP requests
- `error` — for error-level entries
- Additional context fields per handler

## Local Development

Logs appear in the terminal where the API runs. No special setup needed.

## Production (Docker)

Docker captures stdout from all containers. View logs:

```bash
docker compose logs -f api        # Follow API logs
docker compose logs --since 1h    # Last hour
docker compose logs api 2>&1 | jq # Pretty-print JSON
```

## Log Shipping (when needed)

For centralized logging, add one of:

### Option A: Docker log driver
```yaml
# In docker-compose.prod.yml, add to the api service:
logging:
  driver: "json-file"
  options:
    max-size: "50m"
    max-file: "5"
```

### Option B: Loki + Grafana (self-hosted)
Add Loki and Grafana containers, configure Docker to ship logs to Loki.

### Option C: Cloud logging
- AWS: CloudWatch log driver
- GCP: gcplogs driver
- Datadog/New Relic: their respective Docker log drivers

No code changes needed — the structured JSON format works with all these options.
