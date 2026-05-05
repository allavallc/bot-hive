# [feature-set-007] Parallel-bot coordination

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
