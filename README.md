# Bot Hive

A live kanban board over GitHub-hosted ticket files. Sign in with GitHub, install the Bot Hive app on a repo containing a `hive/` folder, and watch markdown tickets render as cards on a board that updates within seconds of every commit.

**Live**: <https://bot-hive-j0ax.onrender.com>

## What it does

- Reads tickets from your repo's `hive/backlog/`, `in-progress/`, `in-review/`, `done/`, `blocked/`, `not-doing/` folders
- Renders them as a kanban with priority, effort, feature-set, and assignee badges
- Re-syncs on every push to your repo via GitHub webhooks; open boards refresh in real time via SSE
- Multi-user: any GitHub collaborator on your connected repo can sign in and see the same board (no invite step — GitHub permissions are the source of truth)

The ticket file format and dev workflow live in `hive/HIVE.md`.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript 5.6 · Drizzle ORM + Postgres · Better Auth (GitHub OAuth) · `@octokit/app` for GitHub Apps · CSS Modules · Vitest · Biome.

## Local dev

```bash
# 1. Install
npm install

# 2. Configure env
cp .env.example .env
#    Fill in: DATABASE_URL, BETTER_AUTH_SECRET, GITHUB_CLIENT_ID/SECRET (OAuth App),
#             GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY_PATH, GITHUB_APP_WEBHOOK_SECRET
#    See HV-003 + HV-004 for how to register the GitHub OAuth App + GitHub App.

# 3. Migrate the local DB
npm run db:migrate

# 4. Run
npm run dev
```

Optional: `npm run smee` to tunnel GitHub webhooks to localhost during dev.

## Test / lint / typecheck

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # biome check
npm run format      # biome format --write
npm run test        # vitest run
npm run build       # next build (verify prod build compiles)
```

## Production deploy

The app deploys to Render via `render.yaml` (Blueprint). Provisioning involves a separate prod GitHub OAuth App and prod GitHub App because their callback URLs are single-value fields (multi-environment = separate apps).

Step-by-step deploy runbook: see HV-029 (in `hive/backlog/`) for the planned operator doc. Until that's written, follow the resolution notes in `hive/done/HV-022/023/024/027`.

## Working with bots

Bot Hive is built to be developed by multiple Claude (or other AI agent) sessions concurrently. When working in this repo as a bot — or pointing one here — read these:

- `CLAUDE.md` — project rules: identity, the source/main commit lanes, the swarm coordination protocol, conflict response.
- `hive/HIVE.md` — the format spec, including the "Working in parallel" section that defines the protocol for any repo using the hive format.
- `hive/focus.md` — current standing order from the human. Bots read this on every session start.
- `hive/events.log` — append-only event log. Bots tail it to see recent ticket-state transitions.
- `hive/questions-for-human.md` — bots append blocking questions here rather than spamming chat.

The short version: source code goes on a feature branch + PR + CI; `hive/` coordination files commit straight to main; bots auto-pick a handle from a curated list and announce themselves; conflicts that can't be resolved by trivial git mechanics escalate to humans, never to guessed merges.

## Repository layout

```
src/                  Next.js app source
src/db/               Drizzle schema + tests
src/lib/              Auth, GitHub, sync, broadcast, access (derived membership), test-db (transactional fixture)
src/components/       Reusable UI primitives (PageShell, Wordmark, etc.)
src/app/              App Router routes
drizzle/              Generated SQL migrations + meta snapshots
hive/                 Bot Hive's own dev tickets (dogfoods the format)
  HIVE.md             Workflow doc — ticket format, lifecycle, conventions
  focus.md            Standing order from the human (one line)
  events.log          Append-only swarm event log
  questions-for-human.md  Async escalation channel
  feature-sets/       FST-XXX feature-set rationale + ticket lists
  backlog/ in-progress/ in-review/ done/ blocked/ not-doing/
tasks/
  lessons.md          Self-correction log (reread at session start)
docs/                 Operator docs (currently just images/)
CLAUDE.md             Project-specific rules for AI agents working this repo
```

## License

Proprietary. © allavallc. All rights reserved.
