# [feature-set-024] FS claim cascade enforcement

**Status**: active
**Owner**: allavallc

## Goal
Enforce the FS claim cascade rule (ADR-003) at every claim point and surface violations in monitoring. A bot can claim a ticket only if (a) the ticket has no Feature set field, or (b) the ticket's FS has no `Owner:` field, or (c) the ticket's FS `Owner:` equals the bot's colony. Cross-colony invariants in monitoring catch any divergence.

## Rationale
The claim scripts (`claim.sh`, `claim.ps1`) already do this check after build 2. But the rule needs full coverage: the panel-side claim path (if any), the cron-side stale-claim recovery, the API endpoints. And the monitoring side needs cross-colony invariants that prove no FS ever ends up with two colonies' bots working it simultaneously, plus the cross-colony notes-routing checks that prove `@<other-colony>.<bot>` mentions get matched on the receiver's session start.

## Tickets (skeletons)
- HV-XXX: Audit every code path that mutates `Assigned to` or moves a ticket from `backlog/` → `in-progress/`. Confirm cascade check is applied. Specifically: claim scripts, panel claim button (if reintroduced), webhook handlers.
- HV-XXX: Add cross-colony health invariants (ship as part of FS-022 panel section):
  - No two distinct colonies have `Assigned to: <colony>.<handle>` on tickets sharing the same `Feature set` value (severity: critical)
  - For every cross-colony note (`@<other-colony>.<bot>` in `hive/notes-to-bots/<colony>.<sender>.log`), confirm the receiver's `my-work` would surface it (sample-check by running the matcher logic against recent notes)
- HV-XXX: Stale FS recovery — cron task that releases an FS `Owner:` field if no events from that colony have occurred in 48h (the dormancy threshold from ADR-003).
- HV-XXX: Test fixture — file a tiny dummy FS (FS-DUMMY-001) with `Owner: tony` (a fake second colony), then have buzz attempt to claim a ticket in it. Confirm refusal with the "owned by colony tony" error message. Cleanup after.

## Done when (rung-3 dependency, cross-colony)
- [ ] All claim paths enforce the cascade rule (audit complete, anything missing is fixed)
- [ ] Cross-colony invariants from FS-022 panel fire correctly (verified by intentional violation)
- [ ] 48h dormancy cron releases stale FS owners
- [ ] **Local test**: simulate a second colony by manually editing `.bot-hive-identity` in a second worktree (or using a test fixture). Confirm the second colony cannot claim from `allavallc`'s claimed FSs but can from unowned/own FSs.

## Out of scope (this FS)
- Multi-colony spawning UI in the Add-a-Bot modal (the modal sets colony from `session.user.name`; multi-colony testing is fine via worktree manipulation for now)
- Cross-colony Suggestions inbox (separate FS-025)

## Test rung this unlocks
Rung 3 (cross-colony, 2 colonies). Doesn't depend on rung 2 — can ship in parallel with FS-023 if needed.
