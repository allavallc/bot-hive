# ADR-003: Colony model for multi-human swarm coordination

**Status**: Accepted

**Date**: 2026-05-09

**Authors**: allavallc-cc1 (drafted), allavallc (decided)

**Supersedes**: ADR-001

---

## Context

Bot Hive supports multiple humans collaborating on a single GitHub repo. Each human spawns bots locally on their own machine. Without an explicit coordination model, multi-human use of the platform creates several conflicts:

- **PM authority**: who writes tickets, who edits `focus.md`?
- **Priority drift**: humans want different focuses; the global `focus.md` is a single value.
- **Cross-bot collisions**: two humans' coder bots can claim from the same FS, work in parallel, and step on each other.
- **Bot identity attribution**: today's `<handle>` namespace is global, so Tony's `buzz` collides with the user's `buzz`.

ADR-001 considered four options (one shared PM, two PMs, no PM, server-side PM). All had structural drawbacks. The user proposed a fifth option — **colonies** — that addresses all four conflicts cleanly.

## Decision

**Each human has their own bot colony.** A colony is the set of bots one human has spawned. Bots are scoped to their colony; colonies are scoped per project.

Operational mechanics:

### 1. Colony identity = human's GitHub login

A colony is identified by the human's GitHub login (e.g., `allavallc`, `tony`). This is stable, already known via Better Auth's session, human-readable, and globally unique. No new identifier.

### 2. Per-colony folder layout

Each colony has its own folder in the repo:

```
hive/
  colonies/
    allavallc/
      focus.md
    tony/
      focus.md
```

`hive/colonies/<github-login>/focus.md` is the colony's focus signal. **There is no global `hive/focus.md`** — it's removed.

### 3. Bot identity = `<colony>.<handle>`

A bot's full identifier is `<colony>.<handle>`, e.g., `allavallc.buzz` or `tony.scout`. This appears in:

- Events log filenames: `hive/events/allavallc.buzz.log`
- Notes channel attribution
- Live board displays
- `Assigned to:` ticket frontmatter (when a bot claims)

Tony's bot named `buzz` and the user's bot named `buzz` no longer collide — they're `tony.buzz` and `allavallc.buzz`.

### 4. Bot identity stored in worktree, not env var

Each bot's worktree contains a `.bot-hive-identity` file:

```
colony=allavallc
handle=buzz
```

Bot CLI scripts read this file on session start. Replaces the previous `BOT_HIVE_HANDLE` env var pattern. Why a file: persistent across shell restarts, tied to the worktree (where the bot lives), no per-shell setup friction.

The Add-a-bot spawn flow writes this file as part of `git worktree add` setup. The modal's "Step 2: set env var + run claude" simplifies to just "run claude" — the file is already there.

### 5. FS claim cascade

A bot can claim a ticket only if:

- The ticket's `Feature set:` field points to an FS file whose `Owner:` matches the bot's colony, **OR**
- The ticket has no `Feature set:` field (free-for-all)

In other words: claim the FS first, then bots in that colony can claim its tickets. Tickets without an FS are pickable by any bot.

The `Owner:` field on FS files (per HV-093) is repurposed: instead of a single bot handle, it now holds a **colony name** (= human's GitHub login). Existing FS-007 (`Owner: allavallc-cc1`) gets migrated to `Owner: allavallc`.

A colony **can hold multiple FSs simultaneously**. Once a colony holds an FS, all its bots (PM, coders, tester) are focused on it.

### 6. Dormancy releases FS lock

If a colony's bots are all stale (no event activity within the past 48 hours), the colony is treated as dormant. Its claimed FSs are implicitly released and become claimable by other colonies.

48 hours, not 2 hours: FS ownership is heavier-weight than individual ticket claims. The 2h stale-claim threshold from HV-089 still applies to per-ticket reclaim within a colony; the 48h threshold is the colony-level fallback.

### 7. Notes channel: always qualified

Notes targeting a specific bot or PM are always qualified as `@<colony>.<handle>`. Examples:

- `@allavallc.kestrel` — addressing user's PM
- `@tony.scout-pm` — addressing Tony's PM
- `@swarm` — broadcast to all colonies

There is no "default to own colony" rule. Always explicit. Removes ambiguity.

## Consequences

**What becomes easier:**

- Two humans can work on different FSs in parallel without focus-file fights.
- Bot identity is unambiguous across colonies.
- Spawning a bot writes the identity file in its worktree once; bots survive shell restarts cleanly.
- `Owner` field semantics scale beyond single-bot ownership.
- Dormancy detection is consistent (matches existing stale-claim convention, just at FS scale).

**What becomes harder:**

- Migration: existing `Owner` values that hold bot handles (e.g., `allavallc-cc1` on FS-007) need to be flipped to colony names.
- A bot's spawn flow is now responsible for writing `.bot-hive-identity`. The Add-a-bot UI generates the file content as part of Step 1.
- `BOT_HIVE_HANDLE` env var convention is deprecated. Existing scripts (`my-work.{sh,ps1}`, `claim.{sh,ps1}`, `note.{sh,ps1}`) need to read the identity file instead.
- The notes-routing convention (`@<colony>.<handle>`) is more verbose than `@<handle>`. Acceptable cost.

**What stays the same:**

- Ticket files, events logs, and the swarm panel are still global within a project (one shared backlog).
- The platform-vs-GitHub split (per `feedback_platform_for_comm_github_for_code.md`) is unchanged.
- Existing protocol elements (per-actor event logs, notes channel via DB, accept/reject flow, role consolidation per ADR-002) all remain.

## Migration notes (implementation TBD)

1. FS file Owner field: `Owner: allavallc-cc1` → `Owner: allavallc`. One-time edit on FS-007 and any others.
2. Spawn flow updates: write `.bot-hive-identity` instead of (or in addition to) setting `BOT_HIVE_HANDLE` env var.
3. Bot CLI scripts: read identity file on startup; fall back to env var only as a transitional measure if needed.
4. Add-a-bot modal: drop the env-var Step 2 once identity-file path is live.
5. New API endpoint or Git-direct write for editing per-colony focus files; otherwise the human edits `hive/colonies/<login>/focus.md` via the GitHub web UI.

## Open questions deferred to future ADRs

- Per-colony visibility features on the panel (side-by-side colonies, ticket attribution badges, duplicate-flag detection) — useful when two humans are actually using the system; defer until then.
- Server-side PM bot (ADR-001 Option D) — defer until product scale justifies the infrastructure.

## What this ADR does NOT decide

- The PM-suggestion-inbox flow (always-ask flag, Approve/Reject UX). See ADR-004.
- The "My Bot Team" view-only modal. See ADR-005.
