# [feature-set-001] V1 running locally

## Goal
Get a v1 of Bot Hive running on a local dev machine — sign in with GitHub, connect a repo with a `hive/` folder, see a live kanban that updates within ~5s of a commit.

## Rationale
Phase 1 of Bot Hive is the smallest end-to-end slice that proves the product loop: a user → a connected repo → live tickets on a board. Channel adapters, billing, sharing, deletion, and production hosting are all deferred to later phases. Bundling the seven sub-phase tickets (HV-001 through HV-007) under one feature set keeps scope visible and prevents drift into Phase 2 work before the local v1 is actually working.

## Tickets
- HV-001 — Project scaffolding (Next.js + Drizzle + env wiring)
- HV-002 — Database schema + first migration
- HV-003 — Better Auth + GitHub OAuth
- HV-004 — GitHub App registration + Octokit helper
- HV-005 — Project connection flow + initial sync
- HV-006 — Webhook handler + idempotency
- HV-007 — Board page + SSE live updates

## Status
In progress
