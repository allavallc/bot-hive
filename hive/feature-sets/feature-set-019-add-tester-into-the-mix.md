# [feature-set-019] Add Tester into the mix

**Status**: active
**Owner**:

## Goal
Introduce a constrained code-review role into the swarm. A `tester` bot reviews work shipped by `coder` bots before the human sees it — running tests, checking the work against the ticket's "Done when," catching obvious bugs. Approves by default; rejects only with a single specific reason tied to the ticket. After two rejections on the same ticket, the loop escalates to the human via the notes channel.

The tester is a guardrail, not a code-quality bureaucracy. It exists to prevent obviously-broken or off-spec work from reaching the human's review queue, not to nitpick style or redesign decisions.

## Rationale
Today every PR lands in the human's `in-review/` queue regardless of whether it actually meets the ticket's spec. Catching off-spec work means the human is the first reviewer, which is the wrong shape — humans are slower and more expensive than another bot. A tester role with a tight rubric does the obvious-checks pass; the human reviews what the tester approves.

Done well: the tester catches 60-80% of "this doesn't match the ticket" cases, the human sees a higher-quality stream, fewer reject cycles overall.

Done badly: the tester nitpicks, rejects fine code with "could be cleaner," coder loops indefinitely, system is worse than no tester. The constraint in the rubric is what prevents this.

## Tickets (skeletons — not yet broken into work)
- HV-XXX: `hive/skills/tester.md` — the rubric (3-5 specific checks, "approve unless clear miss," "do not redesign," output format)
- HV-XXX: tester role detection — bots check if their handle has Owner: <self> on FS-019 or other "tester-owned" FSs; if so, they DAG-walk for `in-review` tickets, not `backlog`
- HV-XXX: 2-rejection escalation — reject endpoint counts `Rejected by: <tester>` events on the ticket. Second reject routes ticket to `blocked/` with `Failure mode: needs-human-review` + posts a note tagging the human
- HV-XXX: rejection reason length cap — server-side validation that tester rejection reasons are ≤ 2 sentences (~280 chars). Forces specificity.
- HV-XXX: PM role (later) — same shape: a bot dedicated to writing tickets and setting `focus.md`. Files small, well-broken-down tickets so coder bots can DAG-walk effectively.

## Sequence
This FS is filed but not actively worked. Order:
1. Ship the basic multi-bot loop first (Add-a-bot UI, worktree convention, coordinator + 1 coder)
2. Once that loop is stable, introduce the tester role per this FS
3. PM role last — most ambiguous, easiest to over-engineer

Each role addition tests one new thing at a time.

## Out of scope (v1 of this FS)
- Multi-tester voting / consensus
- Tester suggesting code changes inline (just approve/reject)
- Tester running against partial PRs (works only on complete in-review submissions)
- Tester reading external lint/security tools (uses what's in CI already)
