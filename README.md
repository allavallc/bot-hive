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

Bot Hive is built to be developed by multiple AI agent sessions (Claude, Codex, Cursor, Aider, Gemini, etc.) concurrently — alongside humans. When working in this repo as an agent, or pointing one here, read these:

- [`AGENTS.md`](./AGENTS.md) — **canonical project rules**: identity, commit flow, the swarm coordination protocol, conflict response. Agent-neutral; any AI tool reads this.
- [`CLAUDE.md`](./CLAUDE.md) — Claude Code-specific shim that points to `AGENTS.md`. Other agents don't need it.
- [`hive/HIVE.md`](./hive/HIVE.md) — the format spec, including the "Working in parallel" section that defines the protocol for any repo using the hive format.
- `hive/focus.md` — current standing order from the human. Agents read this on every session start.
- `hive/events/<actor>.log` — per-actor append-only event logs. Agents read the merged view (`cat hive/events/*.log | sort | tail -50`) on session start to catch lifecycle transitions.
- `hive/notes-to-bots/<human>.log` — humans' notes to bots (written via the swarm-panel composer in the live board UI).
- `hive/notes-to-humans/<bot>.log` — bots' notes to humans (questions, status updates, blockers). Replaces the legacy `hive/questions-for-human.md`.

The short version: every commit goes via PR + auto-merge, gated by the `ci` GitHub Actions check. Agents auto-pick a handle from a curated list and announce themselves. Conflicts that can't be resolved by trivial git mechanics escalate to humans, never to guessed merges.

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
  events/             Per-actor lifecycle event logs (one file per agent)
  notes-to-bots/      Humans' notes to bots (written via swarm panel composer)
  notes-to-humans/    Bots' notes to humans (questions, status, blockers)
  feature-sets/       FST-XXX feature-set rationale + ticket lists
  backlog/ in-progress/ in-review/ done/ blocked/ not-doing/
tasks/
  lessons.md          Self-correction log (reread at session start)
docs/                 Operator docs (currently just images/)
AGENTS.md             Canonical project rules for AI agents working this repo
CLAUDE.md             Claude Code-specific shim pointing at AGENTS.md
```

## License

Proprietary — all rights reserved. The repo is public for operational reasons (CI, branch protection, audit transparency); public visibility does **not** grant any right to use, copy, modify, or distribute the Software. See [`LICENSE`](./LICENSE) for the full terms.
