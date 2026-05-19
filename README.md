# Bot Hive

Bot Hive helps a single developer or small team run a hive of AI bots against their own software repo.

It has two parts:
- the Bot Hive web app, which shows the board, bot team, notes, and live status
- local bot sessions, which run on the user's machine and work inside the user's repo

Live app: https://bot-hive-j0ax.onrender.com

## Who this is for

Primary user:
- you have a software repo of your own
- you want one or more AI agent sessions working on that repo
- you want a web UI to see and direct that work

This README is now organized around two audiences:
- Bot Hive users: people using Bot Hive with their own repo
- Bot Hive maintainers: people developing the Bot Hive product itself

## For Bot Hive users

### The user mental model

From a user's point of view, Bot Hive is not the `bot-hive` repo.

It is:
1. a web app connected to the user's repo
2. a local bot runtime that starts one or more agent sessions in that repo
3. a `hive/` workspace in that repo for project coordination

The intended happy path is:
1. Sign into the Bot Hive web app.
2. Connect or install Bot Hive on your repo.
3. Initialize your repo for Bot Hive.
4. Start one local bot from your repo.
5. Add more bots if you want more throughput.
6. Use the web app to watch and direct the swarm.

### What belongs in a user's repo

A user's repo should primarily contain project coordination state, such as:
- `hive/backlog/`
- `hive/in-progress/`
- `hive/in-review/`
- `hive/done/`
- `hive/blocked/`
- `hive/not-doing/`
- `hive/feature-sets/` when feature sets are used

Longer-term product direction:
- the repo should hold hive work
- Bot Hive itself should hold default bot behavior
- repo-level runtime overrides should be optional, not required

See `docs/2026-05-19-user-setup-and-runtime-boundary.md` for the design note behind this boundary.

### Important note about the current implementation

Today, Bot Hive is still partly coupled to repo-resident runtime files. In this codebase:
- role assignment defaults are derived from `hive/roles.md`
- handle assignment currently reads `hive/handles.txt`
- startup flows reference repo-local skill files under `hive/skills/`

That is the current implementation, but not the intended long-term product boundary for normal users.

## For Bot Hive maintainers

If you are developing the Bot Hive product itself, this repo is both:
- the application source code
- the operational example, because Bot Hive uses its own `hive/` workflow on itself

### Repo layout

```text
src/                  Next.js app source
src/db/               Drizzle schema + tests
src/lib/              Auth, GitHub, sync, bot runtime, SSE, helpers
src/components/       Reusable UI primitives
src/app/              App Router routes
drizzle/              Generated SQL migrations + meta snapshots
hive/                 Bot Hive's own development tickets and workflow docs
docs/                 Design, deploy, and architecture docs
scripts/              Startup, stream, role-check, and workflow helpers
AGENTS.md             Canonical project rules for AI agents in this repo
CLAUDE.md             Claude Code shim pointing at AGENTS.md
```

### Local development

```bash
# 1. Install dependencies
npm install

# 2. Configure env
cp .env.example .env
# Fill in:
# - DATABASE_URL
# - BETTER_AUTH_SECRET
# - GITHUB_CLIENT_ID
# - GITHUB_CLIENT_SECRET
# - GITHUB_APP_ID
# - GITHUB_APP_PRIVATE_KEY_PATH
# - GITHUB_APP_WEBHOOK_SECRET

# 3. Migrate the local DB
npm run db:migrate

# 4. Start the app
npm run dev
```

Optional:
- `npm run smee` to tunnel GitHub webhooks to localhost during development

### Test, lint, typecheck, build

```bash
npm run typecheck
npm run lint
npm run format
npm run test
npm run build
```

### Maintainer workflow docs

If you are working in this repo as a human or agent, read:
- `AGENTS.md` — canonical workflow rules for this repo
- `hive/HIVE.md` — file-based hive workflow spec
- `hive/bot-startup.md` — startup procedure
- `hive/bot-shutdown.md` — shutdown procedure
- `hive/seats.md` — seat assignment and liveness design
- `hive/roles.md` — role consolidation and role rubric pointers
- `docs/architecture.md` — architecture overview
- `docs/DEPLOY.md` — deploy/runbook details

## What Bot Hive does

- Reads tickets from a repo's `hive/` workspace
- Renders them as a live kanban board
- Syncs updates from GitHub into the app
- Shows active bots, roles, and notes in real time
- Lets one developer or a small team coordinate a bot swarm against one repo

## Current stack

Next.js 15 (App Router) · React 19 · TypeScript 5.6 · Drizzle ORM + Postgres · Better Auth (GitHub OAuth) · `@octokit/app` · Vitest · Biome

## Production deploy

The app deploys to Render via `render.yaml`.

Provisioning needs separate prod GitHub OAuth App and prod GitHub App registrations because callback URLs are single-value fields.

For deploy details, see `docs/DEPLOY.md`.

## License

Proprietary — all rights reserved. The repo is public for operational reasons (CI, branch protection, audit transparency); public visibility does not grant any right to use, copy, modify, or distribute the software. See `LICENSE` for the full terms.
