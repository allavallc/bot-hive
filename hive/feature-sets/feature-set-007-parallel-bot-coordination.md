# [feature-set-007] Parallel-bot coordination

**Status**: active

## Goal
Make Bot Hive safe and effective to develop with multiple bots (and multiple humans) working in parallel — by adopting a swarm coordination model where the git tree is the message bus, bots are independent agents that read and write to it, and coordination emerges from a few simple local rules. CI gates merges so broken code can't reach main; branch protection enforces it.

## Rationale
The whole point of Bot Hive is parallelism. Today the workflow ships every commit straight to `main` — fine for `hive/` ticket-file moves (atomic, ordered by the git push lock), unsafe for source-code work. Two bots editing overlapping source files on `main` corrupts commits and breaks the deploy.

The fix isn't just "branch and PR" (the human dev workflow). The deeper insight is that **git is already a pub/sub system**: pushing = publishing, pulling = subscribing, the directory tree is the topic structure. We don't need a coordinator service, a real-time message broker, or per-bot capability declarations. We need a few conventions on top of git that give us swarm-style coordination — local rules, stigmergic environment, no central authority, failure-tolerant.

This feature set installs:
- The conventions (`focus.md`, DAG-walk with cohesion preference, `events.log`, stigmergic timestamps).
- The branch + PR + CI workflow for source code, keeping `hive/` files main-direct.
- The safety rails (CI, branch protection) that prevent broken code from reaching main even when bots self-merge.

The conventions are **substrate-portable**: today they live on git, tomorrow if scale demands it they migrate to Redis/Postgres without changing how bots think. The mental model is what we're committing to long-term; the storage mechanism evolves.

## Tickets
- HV-031 — Swarm coordination protocol: rules, conventions, conflict policy, doc updates
- HV-032 — GitHub Actions CI on PRs (typecheck + lint + tests + build, with Postgres service)
- HV-033 — Branch protection on `main` + bot self-merge config (doc + checklist for human to apply)
- HV-035 — Permanent staging environment (separate ticket — pending Render Pro free-tier check; HV-034 was claimed by CC2 for the multi-agent testing harness in feature-set-008)
- HV-036 — Bot session identity — unique handles visible on the board (so CC1 vs CC2 are distinguishable)

## Status
Open

## Architecture & decisions

Append-only ADR log for this feature set. Entries are added when non-trivial design choices are made; entries are never edited or deleted. New agents working in FS-007 read this section first to avoid re-litigating settled questions.

### 2026-05-05 — Per-test transactional isolation, not `Date.now()` patches (allavallc-cc1)

**Choice:** Wrap every DB-backed test in a Drizzle transaction; force rollback at end. Tests pass `tx` to production functions via an optional `db: DbHandle` parameter.

**Rejected:** Replacing `Date.now()` with a deterministic counter. Papers over the symptom; doesn't address state leaks between tests, parallelism collisions, or the underlying "test data depends on non-deterministic sources" antipattern.

**Why:** Substrate-portable across Postgres/MySQL/SQLite. Scales identically from 20 to 20,000 tests with no code changes. Industry-standard pattern (Drizzle, Prisma, Sequelize all support this). Eliminates an entire class of "rare flake under high concurrency" issues structurally.

**Implications:** Production functions touching the DB now accept `db: DbHandle = defaultDb`. New `src/lib/test-db.ts` fixture. CLAUDE.md / AGENTS.md add a "Testing rules" section. CI can crank parallelism without inheriting flakiness.

**Reference:** HV-037 / PR #3.

### 2026-05-05 — Canonical protocol in AGENTS.md, not CLAUDE.md (allavallc-cc1)

**Choice:** Move all swarm coordination rules from `CLAUDE.md` to a new `AGENTS.md`. `CLAUDE.md` becomes a thin pointer that says "see AGENTS.md."

**Rejected:** Keeping the canonical content in `CLAUDE.md`. Two failure modes: (a) `CLAUDE.md` is a Claude Code-specific filename — other Claude Code users have their own `CLAUDE.md` and would have it overwritten on pull; (b) other agents (Codex, Cursor, Aider, Gemini) don't read `CLAUDE.md` at all and would miss the protocol entirely.

**Why:** The conventions are agent-neutral; the file they live in must be too. AGENTS.md is an emerging convention some tools auto-load. Future agent shim files (`.cursor/rules`, `.aider.conf.yml`) follow the same pattern: thin pointer at AGENTS.md.

**Implications:** Multi-agent friendly. README.md "Working with bots" leads with AGENTS.md. HIVE.md references updated. Future agent additions = one shim file each.

**Reference:** HV-031 round 2 / PR #10.

### 2026-05-05 — Per-session unique handles, not per-machine (allavallc-cc1)

**Choice:** Bot handles are picked fresh on each session start (random from a curated list, with collision detection against recent commits + in-progress tickets). Held in memory only — no `git config` persistence. `BOT_HIVE_HANDLE` env var overrides for explicit naming.

**Rejected:** `git config bot-hive.handle <name>` per machine (the original HV-036 design). Two sessions on one laptop would read the same value and end up with identical handles — indistinguishable in audit. Defeats the whole purpose.

**Why:** Per-session identity matches how Claude Code (and similar agents) actually run — each session is a new instance with a new context. The right primitive is "session," not "machine." Same machine running two sessions produces two distinct identities, which is the use case humans actually have.

**Implications:** Auto-pick logic with collision check on session start. `git config bot-hive.handle` values are deprecated but harmless (bots ignore them). Audit trail attribution works at the session level.

**Reference:** HV-041 / PR (HV-041 in-review batch).

### 2026-05-05 — All commits via PR + auto-merge (allavallc-cc1)

**Choice:** Every commit — source code, hive/ ticket moves, doc edits, anything — flows through a PR gated by the `ci` status check. `gh pr merge --auto --squash --delete-branch` queues auto-merge.

**Rejected:** "hive/ direct to main, source via PR" (the original HV-031 framing). GitHub branch protection is all-or-nothing on a branch — there's no native way to allow `hive/` direct pushes while blocking source pushes. Either everything goes through PRs or nothing does. The "everything" option is the one that gives us safety guarantees.

**Why:** Uniform enforcement. No source change can ever bypass CI. The cost is ~2 min of CI per hive-only PR (waste, but bounded). Trade-off accepted in exchange for "bots literally cannot ship broken code."

**Implications:** Mental "two-lane" split between coordination metadata and source code stays as a *kind* distinction (CI runs trivially for hive-only PRs), but both ride the same merge mechanism. If CI minutes become a real concern, `paths-ignore` filtering is a follow-up optimization.

**Reference:** HV-033 / PR #11 (FS-007 batch accept).

### 2026-05-05 — Public repo + proprietary LICENSE for branch protection on free tier (allavallc-cc1)

**Choice:** Make the repo public; add an explicit "all rights reserved, no use without consent" LICENSE file. Branch protection is now available on the free GitHub tier.

**Rejected:** GitHub Pro ($4/mo per user) on a private repo. Explicit cost without operational benefit at this stage; the proprietary license achieves the same legal protection.

**Why:** The repo's source is public-visible, but the code is legally protected (LICENSE explicitly forbids any use, copy, modify, or distribute). For a pre-launch product without external collaborators, public-source-with-license is operationally equivalent to private-source. Saves the Pro subscription until there's a real reason for it.

**Implications:** Anyone can read the source on github.com but cannot legally use it. License recognized by GitHub as "Other" (NOASSERTION). README.md license section updated.

**Reference:** HV-033 / commit `4fabdda`.

### 2026-05-05 — Pre-commit pull as the freshness signal (allavallc-cc1)

**Choice:** Bots run `git pull --rebase` immediately before every commit that's about to be pushed. If the rebase is clean, continue and push. If it conflicts, fall back to the conflict-response policy.

**Rejected:** (1) Heartbeat file — adds a file, signals only on commits, no advantage. (2) Webhook → real-time bot bus — requires real-time infrastructure the swarm protocol explicitly rejects. (3) Polled `git fetch` daemon — drifts from "files-and-git only," adds a timer.

**Why:** Same primitive (`git pull`) that already does the subscribe step on session start. One extra round-trip to origin per commit — negligible at our scale. No new files, no daemon, no broker. Substrate-portable: the rule survives any storage migration because git is just the current substrate.

**Implications:** Documented in AGENTS.md and HIVE.md as a "Pre-action pull" rule. Bot session loop changes from "pull once on start" to "pull before every action that touches main or opens a PR."

**Reference:** HV-043 / PR (this PR).

### 2026-05-06 — Doc ownership: agents who add a dependency own the doc update (allavallc-cc1)

**Choice:** Author of the dependency owns the corresponding operator-runbook update. Same PR if feasible; immediate follow-up if not.

**Rejected:** Letting doc updates be a separate "someone will pick this up later" backlog item. Doc drift is the predictable failure mode — every undocumented dependency is a paper cut for the next operator.

**Why:** Captured live during today's session — CC2's HV-046 added a GitHub App permission requirement (`Pull requests: Read & write`) to call the PR-create API. `docs/DEPLOY.md` Step 2 wasn't updated, so the operator hit a "failed to create PR" error with no breadcrumb pointing at the missing permission. Convention is cheap; the absence of it is expensive.

**Implications:** AGENTS.md + HIVE.md gain a new "Owning doc updates when you add an infra dependency" subsection in the swarm protocol. PR reviewers (human or bot) check for doc updates whenever a PR introduces an infra change.

**Reference:** HV-054.

### 2026-05-06 — Rejected work routes back to the original agent first (handle-based) (allavallc-cc1)

**Choice:** Agents pre-check `in-progress/` for tickets matching their own handle with `Rejected by:` populated. Those are picked up before any DAG-walk for new claims.

**Rejected:** Pure DAG-walk only — would let rejected tickets sit indefinitely or trigger context-switching reclaims via the stale-claim watchdog every time.

**Why:** Rejection is "iterate, not abandon." Original agent has the freshest mental model of what they shipped; reclaim by another agent pays a context-switch tax. The rule preserves continuity. CC2 noticed the gap during the first end-to-end rejection test — DAG-walk skipped rejected in-progress tickets as "claimed, not available," so they sat until a stale-reclaim eventually fired.

**Implications:** AGENTS.md "Picking what to claim" gets a pre-DAG-walk step (step 0). HIVE.md "Pre-claim ritual" subsection added before "DAG-walk." Session-start checklist gains a scan step. Stale-claim reclaim still applies for rejected work where the original agent has gone idle (>2h) — the new rule narrows but doesn't replace that safety net.

**Reference:** HV-052.

### 2026-05-05 — Skip Render preview deploys (allavallc-cc1)

**Choice:** Permanent staging environment (HV-035, future) rather than per-PR Render preview deploys.

**Rejected:** Render's per-PR Service Previews. Each preview gets a new `*.onrender.com` URL; OAuth Apps allow exactly one callback URL (lesson L4); so OAuth would be broken on every preview unless we provision per-preview apps. High setup complexity for marginal benefit.

**Why:** Permanent staging (one URL, one OAuth App pair, one DB) is simpler and matches the pattern that works in prod. Free or near-free on Render's Pro plan. PR review gates merge to main; testing happens on staging after merge to a `staging` branch (not yet implemented — HV-035 future).

**Implications:** Until HV-035 lands, prod is the only deploy target. Acceptable pre-launch (zero users); revisit before any real launch.

**Reference:** HV-035 (filed; pending Render free-tier verification).

## Implementation note

This Architecture & decisions section was added retroactively as a worked example for the convention installed in HV-044. From HV-044 onward, decision entries are appended in real time as choices are made. The retroactive entries above are concise summaries — full context lives in their referenced tickets/PRs.
