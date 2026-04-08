# PlanA Test Plan

Regression test suite to protect existing functionality as the codebase grows. Organized by priority - highest-value tests first.

## Test Infrastructure

**Backend (Go):**
- Standard `testing` package with `httptest` for handler tests
- Test database: separate PostgreSQL database (`plana_test`) with migrations applied before each suite
- `testutil` package for helpers: create test user, create test org/team/project, auth token generation
- Run with `go test ./...` from `apps/api`

**Frontend (TypeScript):**
- Vitest + React Testing Library
- Mock API responses with MSW (Mock Service Worker) or inline mocks
- Run with `pnpm test` from `apps/web`

## Priority 1: Core Business Logic (Go unit tests)

### P1.1: VCS Item Number Extraction
- **File:** `internal/vcs/item_matcher_test.go`
- **Tests:**
  - `#42` extracts 42
  - `PROJ-42` extracts 42
  - `feature/#42-some-desc` extracts 42
  - Multiple references in one string returns all (deduplicated)
  - No match returns empty
  - Edge cases: `#0`, `#999999`, bare numbers without prefix

### P1.2: Token Encryption
- **File:** `internal/vcs/crypto_test.go`
- **Tests:**
  - Encrypt then decrypt returns original plaintext
  - Different plaintexts produce different ciphertexts
  - Empty key (dev mode) stores/returns plaintext
  - Invalid key hex rejected
  - Wrong key length rejected
  - Tampered ciphertext fails decryption
  - Webhook secret generation produces 64 hex chars

### P1.3: Workflow State Helpers
- **File:** `internal/handlers/workflow_states_test.go`
- **Tests:**
  - `getInitialStateID` returns the backlog state
  - `getTerminalStateID` returns the done state
  - `getOrgIDForProject` resolves correctly through teams
  - `getProjectWorkflowStates` returns all org states when no subset defined
  - `getProjectWorkflowStates` returns only subset when configured

## Priority 2: API Handler Integration Tests (Go)

Requires test database setup/teardown.

### P2.1: Auth & Access Control
- **File:** `internal/handlers/auth_test.go`
- **Tests:**
  - Dev login returns valid JWT
  - Invalid JWT rejected with 401
  - Expired JWT rejected
  - Project access: member can access, non-member gets 403
  - Org admin can access any project in org
  - Admin-only endpoints (workflow states, VCS connections) reject non-admins

### P2.2: Work Item CRUD
- **File:** `internal/handlers/workitems_test.go`
- **Tests:**
  - Create work item returns 201 with correct fields
  - Create assigns initial (backlog) workflow state
  - Update changes workflow state, returns updated item
  - Update to terminal state triggers completion gate (story with incomplete children blocked)
  - QE gate: QE-assigned item cannot move to terminal without passing tests
  - Delete returns 204
  - List with filters (type, state, epic, assignee)
  - Auto-promote parent: all children terminal promotes parent to terminal
  - Activity log entry created on create/update/delete
  - Status change recorded in status_changes table

### P2.3: Workflow States
- **File:** `internal/handlers/workflow_states_integration_test.go`
- **Tests:**
  - Default 5 states seeded on org creation
  - Create state shifts positions correctly
  - Delete state with items returns 409
  - Delete state without items succeeds and closes position gap
  - Cannot delete initial or terminal states
  - Reorder validates bookends stay in place
  - Transition hooks fire notifications on state entry

### P2.4: VCS Webhooks
- **File:** `internal/handlers/vcs_webhooks_test.go`
- **Tests:**
  - GitHub push event creates commits linked to correct work item
  - GitHub PR event creates PR record with correct state
  - GitHub PR merged triggers auto-transition (configurable target state)
  - GitHub PR opened triggers transition to configured state
  - Branch name with `#N` links to work item N
  - Invalid HMAC signature returns 401
  - Disabled connection returns 503
  - GitLab push/MR events parse correctly

### P2.5: WebSocket
- **File:** `internal/handlers/ws_test.go`
- **Tests:**
  - Upgrade with valid JWT succeeds
  - Upgrade without token returns 401
  - Upgrade with invalid token returns 401
  - Origin validation rejects disallowed origins
  - Subscribe to project channel requires membership
  - Subscribe to user channel only works for own user ID
  - Published event reaches subscribed client
  - Presence join/leave events broadcast correctly

## Priority 3: API Endpoint Coverage (Go)

### P3.1: Sprints
- Create, update, delete, list
- Burndown calculation uses terminal states
- Velocity calculation uses terminal states
- Sprint item add/remove

### P3.2: Comments
- Create triggers notification to assignee
- Create triggers mention notifications
- Activity log entry on create

### P3.3: Estimation Poker
- Cast vote creates/updates vote
- Lock sets story points and clears votes
- Reset clears votes

### P3.4: Reports
- Report generation returns correct metrics
- Done/cancelled counts use is_terminal/is_cancelled

### P3.5: Activity Feed
- Project activity returns entries filtered by project
- Work item activity returns entries for specific item
- Filters by event_type, actor_id work correctly

### P3.6: Project Import/Export
- Export produces valid JSON with all entities
- Import creates project with correct workflow state mapping
- Template mode resets dates/assignees/states to initial

## Priority 4: Frontend Component Tests (TypeScript)

### P4.1: Command Palette
- **File:** `components/__tests__/command-palette.test.tsx`
- Opens on Cmd+K
- Filters items by query
- Arrow keys navigate selection
- Enter selects item
- Escape closes
- Empty query shows default items

### P4.2: Board
- **File:** `pages/project/__tests__/board.test.tsx`
- Renders columns from workflow states
- Drag and drop changes workflow state
- Cancelled items not shown on board
- VCS badge appears when data present
- Presence bar shows viewers

### P4.3: Work Item Detail
- Status dropdown populated from project workflow states
- Cancel/restore button toggles is_cancelled
- VCS section appears when branches/PRs exist
- Activity feed renders entries

### P4.4: Workflow Admin
- States list shows all org states
- Backlog and Done are locked
- Add state inserts at correct position
- Delete blocked when items use state

## Test Database Setup

```go
// internal/testutil/testdb.go
package testutil

func SetupTestDB(t *testing.T) *pgxpool.Pool {
    // Connect to plana_test database
    // Run all migrations
    // Return pool
    // t.Cleanup truncates all tables
}

func CreateTestUser(t *testing.T, pool *pgxpool.Pool) (userID string, token string) {
    // Insert user, generate JWT, return both
}

func CreateTestProject(t *testing.T, pool *pgxpool.Pool, userID string) (orgID, teamID, projectID string) {
    // Create org -> team -> project -> add user as admin
    // Workflow states auto-seeded by org creation
}
```

## CI Integration

Add to GitHub Actions:
```yaml
test:
  runs-on: ubuntu-latest
  services:
    postgres:
      image: postgres:16-alpine
      env:
        POSTGRES_DB: plana_test
        POSTGRES_USER: plana
        POSTGRES_PASSWORD: plana
      ports:
        - 5432:5432
    redis:
      image: redis:7-alpine
      ports:
        - 6379:6379
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-go@v5
      with:
        go-version: '1.22'
    - uses: actions/setup-node@v4
      with:
        node-version: '22'
    - run: cd apps/api && go test ./... -v
    - run: pnpm install && pnpm test
```

## Running Tests Locally

```bash
# Backend
docker compose up -d  # Ensure Postgres is running
cd apps/api
DATABASE_URL=postgresql://plana:plana@localhost:5432/plana_test go test ./...

# Frontend
cd apps/web
pnpm test
```

## Coverage Goals

| Area | Target | Rationale |
|------|--------|-----------|
| Auth/access control | 90% | Security-critical |
| Workflow state logic | 85% | Complex business rules |
| VCS webhooks | 80% | External integration, hard to debug in prod |
| Work item CRUD | 75% | Core feature |
| Other handlers | 60% | Standard CRUD |
| Frontend components | 50% | UI changes frequently |
