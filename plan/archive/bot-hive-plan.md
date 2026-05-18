# Bot Hive — Build Plan

A hosted web service that gives small teams a coordination layer for swarms of AI bots working on a shared codebase. Users connect their GitHub repo, bots commit ticket files into the repo, and Bot Hive provides a live multi-tenant board, channel adapters (email, Telegram, Discord), and human approval flows.

The ticket schema and files-in-git approach are documented in `hive/HIVE.md` — that's the canonical reference, owned by Bot Hive and free to evolve.

---

## Tech stack

- **Frontend + backend:** Next.js (TypeScript, App Router)
- **Database:** Postgres (Render managed)
- **Background worker:** separate Node/TypeScript service on Render (not inside Next.js)
- **Auth:** GitHub OAuth only (Auth.js / NextAuth)
- **Billing:** Stripe (Checkout + webhooks)
- **Hosting:** Render (one web service + one background worker + one Postgres)
- **Git access:** GitHub App (preferred) or PAT fallback

Single language, single repo, simple deploy. No microservices, no Kubernetes, no message broker.

---

## What Hive does (functional summary)

A user signs in with GitHub, picks a repo, and Hive starts mirroring that repo's ticket state into a live web board. The user's bots continue to read and write ticket files in the repo using whatever client tooling they prefer. Hive watches the repo (via webhooks), parses the ticket files, and shows the team a live view of what's happening.

Users can also configure channel adapters (email, Telegram, Discord) so they can file tickets, file feature requests, and approve gated bot actions from chat or email instead of editing files. The adapters write into the repo on the user's behalf.

**Hive does not run users' bots.** Users run their own bots. Hive is the coordination layer and the human-facing UI.

---

## Repository conventions Hive reads

Hive reads these files from each connected repo. The user's bots write them; Hive parses and displays them. This is the contract between Hive and any client.

```
hive/
  config.yaml        # capabilities vocabulary, concurrency rules
  autonomy.ts        # gate function (TypeScript) — bot autonomy policy
  humans.yaml        # authorized humans (emails, Telegram usernames, Discord IDs)
  agents/            # one YAML file per bot
  features/          # parent groupings of related tickets
  tickets/
    backlog/
    claimed/
    done/
    in-beta/
    in-staging/
    in-prod/
    failed/
  log/               # append-only JSONL provenance log
  inbox/
    pending/         # incoming items from humans (tickets, approvals)
    processed/       # archive of processed items
```

Ticket files are markdown with frontmatter as documented in `hive/HIVE.md`. The schema is owned by Bot Hive; planned extensions include `feature`, `requires`, `estimated-cost-usd`, `gate`, `touches`, `assignee`, `lease-expires`, `actual-cost-usd`, `completed-at`, `verified-by`.

The state of a ticket is the folder it lives in. Hive parses the directory structure to determine state.

---

## Build phases

This is a four-phase plan. Each phase is shippable on its own. Don't start a later phase until the earlier one works end-to-end.

### Phase 1 — Auth, project connection, read-only board (MVP)

Goal: a user can sign up, connect a GitHub repo, and see a live board of their tickets.

**Auth.**
- GitHub OAuth via Auth.js / NextAuth.
- Session via secure HTTP-only cookies.
- Store user record on first login: GitHub user ID, email, name, avatar URL.

**Project connection.**
- After login, user is taken to a "Connect a project" flow.
- Install Hive's GitHub App on the target repo (preferred path) — gives webhook access and read permissions without storing tokens long-term.
- Fall back to PAT if user can't install apps.
- Store: GitHub repo (owner/name), installation ID or encrypted PAT, the user that connected it, the project's display name.

**Initial sync.**
- On project creation, clone the repo to ephemeral disk.
- Parse `hive/` directory: tickets, features, agents, config, autonomy.ts (just store the source as text — don't execute it on the server).
- Write parsed state to Postgres.
- Mark project as `synced`.

**Webhook handler.**
- Endpoint: `POST /api/github/webhook` — receives push events.
- Verify HMAC signature.
- For each pushed commit affecting `hive/`, re-parse the affected files and update Postgres.
- Idempotent: replaying the same commit should produce the same DB state.

**Board page.**
- URL: `/projects/[projectId]`.
- Auth-gated.
- Renders the project's current state from Postgres (not by parsing on each load).
- Columns for each ticket folder: backlog, claimed, done, in-beta, in-staging, in-prod, failed.
- Each card shows: id, goal, assignee, lease status, cost.
- Features panel shows feature-level progress.
- Auto-refresh via SSE or short-poll every 30s for now (websockets later if needed).

**Project list.**
- URL: `/dashboard`.
- List of user's projects with thumbnails of their boards.
- "Add project" button restarts the connect flow.

**What's NOT in Phase 1:**
- Channel adapters (email, Telegram, Discord)
- Inbox processing
- Billing
- Team members / sharing
- Approving gated actions from the UI

Phase 1 is a pure read-only mirror of the repo. It must work reliably end-to-end before anything else.

---

### Phase 2 — Inbox processing and channel adapters

Goal: humans can file tickets and approve actions from email and Telegram without editing files directly.

**Inbox processor (background worker).**
- Separate Render service: a long-running Node process.
- Polls each connected project's `hive/inbox/pending/` directory every 60s (via the GitHub Contents API, no clone needed).
- For each pending item: validate, assign an HV-ID, write the corresponding ticket/feature/approval file into the right place, move the original to `inbox/processed/`, commit and push.
- All commits are signed by Hive's GitHub App identity.

**Email adapter.**
- Provision a unique inbound address per project: `hv-<projectId>@hivemail.io` (or whatever domain you set up — start with a transactional email service that supports inbound, e.g. Postmark or AWS SES).
- Inbound message → parse subject as goal, body as why, sender as `from` field → write file to `inbox/pending/` in the user's repo via GitHub API.
- Commands in subject/body: `approve HV-042`, `deny HV-042`.
- Authenticate sender against `humans.yaml` in the repo. Reject unknown senders.

**Telegram adapter.**
- The user creates their own Telegram bot via @BotFather, gives Hive the bot token in project settings.
- Hive's worker holds a long-poll connection to that bot.
- When a message arrives in any chat the bot is in, route by chat ID to the project that owns it.
- Commands: `/ticket goal text`, `/feature name text`, `/approve HV-042`, `/deny HV-042`, `/status`.
- Authenticate sender by Telegram username against `humans.yaml`.

**Discord adapter.**
- Same shape as Telegram: user provides their own bot token, Hive listens, routes by guild/channel ID.
- Slash commands instead of message commands.

**Worker architecture.**
- One process holds all Telegram connections (long-poll) for all tenants. Routing is by chat ID → project ID lookup in Postgres.
- One process polls IMAP / receives email webhooks for all tenants.
- One cron-style task runs `inbox process` for all projects every 60s.
- Restart-safe: all state is in Postgres or the user's repo, never in-memory.

**Approval UI in the board.**
- Pending approvals from `inbox/pending/` are surfaced prominently on the board.
- One-click `Approve` / `Deny` buttons that write the corresponding file to the user's repo.

---

### Phase 3 — Billing, plans, free tier limits

Goal: charge teams over the free tier limit. Default plan is free for ≤3 active bots.

**Free tier definition.**
- Up to 3 bots active in the last 30 days. (Active = made at least one commit affecting `hive/` in the window.)
- Up to 1 connected repo.
- Email adapter only.
- 90-day log retention.

**Paid tier (Team — $X/month, decide closer to launch):**
- Unlimited bots.
- Up to 5 connected repos.
- All channel adapters.
- 1-year log retention.

**Stripe integration.**
- Stripe Checkout for upgrades.
- Stripe Customer Portal for plan changes / cancellation.
- Webhook handler for subscription state changes.
- On downgrade or payment failure: warn user, then enforce limits (gracefully — don't delete data, just stop syncing additional bots).

**Bot counting.**
- Periodic job: for each project, count distinct agent IDs that appear in commits affecting `hive/` in the last 30 days. Store as `project.active_bot_count`.
- Display on the dashboard so users always know where they are vs. their plan limit.

**Enforcement at sync time.**
- When parsing a webhook push, if a new agent appears that would put the project over its plan limit, reject the parse for that agent's commits and notify the project owner via email/in-app banner.
- Don't disrupt the existing 3 bots — just refuse to extend the count.

---

### Phase 4 — Polish, sharing, and the long tail

Goal: things that make the product good but aren't required for launch.

- Team members on a project (invite by email; they can view the board and receive notifications but can't change billing).
- Notifications (email digests, Telegram pings on approval requests).
- Better onboarding: example project, sample `hive/` directory the user can copy into their repo.
- Audit log view (read from `log/*.jsonl`).
- Export to JSON / CSV.
- Cross-repo dependency resolution (read referenced repos via GitHub API, not local clones).
- Public read-only board sharing (opt-in, generates a tokenless URL).
- Migration helpers: import a Trello board / GitHub issues into a Hive project.
- Mobile-friendly board layout.

Defer all of this until Phase 1–3 are stable and at least a few users are paying.

---

## Data model (Postgres)

Sketch — finalize during Phase 1 implementation.

```
users
  id, github_id, email, name, avatar_url, created_at

projects
  id, owner_user_id, github_repo, install_id (nullable), pat_encrypted (nullable),
  display_name, plan, active_bot_count, last_synced_at, created_at

project_members
  project_id, user_id, role (owner|member)

tickets
  id (HV-XXX scoped to project), project_id, state (folder name),
  goal, why, feature_id (nullable), assignee, lease_expires_at,
  estimated_cost_usd, actual_cost_usd, gate, requires (string[]),
  touches (string[]), depends_on (string[]),
  raw_frontmatter (jsonb), raw_body (text),
  file_sha, updated_at

features
  id, project_id, goal, why, owner, gate, acceptance (jsonb), updated_at

agents
  id (scoped to project), project_id, capabilities (string[]),
  budget_monthly_usd, last_active_at

inbox_items
  id, project_id, kind (ticket|feature|approval),
  status (pending|processed|rejected),
  raw_content (text), source (email|telegram|discord|file),
  from_identifier, received_at, processed_at, resulting_ticket_id

log_events
  id, project_id, ticket_id (nullable), actor, kind (bot|human),
  action, model, cost_usd, artifacts (jsonb), via, occurred_at

channel_configs
  id, project_id, kind (email|telegram|discord),
  config (jsonb — bot tokens, addresses, etc., encrypted)

subscriptions
  id, project_id, stripe_customer_id, stripe_subscription_id,
  plan, status, current_period_end
```

Encrypt anything sensitive at rest (PATs, bot tokens) using a key from environment config.

---

## Routes (Next.js App Router)

```
/                              landing page
/login                         GitHub OAuth start
/auth/callback                 OAuth callback
/dashboard                     project list
/projects/new                  connect a repo flow
/projects/[id]                 board page
/projects/[id]/settings        project settings (channels, plan, members)
/projects/[id]/inbox           pending approvals, recent items
/billing                       Stripe portal
/api/github/webhook            POST — GitHub push events
/api/stripe/webhook            POST — Stripe subscription events
/api/projects/[id]/sync        POST — manual re-sync trigger
/api/projects/[id]/approve     POST — approve a pending item
/api/projects/[id]/deny        POST — deny a pending item
```

---

## Operational concerns

**Secrets.** GitHub App private key, Stripe keys, OAuth secrets, channel adapter tokens — all in Render's environment variables. Never in git.

**Webhooks.** GitHub webhooks need a publicly accessible URL with a stable hostname. Render gives you that on the web service. Verify HMAC signatures on every request.

**Rate limits.** GitHub API limits are real but generous when using a GitHub App (5000/hour per installation). Use webhooks (push events) instead of polling whenever possible. Cache aggressively — the parsed state in Postgres is the source of truth for the UI; only re-parse on webhook events.

**Background worker resilience.** The worker is a long-running process. Use a process manager (PM2 or just Render's built-in restart on crash). Keep all state in Postgres. Make every job idempotent.

**Logging and monitoring.** Use Render's built-in logging for now. Add Sentry once there are users.

**Backups.** Render Postgres has automated backups on paid tiers — verify they're enabled. The user's git repo is the durable source of truth for tickets; Postgres is a cache.

---

## What this plan deliberately leaves out

- Custom domains per tenant (out of scope for v1).
- SSO / SAML (not until enterprise customers ask).
- A native mobile app (web is responsive, that's enough).
- Hive running users' bots (never — bots run in user environments).
- Self-service plan creation / pricing experiments (set one paid tier, change later if needed).

---

## Definition of done for v1 launch

- A user can sign in with GitHub, connect a repo, and see a live board within 5 minutes of landing on the homepage.
- Tickets reflect repo state within 10 seconds of a push.
- Free tier works; paid tier upgrades work; downgrade gracefully enforces limits.
- Email and Telegram adapters work end-to-end for at least one project.
- The service has been running for a week without intervention.

Don't add anything else to v1 scope without an explicit reason.
