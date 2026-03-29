# PlanA — Product Vision & Build Plan
*Working title: PlanA / ProjectA*
*Last updated: March 29, 2026*

---

## Part 1: The Agile Manifesto as Design Constitution

All product decisions are measured against the Manifesto's 4 values and 12 principles.
They are not marketing copy — they are literal design constraints.

### The 4 Values

- Individuals and interactions **over** processes and tools
- Working software **over** comprehensive documentation
- Customer collaboration **over** contract negotiation
- Responding to change **over** following a plan

*While there is value in the items on the right, we value the items on the left more.*

### The 12 Principles (as tool constraints)

| Principle | Tool Implication |
|---|---|
| Highest priority: satisfy customer through early and continuous delivery | Cycle/sprint model is first-class; release cadence always visible |
| Welcome changing requirements, even late | Stories are cheap to create and re-sequence; no heavyweight change process |
| Deliver working software frequently | Release tracking and notes are first-class, not bolted on |
| Business people and developers must work together daily | Stakeholder and developer views are two lenses on the same data |
| Build around motivated individuals — trust them | No mandatory process ceremony; DoR/DoD are suggestions, not enforcement |
| Most efficient method: face-to-face conversation | Tool records decisions; it does not replace conversation |
| Working software is the primary measure of progress | Test pass state and release status are always visible |
| Sustainable development | Capacity planning, WIP limits, burnout signals in reporting |
| Continuous attention to technical excellence | Test coverage visible on stories; tech debt items are first-class |
| **Simplicity — the art of maximising the amount of work not done** | **UX constitution: every feature must justify its existence; defaults beat configuration** |
| Best architectures emerge from self-organising teams | Workflow is customisable by the team, not imposed from the top |
| At regular intervals, the team reflects and adjusts | Built-in retrospective tooling — not a plugin |

---

## Part 2: Market Landscape

### Tier 1 — The Incumbents

#### Jira + Confluence (Atlassian)

The market's gravitational centre. Used by most enterprise teams not because it is good,
but because it is unavoidable.

| Pros | Cons |
|---|---|
| Massive ecosystem (3,000+ plugins) | Born as a bug tracker in 2002 — Agile was *retrofitted* |
| SAFe / Scrum / Kanban support | Performance is genuinely poor (page loads in seconds) |
| Advanced query (JQL) | Complexity is pathological — "Jira administrator" is a career role (a UX indictment) |
| Jira Align for portfolio level | Context lost in transit between Jira and Confluence |
| Strong API and marketplace | Confluence's editor is hostile |
| Battle-hardened for large orgs | Pricing scales brutally |

**User sentiment:** "I live in Jira but I hate it." Consistent high complaint volume around
performance and configuration overhead.

---

### Tier 2 — Modern Challengers

| Tool | Pros | Cons |
|---|---|---|
| **Linear** | Sub-100ms UI, keyboard-first, excellent developer experience, Cycles, Projects, Initiatives, GitHub/GitLab native, MCP support | No documentation equivalent, no test/QA layer, no BDD, weak capacity reporting, limited enterprise customisation |
| **Shortcut** | Developer-friendly, sane defaults, good GitHub automation, emerging AI agent (Korey) | Limited docs, weak reporting, no QA layer, losing ground to Linear |
| **Plane** | Open source (self-host or cloud), Projects + Wiki, SOC2/ISO27001/GDPR, Projects-as-Code (YAML), MCP server, claims Fortune 10 migration wins | Still maturing, performance unproven at scale, UI polish behind Linear, no BDD/test traceability |
| **YouTrack** | JetBrains IDE integration, QA-aware bug workflows, knowledge base, helpdesk module, free for small teams, command-dialog UX | Dated UI, limited adoption outside JetBrains shops, weak reporting |
| **Azure DevOps** | Only tool with *native* test plan management alongside work items, deep CI/CD pipeline, enterprise SSO/compliance | Sprawling, dated UI, extremely Microsoft-centric, feature-gated by expensive plans |

### Tier 3 — Adjacent / Overreaching

| Tool | Used For | Core Problem |
|---|---|---|
| **ClickUp** | "All in one" experiment | Overwhelming — spaces, folders, lists, views layered on views. More time managing the tool than the work. |
| **Notion** | Documentation + light task tracking | Beautiful but no Agile model, no velocity, no sprint concept. Not a developer tool. |
| **Monday.com** | PM-led teams | Excellent for non-technical PM; foreign to developers. |
| **Asana** | Task management | No sprint model natively. Gaps in developer workflows. |
| **GitHub Projects** | Lightweight issue triage | Barebones. No roadmap, no docs, no velocity. |
| **Trello** | Kanban boards | Simple by design. Scales to exactly nothing. |

---

## Part 3: The Real Gaps (What Nobody Has Solved)

1. **No traceability thread** — No tool connects Business Intent → Story → AC → Test Case → Release Note in one unified model. Teams maintain this chain manually across multiple tools and it rots within weeks.

2. **Documentation is dead on arrival** — It is always a separate write-once artifact, not a living byproduct of the work. A release note should be a byproduct of completed stories, not a separate project.

3. **QE is a second-class citizen** — Test management requires Zephyr, TestRail, or Xray bolted onto Jira. No tool has native test case management. QEs are out of the picture in most Agile tooling design.

4. **Methodology imposition** — Nearly every tool violates "do what works for your team" by forcing a process model. Jira's Scrum and Kanban boards behave differently enough to cause constant confusion.

5. **Performance treated as optional** — Linear disproved this. 2–4 second page loads break flow and violate the principle of sustainable development as applied to the tool itself.

6. **Reporting is theatrical** — Velocity charts nobody trusts. Burndown charts that cliff-dive on sprint day 10. What's actually needed: capacity-aware planning, impediment detection, and cumulative flow visibility.

7. **Extreme ends are underserved** — A 3-person startup needs near-zero setup and sensible defaults. A 200-person enterprise needs SSO, audit trails, programme reporting, and compliance. Most tools optimise for one and bolt on the other.

8. **AI is being bolted on** — Every tool is retrofitting AI onto existing data models. None design the AI participation from the start.

9. **Mobile is an afterthought** — Stand-ups happen on phones. Sprint progress is checked on phones. Bug reports are filed from phones. No current tool acknowledges this.

10. **Role-appropriate views are absent** — Everyone sees everything or nothing is filtered. Developers and executives need radically different lenses on the same data.

---

## Part 4: Product Vision

> A tool that doesn't just *look* Agile — one built around the Manifesto's 4 values and
> 12 principles as literal design constraints.

### Core Data Model

```
Organization
  └── Team
        └── Initiative              (cross-team, quarter/year scale)
              └── Epic              (multi-sprint, feature scope)
                    └── Story       (deliverable within one sprint)
                          ├── Task  (sub-work, dev-owned)
                          ├── Acceptance Criterion (BDD: Given/When/Then)
                          │     └── Test Case (linked or AI-suggested)
                          ├── Bug   (first-class, not a sub-type of Story)
                          └── Design Attachments
                                ├── Figma Frame Link
                                │     ├── figma_file_key
                                │     ├── figma_node_id         (specific frame)
                                │     ├── locked_version        (version at sprint start)
                                │     ├── current_version       (live Figma version)
                                │     ├── status: [linked | stale | approved | in-review]
                                │     └── embedded_preview      (live iframe, Dev Mode)
                                └── Other (URL, image upload, Canva embed)

Sprint / Cycle        (time-boxed container for Stories and Tasks)
Document              (auto-assembled from Epics/Stories, or hand-authored)
  └── Published Portal page  (stakeholder-facing, clean, accessible)

Release               (groups completed Stories; auto-drafts release notes)
```

**The key architectural insight:** Acceptance Criteria and Test Cases are *native first-class
objects* — not comments, not custom fields. This is the traceability chain no other tool has.

---

### The Six Role Surfaces

Same data. Different lenses.

#### 1. Developer
- My active tasks, sorted by sprint priority
- Definition of Done checklist on every story
- Linked PRs with status (open / in-review / merged)
- Live Figma frame embedded in Dev Mode (spacing, colours, export specs)
- Test case pass/fail status for my stories
- Keyboard-first, fast, distraction-free

#### 2. QE / Tester
- AC coverage: which stories have no test cases?
- Bug dashboard: open / in-progress / verified by sprint
- Test run status per sprint (pass / fail / blocked)
- Regression gap detection
- File a bug directly from a test case, pre-linked to the story
- Embedded Figma frame for visual verification during test execution
- "Does this implementation match the design?" explicit checkbox on test case completion

#### 3. Product Owner / PM
- Backlog refinement: drag-to-prioritise, bulk-edit
- Sprint planning: capacity grid (story points available vs. committed)
- Velocity trend (rolling 6-sprint view)
- Impediment board: what has been blocked for more than 24 hours
- Release readiness: what is done, tested, and ready to ship
- Design stale alerts: Figma frame updated after sprint start

#### 4. Designer
- Stories with no linked Figma frame (the coverage gap list)
- Stories they own design on, sorted by status
- Design Review queue: stories where AC changed after the Figma frame was linked
- Link a Figma frame to a story via OAuth file picker or URL paste
- Figma comment thread readable and writable from within PlanA

#### 5. Stakeholder Portal *(read-only, published externally)*
- Clean, accessible documentation generated from Epics and Stories
- Release notes auto-drafted, PM-approved before publish
- No tool noise — only what stakeholders need
- Linkable, searchable, versioned

#### 6. Executive / Programme *(enterprise — Phase 3)*
- Cross-team initiative progress
- Portfolio velocity and capacity
- Risk and dependency map

---

### Methodology Flexibility

| Mode | What it enables |
|---|---|
| **Scrum** | Fixed-duration sprints, velocity tracking, planning poker estimate cards (built in), sprint review and retrospective prompts |
| **Kanban** | WIP limits per column, cycle time metrics, cumulative flow diagram, no sprint construct |
| **Shape Up** | Appetite + pitch model, 6-week cycles, cool-down periods |

No mode is forced. A 2-person startup runs Kanban with zero ceremony. A 50-person org
runs Scrum-of-Scrums across teams.

---

### AI-Native Features *(designed in, not bolted on)*

| Feature | Description |
|---|---|
| **AC Generator** | Given a story title + description, suggest 3–5 Gherkin acceptance criteria. Author approves/edits. |
| **Test Case Suggester** | Given an AC, suggest positive, negative, and edge case test cases |
| **Impediment Detector** | Flag stories with no progress in 48h, "blocked/waiting on" language in comments, or zero AC coverage |
| **Duplicate Detector** | Similarity search on new story creation; surface probable duplicates before save |
| **Sprint Review Summariser** | Auto-draft a sprint summary from completed stories, test results, and release notes |
| **Release Note Drafter** | From completed story descriptions + ACs, generate a structured release note for PM approval |
| **Capacity Advisor** | Given team leave calendar + historical velocity, recommend a sprint commitment range |
| **Retrospective Themes** | Surface common themes from retro comments across N sprints (Phase 3) |

---

## Part 5: Design & UX/UI Integration (Figma)

### Design Position in the Agile Workflow

Design sits *within* the story lifecycle — not upstream from it.

```
Story created (PO + BA)
  → Wireframe / low-fi concept (designer, concurrent with AC writing)
  → AC confirmed with design context
  → High-fi mockup linked in Figma (designer)
  → Dev picks up story — inspects Figma frame in Dev Mode
  → Build → QE verifies against Figma frame AND ACs
  → Story done
```

The Designer is a **first-class participant** in the story lifecycle.

### Philosophy

PlanA does not host or replace Figma. Designers live in Figma — that is their canvas
and creative environment. PlanA's job is to:

1. Know which Figma frame is the source of truth for each story
2. Surface it in context for developers and QEs
3. Detect when design and requirements have drifted apart
4. Never create bureaucratic process around the creative act

### Figma API Capabilities Available

Figma has a genuinely capable developer platform:

| API Capability | What PlanA Uses It For |
|---|---|
| **REST API — Files & Nodes** | Read Figma file structure; surface component metadata alongside a story |
| **Dev Resources API** `POST/GET /v1/dev_resources` | **Two-way link** — attach a PlanA story URL to a specific Figma node. Figma knows which frame → which story and vice versa. |
| **Comments API** | Read/write Figma comments from within PlanA; one shared thread, no context-switch |
| **Webhooks** `FILE_VERSION_UPDATE` | Detect design changes after sprint start; auto-flag story as "Design Stale — review needed" |
| **Embed Kit (iframe)** | Render a live Figma frame inside a PlanA story view; Dev Mode on by default for developers |
| **File Versions API** | Track which design version a story was scoped against vs. the current live version |
| **OAuth2** | Secure per-user Figma authentication; no shared tokens |

### Design Status State Machine on a Story

```
linked → stale         (FILE_VERSION_UPDATE webhook fires)
stale  → approved      (designer or PO reviews and approves updated frame)
approved → in-review   (story moves to dev; dev requests design clarification)
in-review → approved   (designer resolves questions)
```

A story cannot move to "Ready for Dev" while design status is `stale`.

### Figma Plugin (Phase 2)

A native Figma plugin so designers never need to leave Figma:

1. Search PlanA stories from the Figma plugin panel
2. Click to link a selected frame to a story (writes to both Figma Dev Resources API and PlanA API simultaneously)
3. Story status badge displayed as an overlay on the Figma frame (Backlog / In Sprint / In Dev / Done)
4. Post a comment visible in both Figma and the linked PlanA story thread

### Other Design Tools

| Platform | Integration Depth | Rationale |
|---|---|---|
| **Figma** | Deep — API + Dev Resources + Webhooks + Embed + Plugin | Professional UX/UI design tool; where product interfaces live |
| **Canva** | Light — URL link + iframe embed | Marketing/content assets; no story-level traceability needed |
| **FigJam** | Embed (same Figma SDK) | Whiteboard/wireframe early-stage work; link to Epic or Story |
| **Storybook** | Deep (Phase 3) | Links design system components to story implementation |
| **Adobe XD / Sketch** | URL link only | Declining use; no API investment justified |

---

## Part 6: Build Plan

### Phase 0 — Architecture Foundations *(before any product code)*

**Non-negotiable technical decisions:**

| Decision | Rationale |
|---|---|
| **Local-first + sync** | Client holds a replica of workspace data (as Linear does). All interactions are optimistic/instant. Server sync happens in background. This is the source of sub-100ms performance. |
| **API-first** | Every product feature exposed via REST + GraphQL API before the UI consumes it. Third-party integrations are equal to first-party UI. |
| **Multi-tenant from day one** | Workspace isolation and enterprise-ready data boundaries designed in, not retrofitted |
| **Offline-capable** | Core views (board, backlog, story detail) function without connectivity |

**Recommended technology stack:**

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React + TypeScript | Local SQLite replica via CRDT (Automerge / Electric SQL); Tailwind CSS |
| Backend — Core | Go | Performance-critical sync, API gateway, WebSocket server |
| Backend — AI/Webhooks | Node.js + TypeScript | AI service integration, webhook processing, background jobs |
| Database | PostgreSQL + JSONB | Primary store; flexible schema for custom fields |
| Cache / Pub-Sub | Redis | Presence, pub/sub, rate limiting |
| Search | Typesense or Meilisearch | Fast, self-hostable, typo-tolerant |
| Real-time | WebSockets + SSE | WebSockets for presence and sync; SSE for notifications |
| Mobile | React Native | Shared business logic with web client |
| Docs Editor | Tiptap (ProseMirror) | Excellent collaborative editing; self-hostable |

---

### Phase 1 — Core MVP

**Goal:** A 3-person development team can use PlanA daily without reaching for another tool.

| Feature | Notes |
|---|---|
| Teams & Projects | Multi-user workspace, invite by email, roles: Admin / Member / Viewer |
| Story hierarchy | Epics → Stories → Tasks. Drag-and-drop backlog prioritisation. |
| Acceptance Criteria | Native BDD structured fields (Given / When / Then) on every story — not a free-text box |
| Definition of Done | Configurable DoD checklist per project; shown on every story |
| Sprint / Cycle | Create, populate, start, close. Velocity calculated automatically on close. |
| Kanban board | Column-based, WIP limits, drag-to-update status |
| Bug tracking | Bugs are first-class objects; linked to stories and sprints |
| Basic reporting | Burndown chart, velocity trend (last 6 sprints), open impediment count |
| GitHub / GitLab integration | Link PRs to stories; auto-transition story status on PR merge |
| Figma link (basic) | URL paste + iframe embed on story; no API automation yet |
| Web app performance | Sub-100ms navigation. No spinners on standard operations. |

**Explicitly NOT in Phase 1:** Docs portal, test case management, AI features, mobile app, SSO, enterprise reporting, Figma API integration.

---

### Phase 2 — The Differentiators

**Goal:** Make PlanA unmissable. The features that do not exist anywhere else.

| Feature | Notes |
|---|---|
| **Test Case Management** | Create test cases linked to ACs. Test run tracking. Pass / fail / blocked per case. |
| **AC Coverage dashboard** | QE view: stories with ACs that have no linked test cases |
| **Bug ↔ Story ↔ AC traceability** | Navigate the full chain in both directions |
| **Living Documentation** | Docs auto-assembled from Epic + Story content. Editable, versioned, always current. |
| **Stakeholder Portal** | Published, branded, externally-readable doc site generated from filtered docs |
| **Release Notes workflow** | Completed stories feed a Release; AI drafts the note; PM edits and publishes |
| **Sprint planning board** | Capacity grid: team availability × velocity estimate → recommended commitment range |
| **Impediment board** | Automatic detection (48h no progress) + explicit raise. Ageing blockers surface to PM. |
| **Figma deep integration** | OAuth login, Dev Resources API two-way link, version tracking, stale detection, Dev Mode embed, comment thread sync |
| **Designer role surface** | Gap list (stories with no Figma frame), design review queue, AC-change alerts |
| **AI — AC Generator** | From story title + description, suggest Gherkin ACs for author approval |
| **AI — Duplicate Detector** | Warn on similar story creation before save |
| **AI — Release Note Drafter** | Auto-draft from sprint's completed stories and ACs |
| **Mobile app** | iOS and Android. Native stand-up experience: update task, log blocker, view sprint. |

---

### Phase 3 — Enterprise Readiness

**Goal:** Unlock larger customers and regulated industries.

| Feature | Notes |
|---|---|
| SSO / SAML / LDAP | Standard enterprise authentication |
| SCIM provisioning | Auto-provision and deprovision users via IdP |
| Audit log | All workspace actions logged, exportable, immutable |
| Cross-team dependencies | Stories and Epics can block across projects; blockers visible on both sides |
| Programme board | Multi-team sprint alignment view (SAFe PI Planning-style) |
| Capacity planner | Calendar-integrated; accounts for leave, public holidays, and allocation percentage |
| Custom fields + workflows | Configurable per project; opinionated defaults ship ready to use |
| Self-hosted deployment | Docker Compose for setup; Kubernetes + Helm charts for production |
| Air-gapped deployment | No external network dependency; bundled search and AI |
| SOC 2 / ISO 27001 | Certification path for regulated industries |
| Figma Plugin | Link frames from inside Figma; status badge overlay; shared comment thread without leaving Figma |
| Storybook integration | Link design system components to story implementation for visual regression awareness |
| AI — Sprint Review Summariser | Auto-draft sprint review document from completed stories and test results |
| AI — Retrospective Themes | Surface common patterns across N sprints of retrospective notes |
| BDD toolchain sync | Round-trip test results from Cucumber / Behave / SpecFlow back into PlanA test case status via CI |

---

### Phase 4 — Platform

**Goal:** Build the moat. Make PlanA the connective tissue of the modern dev stack.

| Feature | Notes |
|---|---|
| **Native MCP server** | AI agents (GitHub Copilot, Cursor, Claude Code) read and write work items natively; agents become sprint participants |
| **Webhook + events API** | Trigger any external system on any PlanA state change |
| **CLI** | `plana create story "..."` · `plana move PROJ-42 in-progress` · `plana sprint status` |
| **Marketplace / integrations** | Slack, Sentry, Datadog, PagerDuty, Figma advanced, Notion import, Linear import |
| **Public API v2** | Stable, versioned, fully-documented developer API with OpenAPI spec |
| **Embed widget** | Embed a PlanA story, board, or release status into any external tool or portal |

---

## Part 7: Verification Milestones

| Milestone | Success Criteria |
|---|---|
| **Phase 1 complete** | A real 3-person team uses PlanA for 2 consecutive sprints without reaching for Jira, Trello, or any supplementary tool |
| **Phase 2 complete** | A QE can trace any story's AC → test case → pass/fail status in under 30 seconds; a PM can publish a release note from completed sprint work in under 5 minutes; a designer can link a Figma frame without opening PlanA (via plugin) |
| **Phase 3 complete** | A 50-person team onboards and operates for 30 days without a "PlanA administrator" role being created |
| **Performance SLA (ongoing)** | Navigation interactions (board, backlog, story detail) measure < 100ms P95 on standard cloud deployment at all times |

---

## Part 8: Scope Boundaries

### Explicitly Included
- Developer, QE, Designer, PM/PO, Stakeholder, and Executive workflows
- Scrum, Kanban, and Shape Up methodology modes
- Requirements → BDD Acceptance Criteria → Test Cases → Release Notes traceability chain
- Living documentation and a published stakeholder portal
- AI embedded in core workflow — not bolted on after the fact
- Figma deep integration (Phase 2); Figma Plugin (Phase 3)
- Mobile-first for stand-ups, status updates, and blocker reporting
- Cloud, self-hosted, and air-gapped deployment options (Phase 3)
- Open API + MCP server for AI agent participation (Phase 4)

### Deliberately Excluded
| Excluded | Reason |
|---|---|
| Time tracking | Integrations cover this. Building it means becoming Jira. |
| CRM / customer ticket management | A different product category entirely (see: Intercom, Zendesk) |
| Git hosting | Integrate with GitHub / GitLab / Bitbucket; never compete with them |
| CI/CD pipelines | Surface pipeline status; do not replace GitHub Actions or Jenkins |
| Marketing / non-dev team features | Phase 1 is for developers and testers; expand in later phases deliberately |
| Gantt charts | Antithetical to Agile; the backlog and roadmap views replace them |

---

## Part 9: Open Questions & Next Decisions

1. **Name** — "PlanA" / "ProjectA" are working titles. Candidates worth exploring: *Cadence*, *Iterate*, *Accord*, *Relay*. Needs trademark and domain search.

2. **Open source vs. closed** — Plane's open-source (self-host) strategy gave it enterprise credibility and a developer community rapidly. An open-source core (BSL or Apache 2.0) with commercial cloud + enterprise tier is worth serious consideration.

3. **BDD toolchain sync** — Phase 3's test case management becomes dramatically more powerful by round-tripping results from Cucumber, Behave, or SpecFlow back into PlanA via CI pipeline. This is "working software as the primary measure of progress" made literal.

4. **AI model strategy** — Build on top of a foundation model API (OpenAI / Anthropic / Gemini) with a provider-agnostic abstraction layer, so enterprise customers can bring their own model or use on-premise AI.

5. **Pricing model** — Consider: free tier for teams ≤ 5 (captures startups and freelancers); per-seat above that; enterprise contract for self-hosted + compliance features. Avoid the Atlassian trap of pricing that punishes growth.
