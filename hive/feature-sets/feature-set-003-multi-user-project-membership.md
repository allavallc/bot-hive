# [feature-set-003] Multi-user project membership

**Status**: active

## Goal
Let multiple users share a project's live board so any GitHub collaborator on a connected repo can sign in and watch the same kanban update in real time, without an explicit invite step.

## Rationale
GitHub already gates who can read a repo. Bot Hive doesn't need its own membership concept on top — it can derive access by asking GitHub via the user's OAuth token. One project row per `(installId, githubRepo)`, accessed by every GitHub collaborator on that repo, with a single `billingOwnerId` field naming who pays. No invites, no roles beyond owner-vs-collaborator, no org modelling — GitHub is the source of truth.

## Tickets
- HV-016 — Better Auth GitHub OAuth: request `repo` scope
- HV-017 — Schema: rename `ownerId` → `billingOwnerId`, drop from unique key
- HV-018 — `src/lib/access.ts`: `listUserRepos` + `userHasRepoAccess` with 5-min LRU cache
- HV-019 — Wire access helper into all auth-check sites + dashboard auto-discovery
- HV-020 — Billing-seat transfer (UI + endpoint)

## Status
In progress
