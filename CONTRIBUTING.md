# Contributing to PlanA

Thanks for your interest in contributing to PlanA! This document covers everything you need to get started.

## Getting Started

### Prerequisites

- **Node.js** >= 22
- **pnpm** >= 10
- **Go** >= 1.22
- **Docker** and **Docker Compose**

### Local Setup

```bash
# Clone the repo
git clone https://github.com/OhByron/PlanA.git
cd ProjectA

# Copy environment config
cp .env.example .env

# Start infrastructure (Postgres + Redis)
docker compose up -d

# Install frontend dependencies
pnpm install

# Start the API (runs migrations automatically)
cd apps/api && go run ./cmd/server

# In another terminal, start the web app
cd apps/web && pnpm dev
```

The app will be available at `http://localhost:5173`.

## Project Structure

```
ProjectA/
├── apps/
│   ├── api/          # Go backend (Chi router, pgx, JWT auth)
│   │   ├── cmd/      # Entry points
│   │   └── internal/ # Handlers, middleware, migrations, AI providers
│   ├── web/          # React frontend (Vite, TanStack Router/Query, Tailwind)
│   │   ├── src/
│   │   │   ├── components/  # Reusable UI components
│   │   │   ├── hooks/       # React Query hooks
│   │   │   ├── pages/       # Route pages
│   │   │   └── i18n/        # 26 locale files
│   │   └── ...
│   └── mobile/       # (future) React Native app
├── packages/
│   ├── types/        # Shared TypeScript type definitions
│   ├── ui/           # Shared UI component library
│   └── config/       # Shared Tailwind/ESLint config
├── infra/            # Docker, Caddy, backup configs
└── docker-compose.yml
```

## Development Workflow

1. **Create a branch** from `main` for your work
2. **Write code** — follow existing patterns in the codebase
3. **Test locally** — make sure `go build ./...` and `pnpm typecheck` pass
4. **Submit a PR** — describe what you changed and why

## Code Style

- **Go**: standard `gofmt`, no linter config needed
- **TypeScript**: strict mode, Prettier with Tailwind plugin
- **SQL migrations**: numbered sequentially (`000NNN_description.up.sql` + `.down.sql`)
- **i18n**: add keys to `en.json` first, then sync to all 26 locale files

## Adding a Database Migration

```bash
# Create a new migration pair
touch apps/api/internal/migrations/sql/000031_your_change.up.sql
touch apps/api/internal/migrations/sql/000031_your_change.down.sql
```

Migrations run automatically when the API starts.

## Adding i18n Keys

1. Add keys to `apps/web/src/i18n/locales/en.json`
2. Run the sync script to propagate to all locales:

```bash
cd apps/web/src/i18n/locales && node -e "
const fs=require('fs');const en=JSON.parse(fs.readFileSync('en.json','utf8'));
function f(o,p=''){let e=[];for(const[k,v]of Object.entries(o)){const key=p?p+'.'+k:k;if(typeof v==='object'&&v!==null&&!Array.isArray(v))e.push(...f(v,key));else e.push([key,v]);}return e;}
function g(o,p){return p.split('.').reduce((o,k)=>o&&o[k],o);}
function s(o,p,v){const ps=p.split('.');let c=o;for(let i=0;i<ps.length-1;i++){if(!c[ps[i]]||typeof c[ps[i]]!=='object')c[ps[i]]={};c=c[ps[i]];}c[ps[ps.length-1]]=v;}
let t=0;for(const file of fs.readdirSync('.').filter(f=>f.endsWith('.json')&&f!=='en.json')){
const loc=JSON.parse(fs.readFileSync(file,'utf8'));let n=0;for(const[k,v]of f(en)){if(g(loc,k)===undefined){s(loc,k,v);n++;}}
if(n>0){fs.writeFileSync(file,JSON.stringify(loc,null,2)+'\n');t+=n;}}
console.log('Synced '+t+' keys');
"
```

## Reporting Issues

Open an issue on GitHub with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Browser/OS if relevant

## License

PlanA is licensed under [AGPL-3.0](LICENSE). By contributing, you agree that your contributions will be licensed under the same terms.
