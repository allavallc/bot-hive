# ADR-002: Bot role consolidation across colony size

**Status**: Accepted

**Date**: 2026-05-08

**Authors**: allavallc-cc1 (drafted), allavallc (decided)

---

## Context

Bot Hive defines distinct roles (PM, tester, coder) that map to different rubrics and behaviors. The naive rule "one role per bot" works at scale but creates two problems at small scale:

1. With only 1 bot, that bot must do everything — there's no one else.
2. With 2 bots, dedicating one to PM-only and another to coder-only leaves no tester. But adding a 3rd bot just for a tester is unnecessary overhead at this scale.

The question: when should bots consolidate roles, and when should they split?

## Decision

Roles **consolidate when bots are few** and **split as more bots are spawned**. The colony's current bot count determines role assignment:

| Active bots | Bot 1 (PM) | Bot 2 | Bot 3 | Bot 4+ |
|-------------|------------|-------|-------|--------|
| 1 | PM + coder + tester | — | — | — |
| 2 | PM + tester | coder | — | — |
| 3 | PM | coder | tester | — |
| 4+ | PM | coder | tester | additional coders |

The PM bot is the "highest-tier" role and **sheds responsibilities as more bots arrive**:
- When bot 2 spawns, PM stops coding (coder takes that)
- When bot 3 spawns, PM stops testing (tester takes that)
- After that, PM stays dedicated; new bots scale the coder pool

The role rubrics (`hive/skills/pm.md`, `hive/skills/tester.md`, etc.) reference this rule. A bot reads its role rubric on session start and applies the rule based on the active colony size.

## How bots detect colony size

A bot is considered active if `hive/events/<handle>.log` exists and has a recent entry (within ~2h, matching the existing stale-claim threshold per HV-089). Count the number of active event logs to determine current colony size. The bot then applies the table above to decide which roles it should perform.

This detection runs on session start (via `my-work.sh` or its successors) and after each significant event (claim, in-review). Bots re-evaluate whether their role coverage is still right when the colony changes.

## Consequences

**What becomes easier:**
- Single-bot users get a fully functional swarm without spawning multiple sessions.
- Adding bots is incremental — each addition automatically rebalances responsibilities without manual reconfiguration.
- The mental model is "first bot is the most senior; later bots specialize away the lower-priority work."
- No new role-config files needed; the rule is implicit from colony size.

**What becomes harder:**
- A bot's role can change mid-session if a peer joins the colony. The bot needs to re-read its rubric and shed the responsibility cleanly. Implementation must support graceful role transitions.
- Stale-bot detection becomes more important — if bot 2's event log goes stale but isn't reclaimed, bot 1 will think it's still in 2-bot mode and won't pick up the testing it should. The 2h stale threshold (per HV-089) covers most cases but isn't perfect.
- A bot reading its rubric mid-session can produce inconsistent priorities across the colony if peers haven't re-evaluated. Acceptable, but worth documenting.

**Where this rule is documented:**
- `AGENTS.md` — the protocol section that describes session start.
- `hive/HIVE.md` — the format-neutral spec.
- Each role's skill file (`hive/skills/pm.md`, `hive/skills/tester.md`, etc.) references this ADR.

**What's NOT in scope:**
- Multi-human / multi-colony handling — that's ADR-001 (separate decision; once colonies exist, this consolidation rule applies *within* each colony, not across them).
- Per-FS role overrides (e.g., "this FS needs two testers") — defer until evidence shows it matters.
- LLM-side enforcement of role discipline (bot stays "in role") — rubrics handle that, not architecture.

## Open Questions

1. What happens when a bot's role transitions mid-session — does it continue the in-progress work it had under the old role, or hand it off? Recommendation: finish the current task under the existing role context, then apply the new rule on the next claim. Matches the "finish-current, don't abandon" pattern from the FS-Owner reassignment rule (HV-093).
2. Should the role rule consider what the colony is currently working on (e.g., "if no in-review tickets exist, the tester role is unnecessary")? Recommendation: not for v1. Keep the rule purely count-based; revisit if the rule causes obvious over-allocation.
