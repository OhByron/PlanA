# PlanA

**Open-source Agile project management built for how teams actually work.**

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)
[![Go](https://img.shields.io/badge/Go-1.22+-00ADD8?logo=go&logoColor=white)](https://go.dev/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

PlanA is a project management platform for software teams practising Scrum, Kanban, or Shape Up. It combines **visual dependency planning** with **execution tracking** in a single, self-hostable tool — no per-seat pricing, no vendor lock-in.

> **Why PlanA?** Most PM tools force you to choose between powerful planning (Jira) and clean UX (Linear). PlanA gives you both: an interactive dependency graph for planning, a fast Kanban board for execution, and a Gantt chart for stakeholder reporting — all connected.

---

## Highlights

| | Feature | What it does |
|---|---------|-------------|
| **Plan** | [Dependency Graph](#dependency-graph) | Interactive canvas — drag epics, draw dependencies, validate for cycles, commit when ready |
| **Execute** | [Kanban Board](#kanban-board) | Drag-and-drop columns with enabler badges showing what unblocks the most work |
| **Report** | [Gantt Chart](#gantt-chart) | Draggable timeline with critical path, sprint bands, resource allocation panel |
| **Ship** | [Release Management](#release-management) | Group sprint items into versioned releases with AI-enhanced notes |
| **Collaborate** | [Real-Time](#real-time-collaboration) | WebSocket presence, live updates, no refresh needed |
| **Integrate** | [Git Integration](#git-integration) | GitHub/GitLab webhooks, auto-transition on PR merge, branch copy buttons |
| **Scale** | [Portfolio Dashboard](#portfolio-dashboard) | Cross-project health metrics and initiative progress rollup |

<!-- 
## Screenshots

TODO: Add screenshots of the dependency graph, Kanban board, and Gantt chart.
If you'd like to contribute screenshots, see CONTRIBUTING.md
-->

---

## Quick Start

Get PlanA running locally in under 5 minutes.

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Docker & Docker Compose | Latest | [get-docker](https://docs.docker.com/get-docker/) |
| Node.js | >= 22 | [nodejs.org](https://nodejs.org/) |
| pnpm | >= 10 | [pnpm.io](https://pnpm.io/) |
| Go | >= 1.22 | [go.dev](https://go.dev/) |

### 1. Clone and configure

```bash
git clone https://github.com/OhByron/PlanA.git
cd ProjectA
cp .env.example .env
```

### 2. Start infrastructure

```bash
docker compose up -d
```

This starts PostgreSQL and Redis. Verify with `docker compose ps` — both containers should show "running".

### 3. Start the API

```bash
cd apps/api && go run ./cmd/server
```

The API runs database migrations automatically on first start. You'll see log output confirming the server is listening on `:8080`.

### 4. Start the web app (new terminal)

```bash
# From the project root
pnpm install
cd apps/web && pnpm dev
```

### 5. Open the app

Navigate to **http://localhost:5173** in your browser. You should see the PlanA login/signup screen.

### Troubleshooting

| Problem | Fix |
|---------|-----|
| `docker compose up` fails | Make sure Docker Desktop is running |
| Port 5432 already in use | Another Postgres instance is running — stop it or change `POSTGRES_PORT` in `.env` |
| Port 5173 already in use | Another Vite dev server is running — stop it or run `pnpm dev --port 5174` |
| API can't connect to database | Ensure Docker containers are running: `docker compose ps` |
| `pnpm: command not found` | Install pnpm: `npm install -g pnpm` |

### Production (Docker)

```bash
cp .env.prod.example .env.prod
# Edit .env.prod with your domain, secrets, and OAuth credentials

docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Caddy handles automatic HTTPS via Let's Encrypt when `DOMAIN` is set.

---

## Features

### Dependency Graph
Interactive canvas for modelling project structure and dependencies. Epics are visual containers holding stories and tasks. Draw dependency connectors between items, validate for cycles and resource conflicts, commit changes when ready.

### Kanban Board
Drag-and-drop board with configurable columns and custom workflow states. Enabler badges highlight items that unblock the most work. Story progress bars show task completion. Within-column reordering.

### Gantt Chart
Interactive timeline with draggable bars, dependency arrows, critical path highlighting, target date markers, sprint bands, zoom controls (day/week/month), and a resource allocation panel showing per-member capacity vs workload.

### Calendar View
Month-view calendar with items placed by start/due date, filterable by team member. Sprint overlay shows which dates fall within each sprint.

### Backlog
Two views: **Flow** (dependency-ordered tree with connectors) and **Priority** (flat list). Cross-navigation to the graph view.

### Real-Time Collaboration
WebSocket infrastructure with presence tracking. All mutations emit real-time events — boards, comments, sprints, estimation, notifications. Frontend auto-invalidates caches on events with graceful fallback to polling.

### Git Integration
GitHub and GitLab support. Repository linking with encrypted token storage, webhook processing for push/branch/PR/review/CI events, automatic work item linking, PR status badges, auto-transition on PR open or merge, bot comments linking back to PlanA.

### Custom Workflow States
Org-level workflow definitions with custom names, colors, and ordering. Backlog and Done are immutable bookends — admins fill in the middle. Transition hooks notify roles on state entry. Configurable VCS auto-transitions.

### Estimation Poker
Inline Fibonacci card voting on tasks. Team members vote, distribution is shown live, PM locks the agreed estimate.

### Sprint Management
Create sprints with auto-calculated dates from project defaults. Track velocity, burndown charts, capacity planning.

### Release Management
Group completed sprint items into versioned releases. Template-based note generation grouped by type, AI enhancement for stakeholder-friendly language. Publish to lock, share externally via public token-authenticated page.

### Portfolio Dashboard
Cross-project metrics aggregation with initiative progress rollup (epics, stories, points), project health table with computed indicators (healthy/at_risk/blocked), summary cards, inline progress bars.

### Sprint Goal AI
"Generate with AI" button on sprint detail generates a business-value focused goal from the sprint's items. Uses multi-provider AI system (Anthropic, OpenAI, Azure).

### Definition of Ready
Automated readiness checklist for stories: description, acceptance criteria, tasks, estimates, design approval. Progress indicator shows how refined each story is.

### Command Palette
Cmd+K / Ctrl+K to search work items by title and number, navigate to any project page. Full keyboard navigation.

### API & Webhooks
OpenAPI 3.0 spec (141 endpoints, 23 tags) served via Swagger UI at `/api/docs`. Outbound webhooks with HMAC-SHA256 signed delivery, retry with exponential backoff, event type filtering, delivery log.

### Project Import/Export
Full project export as JSON. Import into a new project with fresh UUIDs and reference remapping. Template mode strips dates, statuses, and assignees for reusable project templates.

### Multi-Language
26 languages supported. UI adapts to the user's language preference.

### Progressive Web App
Installable on mobile and desktop with offline-capable service worker caching.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **API** | Go, Chi router, pgx (PostgreSQL), golang-migrate |
| **Frontend** | React 19, TypeScript, Vite, TanStack Router + Query |
| **UI** | Tailwind CSS, custom component library |
| **Graph** | @xyflow/react (React Flow) |
| **Rich Text** | TipTap |
| **Database** | PostgreSQL 16 |
| **Cache** | Redis 7 |
| **Proxy** | Caddy 2 (production) |
| **AI** | Anthropic Claude / OpenAI (optional, user-provided keys) |

## Architecture

```
Browser --> Caddy (HTTPS) --> API (Go :8080) --> PostgreSQL
                          --> Web (Vite :5173)   Redis
```

The API runs database migrations on startup. No separate migration step needed.

---

## Roadmap

### Coming Next

- Plugin marketplace
- Whiteboards / embedded docs
- Deep Figma integration
- Redis pub/sub for multi-instance horizontal scaling

See [GitHub Issues](https://github.com/OhByron/PlanA/issues) for what's in progress.

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, project structure, and development workflow.

## License

PlanA is licensed under the [GNU Affero General Public License v3.0](LICENSE).

You can use, modify, and self-host PlanA freely. If you modify PlanA and offer it as a service, you must make your modifications available under the same license.

## Support

- **Community**: [GitHub Issues](https://github.com/OhByron/PlanA/issues) and [Discussions](https://github.com/OhByron/PlanA/discussions)
- **Paid support**: Contact for SLA-backed support, custom integrations, hosted instances, and team onboarding.
