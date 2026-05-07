# [feature-set-010] User Board Engagement

**Status**: active
**Owner**:

## Goal
Make the live board genuinely usable for daily ticket work — not just an at-a-glance view. Reduce friction between "I want to read this ticket" and "I'm reading it"; make ticket interactions feel like a modern kanban (Trello / Linear / GitHub Projects), not a static list.

## Rationale
Bot Hive's board today is read-only and mostly designed for scan-at-a-distance: tile cards, clean badges, walking-robot mascots. But the moment a user wants to actually *engage* with a ticket — read the goal, check the done-when, see the resolution — the UX falls apart. The current "click to expand inline" forces the user to scroll past a long body to see anything else in the column, breaking the scan model and making multi-ticket review painful.

This feature set is the layer that turns the board from a status display into a working surface. Tickets are the unit of work; the way users interact with them defines whether the board is a tool or a poster.

## Tickets
- HV-039 — Ticket cards open in a right-side slide-out panel (done)
- HV-045 — Board card arrival animations on SSE refresh (done)
- HV-046 — Human rejection/acceptance flow via board UI (in-progress)

(Future tickets in this FS will be planned as the engagement gaps surface — drag-to-reorder, inline status moves, comments, ticket-edit flow, etc. Don't pre-plan; let usage drive scope.)

## Status
In progress

## Architecture & decisions

### 2026-05-05 — Right-side slide-out panel instead of center modal (tern)

**Choice:** Fixed-position `<section>` panel sliding in from the right (`transform: translateX`) instead of a `<dialog showModal()>` overlay.

**Rejected:** Native `<dialog>` with a semi-transparent backdrop. Initial implementation was built with `<dialog>` — rejected by human because the backdrop grayed out the board, blocking the user from scanning other columns while reading a ticket.

**Why:** The board is a spatial display. Covering it with a backdrop defeats the purpose — users want to read a ticket *while* still orienting in the board layout. A right-side panel shares the screen, coexists with the board, and dismisses without disorientation.

**Implications:** No focus trap (board stays interactive), no scroll lock, Escape closes via `document.addEventListener`. The `visibility` delay trick removes the closed panel from tab order without breaking the slide animation.

**Reference:** HV-039 / PR #28

### 2026-05-05 — Reject-via-PR instead of reject-via-direct-DB-edit (tern)

**Choice:** Human rejection flows through a GitHub PR: board UI POSTs to an API route that moves the ticket file on GitHub (via Git Trees API), appends to events.log, creates a branch + PR, and enables auto-merge.

**Rejected:** (a) Direct DB update + file write to disk — breaks the git-as-source-of-truth invariant; the webhook sync would overwrite it. (b) Chat-only rejection with a bot committing on behalf of the human — adds a human-to-bot handoff step and loses audit clarity (who actually rejected?).

**Why:** git is the source of truth. All ticket state lives in `hive/` files committed to the repo. Bypassing git means the next webhook push overwrites the rejection. The PR path also gives a clean audit trail with the human's GitHub identity as the commit author, not a bot handle.

**Implications:** Accept/Reject actions are async (PR must merge for DB to reflect the change). The board will update via the existing SSE/webhook flow after the PR merges (~2 min). UI shows "PR #N queued for merge" — user doesn't need to wait.

**Reference:** HV-046 / PR (pending)
