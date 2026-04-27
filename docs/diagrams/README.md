# PlanA Diagrams

PlantUML source for the architecture, domain model, and key sequence flows.

## Files

| File | Type | What it shows |
|------|------|---------------|
| [architecture.puml](architecture.puml) | Component / deployment | Browser → Caddy → API (Go) ↔ PostgreSQL/Redis, plus external services (OAuth, AI, Resend, VCS) |
| [class-diagram.puml](class-diagram.puml) | Class / domain | Core entities (User, Org, Project, Epic, WorkItem, Sprint, Release, VCS, Webhooks) and relationships |
| [sequence-oauth-login.puml](sequence-oauth-login.puml) | Sequence | GitHub / Google OAuth + PKCE login flow |
| [sequence-create-work-item.puml](sequence-create-work-item.puml) | Sequence | `POST /work-items` with realtime + outbound webhook fan-out |
| [sequence-realtime-presence.puml](sequence-realtime-presence.puml) | Sequence | WebSocket subscription, presence, live updates |
| [sequence-vcs-webhook.puml](sequence-vcs-webhook.puml) | Sequence | Inbound GitHub/GitLab webhook → auto-transition |
| [sequence-ai-sprint-goal.puml](sequence-ai-sprint-goal.puml) | Sequence | AI sprint-goal suggestion via Anthropic / OpenAI |

## Rendering

### CLI

```bash
# Render every .puml in this folder to PNG (or svg)
plantuml -tpng docs/diagrams/*.puml
plantuml -tsvg docs/diagrams/*.puml
```

### VS Code

Install the **PlantUML** extension (jebbs.plantuml) and preview with `Alt+D`.

### Online

Paste a file's contents into <https://www.plantuml.com/plantuml/uml/> for a quick render.

## Source of truth

These diagrams are hand-authored and reflect the codebase as of branch `fix/revert-tailwind-v4-major`. Update them when you make material changes to:

- `apps/api/internal/server/` (routing) or `internal/handlers/` (new flows)
- `apps/api/internal/migrations/` (schema changes affect the class diagram)
- `apps/api/internal/realtime/`, `internal/vcs/`, `internal/ai/`, `internal/oauth/`, `internal/webhookdelivery/` (the flows each sequence diagram covers)
