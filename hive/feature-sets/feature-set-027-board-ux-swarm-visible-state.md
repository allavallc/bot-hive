# [feature-set-027] Board UX for swarm-visible state

**Status**: active
**Owner**: allavallc

## Goal

The board surfaces "what's happening in the swarm right now" at a glance — what needs human attention vs bot attention, what's blocked, what's testable. Today the in-review column is one undifferentiated bucket and the swarm-health panel surfaces opaque invariant codes with no remediation guidance. Both make the swarm feel like guesswork. This FS hardens the visible-state surface so the human can scan once and know.

## Rationale

Three concrete pain points (all surfaced 2026-05-11):

1. The in-review column shows a human-mascot for every card. There's no visual cue for "tester bot should pick this up" vs "human should approve this." Tickets that are `User-facing: no` (which by design should bypass in-review entirely or be tester-bot-handled) sit unaddressed forever.
2. Tickets in backlog with unfinished `Blocked by:` dependencies render as fully clickable. The bot-side `my-work.sh` filters them, but the UI doesn't — humans see them as available.
3. Swarm-health anomalies render bare codes (`ROLE_PM_CLAIMING_2BOT`, `IN_REVIEW_EVENT_FILE_NOT_MOVED`) with no description and no "what to do." Even the operator has to grep source to know what each means.

Result: the swarm panel's health value ≈ 0 today. Every visible-state surface in the product needs the same hardening: route by intent, sort by priority, grey out what's not actionable, explain what surfaces.

## Tickets

- **HV-112** — route in-review by `User-facing` flag (workflow split: bot-tester for `no`, human for `yes`)
- **HV-113** — in-review UI: group by FS, sort by Priority, grey out blocked-by, switch mascot per `User-facing`
- **HV-114** — cleanup current in-review: sweep stale `User-facing: no` tickets (HV-068, HV-091, HV-094, HV-102) to done/
- **HV-115** — swarm-health UI: per-anomaly description + remediation hint + "file hardening ticket" button
- **HV-116** — bootstrap path for "first bot in main checkout" (vs. worktree-spawned)
- **HV-117** — inbox count badge doesn't auto-adjust on resolve (bug — found in admin-inbox modal)

## Status
Active

## Notes

Filed during a 2-bot test prep session. Goal of this FS is "swarm works for one user (allavallc) end-to-end" — board is legible, anomalies are actionable, in-review is correctly routed. Not multi-agent (that's FS-014); not multi-user (that's FS-003); not customer-facing onboarding (FS-017). Pure swarm-visibility hardening for the operator running their own colony.
