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

## Roadmap

Development goals for PlanA, informed by competitive analysis against Jira, Linear, Plane, and other Agile tools.

### Tier 1: Must-Have (Blocking Adoption)

These are the features evaluators look for in the first 10 minutes. Without them, developer teams are likely to pass.

- ~~**Git Integration (GitHub / GitLab)**~~ **SHIPPED** - Repository linking with encrypted token storage, webhook processing for push/branch/PR/review/CI events, automatic work item linking via item number patterns, PR status badges with clickable CI links, auto-transition on PR open (to in review) and merge (configurable), bot comments on PRs linking back to PlanA, copy/create branch buttons, bulk VCS summary on board cards, admin settings page, 27 languages.
- ~~**Real-Time Collaboration**~~ **SHIPPED** - WebSocket infrastructure with Hub, channel subscriptions, JWT auth, and presence tracking. All major handlers emit real-time events (work items, comments, sprints, estimation, notifications). Frontend auto-invalidates TanStack Query caches on events, with graceful fallback to polling when disconnected. Presence bar shows who's viewing the board. Redis pub/sub for multi-instance scaling deferred until needed.
- ~~**Custom Workflow States**~~ **SHIPPED** - Org-level workflow state definitions with custom names, colors, and ordering. Backlog and Done are immutable bookends, admins fill in the middle. Dynamic board columns, transition hooks (notify roles on state entry), configurable VCS auto-transitions, cancel/restore as separate action, project-level state subsets (API ready). Full backend and frontend conversion from hardcoded statuses.

### Tier 2: Competitive Parity (Expected by Evaluators)

Features that established tools already offer. Their absence signals immaturity during evaluation.

- ~~**Activity Feed & Audit Trail**~~ **SHIPPED** - activity_log table capturing all mutations with actor, event type, and JSONB field-level changes. Project and work-item level endpoints with filtering. Timeline UI on work item detail page.
- ~~**Command Palette (Keyboard-First UX)**~~ **SHIPPED** - Cmd+K / Ctrl+K to search work items by title and number, navigate to any project page. Keyboard navigation, grouped results, 26 languages.
- ~~**Public API Documentation & Webhooks**~~ **SHIPPED** - OpenAPI 3.0 spec (141 endpoints, 23 tags) served via Swagger UI at /api/docs. Outbound webhooks with HMAC-SHA256 signed delivery, retry with exponential backoff, event type filtering, delivery log, test button. Settings UI with webhook management tab.

### Tier 3: Differentiation (Win Deals)

Features that lean into PlanA's unique strengths and create separation from competitors.

- ~~**Sprint Goal AI**~~ **SHIPPED** - "Generate with AI" button on sprint detail generates a business-value focused goal from the sprint's items. Uses the multi-provider AI system (Anthropic, OpenAI, Azure).
- ~~**Release Management**~~ **SHIPPED** - Group completed sprint items into versioned releases. Template-based note generation grouped by type, AI enhancement for stakeholder-friendly language. Publish to lock, share externally via public token-authenticated page. 26 languages.
- ~~**Portfolio / Initiative Dashboard**~~ **SHIPPED** - Cross-project metrics aggregation with initiative progress rollup (epics, stories, points), project health table with computed indicators (healthy/at_risk/blocked), summary cards, inline progress bars. No migration needed, purely aggregates existing data.
- **Mobile Access (PWA)** - A progressive web app covering standup check-ins, quick status updates, and notifications. Covers the majority of mobile use cases without the cost of a native app.

### Deprioritized (Not Now)

- Plugin marketplace (too early, focus on core)
- Whiteboards / embedded docs (not our fight)
- Time tracking (commodity feature, many dedicated tools exist)
- Deep Figma integration (nice-to-have, not a deal-maker)
- Redis pub/sub for real-time multi-instance scaling (deferred until horizontal scaling needed)

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, project structure, and development workflow.

## License

PlanA is licensed under the [GNU Affero General Public License v3.0](LICENSE).

You can use, modify, and self-host PlanA freely. If you modify PlanA and offer it as a service, you must make your modifications available under the same license.

## Support

- **Community**: [GitHub Issues](https://github.com/OhByron/PlanA/issues)
- **Paid support**: Contact for SLA-backed support, custom integrations, hosted instances, and team onboarding.
