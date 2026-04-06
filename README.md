# PlanA

> Agile project management built for how teams actually work.

PlanA is an open-source project management platform designed for software teams practising Scrum, Kanban, or Shape Up. It combines visual dependency planning with execution tracking in a single tool.

## Features

### Dependency Graph
Interactive canvas for modelling project structure and dependencies. Epics are visual containers holding stories and tasks. Draw dependency connectors between items, validate for cycles and resource conflicts, commit changes when ready.

### Kanban Board
Drag-and-drop board with configurable columns. Enabler badges highlight items that unblock the most work. Story progress bars show task completion. Within-column reordering.

### Gantt Chart (PM/PO)
Interactive timeline with draggable bars, dependency arrows, critical path highlighting, target date markers, sprint bands, zoom controls (day/week/month), and a resource allocation panel showing per-member capacity vs workload.

### Calendar View
Month-view calendar with items placed by start/due date, filterable by team member. Sprint overlay shows which dates fall within each sprint.

### Backlog
Two views: **Flow** (dependency-ordered tree with connectors) and **Priority** (flat list). Cross-navigation to the graph view.

### Estimation Poker
Inline Fibonacci card voting on tasks. Team members vote, distribution is shown live, PM locks the agreed estimate.

### Sprint Management
Create sprints with auto-calculated dates from project defaults. Track velocity, burndown charts, capacity planning.

### Definition of Ready
Automated readiness checklist for stories: description, acceptance criteria, tasks, estimates, design approval. Progress indicator shows how refined each story is.

### Project Import/Export
Full project export as JSON. Import into a new project with fresh UUIDs and reference remapping. Template mode strips dates, statuses, and assignees for reusable project templates.

### Multi-language
26 languages supported. UI adapts to the user's language preference.

---

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- [Node.js](https://nodejs.org/) >= 22
- [pnpm](https://pnpm.io/) >= 10
- [Go](https://go.dev/) >= 1.22

### Development

```bash
# Clone
git clone https://github.com/OhByron/PlanA.git
cd ProjectA

# Configure
cp .env.example .env

# Start Postgres + Redis
docker compose up -d

# Install dependencies
pnpm install

# Start the API (auto-runs migrations)
cd apps/api && go run ./cmd/server &

# Start the web app
cd apps/web && pnpm dev
```

Open `http://localhost:5173` in your browser.

### Production (Docker)

```bash
cp .env.prod.example .env.prod

# Edit .env.prod with your domain, secrets, and OAuth credentials

docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Caddy handles automatic HTTPS via Let's Encrypt when `DOMAIN` is set.

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
Browser → Caddy (HTTPS) → API (Go :8080) → PostgreSQL
                        → Web (Vite :5173)   Redis
```

The API runs database migrations on startup. No separate migration step needed.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, project structure, and development workflow.

## License

PlanA is licensed under the [GNU Affero General Public License v3.0](LICENSE).

You can use, modify, and self-host PlanA freely. If you modify PlanA and offer it as a service, you must make your modifications available under the same license.

## Support

- **Community**: [GitHub Issues](https://github.com/OhByron/PlanA/issues)
- **Paid support**: Contact for SLA-backed support, custom integrations, hosted instances, and team onboarding.
