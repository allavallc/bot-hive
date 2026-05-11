# ADR-005: "My Bot Team" view-only modal

**Status**: Accepted

**Date**: 2026-05-09

**Authors**: allavallc-cc1 (drafted), allavallc (decided)

---

## Context

The user requested a way to see, at a glance, all bots currently in the swarm and what they're doing — across colonies, not just their own. Today the swarm panel shows event activity but doesn't surface a "team roster" view. As more humans join the project and each spawns a colony, knowing "who has what bot doing what" becomes essential.

## Decision

A **view-only modal**, triggered by a button on the project board, matching the Add-a-Bot UX shape.

### Trigger

A second button on the project board, similar to the existing **+ Add a Bot** button. Likely labeled **My Bot Team** or **Bot Team** (final copy TBD). When clicked, opens a modal.

### Modal content

A table grouped/sorted by colony. Columns:

| Colony | Bot | Role(s) | Doing now | Last active |
|---|---|---|---|---|
| allavallc | `kestrel` | PM, tester | (idle) | 2m ago |
| allavallc | `buzz` | coder | HV-077 (in-progress) | 18s ago |
| tony | `scout` | PM | HV-035 (in-progress) | 1m ago |

- **Colony**: the human's GitHub login (e.g., `allavallc`, `tony`).
- **Bot**: the bot's handle, colored via `robotColor()` for at-a-glance ID.
- **Role(s)**: comma-separated list (e.g., "PM, tester" if the colony has fewer than 3 bots and the PM is still consolidating roles per ADR-002).
- **Doing now**: current in-progress ticket the bot has claimed (e.g., "HV-077 (in-progress)") or "(idle)" if no claim.
- **Last active**: time since the bot's most recent event in `hive/events/<colony>.<handle>.log`.

### Multi-colony scope

The modal shows **all bots from all colonies in the project**, not just the viewer's colony. The whole point is cross-colony visibility — see what Tony's bots are doing, not just yours.

### Refresh behavior

The modal subscribes to the existing project SSE stream (same as the swarm panel). When events fire, the modal re-fetches and updates. No manual refresh button.

## Consequences

**What becomes easier:**

- Cross-colony visibility for free: see who has what bot active, without checking the events log manually.
- Onboarding: a new human joining a project sees "oh, there's already a tester bot in Tony's colony" without having to grok the events log syntax.
- Stale-bot detection: "Last active" column makes dormant bots obvious. Useful for spotting colonies where the human went offline.

**What becomes harder:**

- The modal needs to derive each bot's role from the colony size + role-consolidation rule (ADR-002). Implementation must read each colony's bot count and apply the table.
- "Doing now" requires reading the latest `Assigned to:` ticket frontmatter or a per-bot in-progress lookup. Either a new endpoint that joins this data, or the existing `events` endpoint extended with per-bot snapshot info.
- Currently the project page's API surface returns ticket data. A new endpoint may be needed to return per-colony per-bot summaries.

## Out of scope (v1)

- **Actions**: kill bot, reassign role, change colony focus. Explicitly view-only. Add later if pain becomes real; today it's premature.
- **History**: per-bot work history (e.g., "this bot has shipped 12 tickets this week"). Useful but adds complexity; defer.
- **Filtering**: by colony, role, status. Modal is small; adding filters is overhead at current scale. Add when there are 10+ bots and visibility becomes hard.

## Open questions

- Where exactly does the button live on the project board? Reasonable guesses: top-right, near the masthead, next to or stacked with Add-a-Bot. Final placement is a small visual-approval step before build.
- Does the modal also show the human's status (e.g., a row for the human, not just bots)? Probably no — the panel is for bots; humans are implied by colony grouping. Revisit if useful.
- Should the modal be a separate route (`/projects/[id]/team`) instead of a modal? A modal matches the user's stated phrasing ("a link like + Add a Bot"); going to a separate route adds navigation cost without clear benefit at current scope.
