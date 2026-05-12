# Architecture

The stack and conventions of the Bot Hive web application. Read this before designing new features so substrate references in specs are correct from the start.

## Stack

| Layer | Tech | Version (from `package.json`) |
|---|---|---|
| Framework | Next.js | ^15.0.0 |
| UI | React + React DOM | ^19.0.0 |
| Language | TypeScript | ^5.6.0 |
| Database | Postgres | 16 (Render managed, `basic-256mb`) |
| DB driver | `postgres` (postgres-js) | ^3.4.4 |
| ORM | Drizzle ORM | ^0.36.0 |
| Migrations | drizzle-kit | ^0.28.0 |
| Auth | better-auth | ^1.6.9 |
| GitHub integration | `@octokit/app`, `@octokit/core` | ^16.1.2, ^7.0.6 |
| Email | nodemailer | ^8.0.7 |
| Local webhook proxy | smee-client | ^5.0.0 |
| Tests | Vitest | ^4.1.5 |
| Lint + format | Biome | ^1.9.4 |
| Types (Node) | @types/node | ^22.0.0 |
| Package manager | npm (lockfile: `package-lock.json`) | — |

There is no separate backend service. The Next.js app is the entire server. API endpoints are App Router Route Handlers under `src/app/api/`.

## Deployment

Defined in `render.yaml`:

- **Web service**: Render Free plan, Node runtime, oregon region, auto-deploys from `main`.
- **Build**: `npm ci && npm run build`
- **Start**: `npm run db:migrate && npm run start` — migrations run on every deploy.
- **Database**: Render managed Postgres, `basic-256mb`, oregon, Postgres 16.
- **Health check path**: `/login`
- **Production URL**: `https://bot-hive-j0ax.onrender.com`

Render injects `DATABASE_URL` automatically. All other secrets (`BETTER_AUTH_SECRET`, GitHub OAuth + App credentials, SMTP creds) are configured in the Render dashboard.

## Directory layout

```
src/
  app/
    api/<route>/route.ts        — Next.js Route Handlers (the "backend")
    <page>/page.tsx             — server-rendered pages
    <page>/*.client.tsx         — client components (convention: .client.tsx suffix)
  db/
    schema.ts                   — Drizzle pgTable definitions (single file)
    index.ts                    — exports `db` + `DbHandle` (db or transaction)
  lib/
    auth.ts, auth-client.ts     — better-auth setup
    broadcast.ts                — in-process pub/sub for SSE
    github.ts                   — Octokit App + installation helpers
    projects.ts                 — project access guards
    parse.ts                    — hive/ file parsers
    test-db.ts                  — per-test transactional rollback fixture
drizzle/
  *.sql                         — generated migrations (drizzle-kit)
  meta/                         — drizzle-kit's journal
hive/                           — coordination metadata; NOT product code
worktrees/                      — bot worktrees (Biome ignores)
scripts/                        — bash + PowerShell scripts the bots run locally
docs/                           — operator + architecture docs
infra/                          — deployment configuration
plan/                           — in-flight design docs
tasks/                          — agent task state (lessons.md, todo.md)
skills/                         — skill files referenced by agents
```

Path alias: `@/` → `src/`.

## Key conventions

### Route Handlers
Every API endpoint is a file at `src/app/api/<segments>/route.ts` exporting `GET`, `POST`, etc. Most include `export const dynamic = "force-dynamic"` to opt out of caching.

### Auth on routes
Most routes call `auth.api.getSession({ headers: await headers() })` and reject 401 if absent. Project-scoped routes additionally call `getProjectForUser(userId, projectId)` and reject 404 if the user can't access the project.

### Database access
- Production code: `import { db } from "@/db"`. Drizzle's typed query builder.
- Functions that touch the DB take an optional `db: DbHandle` so tests can pass a transaction. `DbHandle = typeof db | PgTransaction<...>`.
- Tests: `import { test } from "@/lib/test-db"`. Provides a `tx` fixture; writes inside the test are rolled back automatically.

### Migrations
- Author the schema change in `src/db/schema.ts`.
- Run `npm run db:generate` — drizzle-kit emits a new `drizzle/NNNN_<slug>.sql` migration.
- Commit both `schema.ts` and the generated SQL.
- On deploy, Render's start command runs `npm run db:migrate` which applies any unapplied migrations.

### Tests
- Vitest, Node environment, `setupFiles: ["dotenv/config"]`, 10s test timeout.
- DB-backed tests use the transactional rollback fixture in `src/lib/test-db.ts`.
- Run: `npm run test`.

### Lint + format
Biome handles both. Run `npm run lint`. Conventions enforced: 2-space indent, 100-char line width, double quotes, semicolons, trailing commas everywhere.

### Real-time updates
Server uses an **in-process pub/sub** in `src/lib/broadcast.ts` — a `Map<projectId, Set<Subscriber>>`. Clients connect to `GET /api/projects/[id]/stream` (SSE), which registers a subscriber for that project. Existing event types: `project-changed` (webhook-driven refresh signal) and `ticket-action` (optimistic UI update on Accept/Reject).

**Constraint**: the pub/sub is in-process — events do not propagate across multiple server instances. Render Free is single-instance, so this is fine today. If we scale horizontally, broadcast will need a Redis pub/sub (or equivalent) substrate.

### Cron / scheduled work
Next.js has no in-process scheduler. The pattern in use (`src/app/api/health/cron/route.ts`):

1. The scheduled work is a `POST /api/.../cron` route protected by `Bearer <SECRET>` auth (secret stored in Render env vars).
2. An external scheduler pings the endpoint on a cadence. Today this is documented as "Render cron job" but the actual scheduler is not wired up via `render.yaml` — confirm before adding new cron-style features.

### Client components
Files named `*.client.tsx` carry `"use client"` and run in the browser. Server components are the default; only mark client when the file uses state, effects, or browser APIs.

### GitHub integration
- `@octokit/app` for GitHub App installation tokens (used by `installationOctokit()` in `src/lib/github.ts`).
- `@octokit/core` for direct REST calls.
- Local webhook reception goes through smee-client (`scripts/smee.mjs`); production webhooks hit `/api/github/webhook` directly.
- Two distinct GitHub credentials are configured per environment: an OAuth App (sign-in flow) and a GitHub App (repo access). See render.yaml `GITHUB_CLIENT_ID/SECRET` (OAuth) vs `GITHUB_APP_ID/PRIVATE_KEY/WEBHOOK_SECRET` (App).

### Hive files
`hive/` is coordination metadata. Tickets, feature sets, event logs, notes. Files are read by both server code (`src/lib/parse.ts`) and by bots running locally. One-way dependency: server reads hive/; hive/ files never reference server code paths. See `hive/HIVE.md` for the format spec.

## Things to verify before assuming

The following are not pinned anywhere in this codebase. Confirm before designing against them:

- **Node version** — no `engines` field in `package.json`. Render's default Node version applies on prod; local dev follows whatever the developer has installed.
- **Number of running server instances** — Render Free is single-instance today, which makes in-process pub/sub viable. A future scale-out invalidates that assumption.
- **External cron schedulers** — the `/api/health/cron` endpoint exists and is documented as cron-fed, but the actual scheduler (Render cron, GitHub Actions cron, or other) is not declared in `render.yaml`. Check Render dashboard before relying on existing cron infra.
- **Lock substrate for serialized DB writes** — no advisory-lock helper exists in `src/lib/`. Adding one is fine but counts as net-new infra.

When a spec references infrastructure that isn't on this list, treat it as a new thing the spec is proposing — not as an existing primitive.
