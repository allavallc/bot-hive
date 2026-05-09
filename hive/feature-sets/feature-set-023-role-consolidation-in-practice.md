# [feature-set-023] Role consolidation in practice

**Status**: active
**Owner**: allavallc

## Goal
Make the role consolidation rule from ADR-002 actually run. Each bot, on session start, counts active bots in its colony from `hive/events/<colony>.*.log` (active = entry within 2h), applies the consolidation table, reads the matching skill rubric file(s) from `hive/skills/`, and announces its role in its first output. Plus the rung-2/3-aware health invariants that detect role drift.

## Rationale
ADR-002 + `hive/roles.md` describe the rule on paper. Today nothing in the bot startup actually executes it — bots just read `bot-startup.md` and pick from backlog. With a single bot per colony, that's fine; with 2+, two bots will claim the same ticket, both write tickets, both review each other, etc. The rule needs to be enforced in code (the startup script + the my-work output) and verified in monitoring (anomalies fire if a PM is claiming or a tester is coding).

## Tickets (skeletons)
- HV-XXX: `hive/skills/pm.md` — PM rubric. Owns: tickets + focus + suggestions inbox. Doesn't: code, review.
- HV-XXX: `hive/skills/coder.md` — coder rubric. Owns: claim + code + ship. Doesn't: file tickets directly (suggests via notes).
- HV-XXX: `hive/skills/tester.md` — tester rubric. Approve-by-default; reject only with one specific reason cited. Already partially scoped under FS-019.
- HV-XXX: Role-resolution helper — `scripts/whoami.{sh,ps1}` reads `.bot-hive-identity`, scans `hive/events/<colony>.*.log` for active bots, applies the consolidation table, prints the bot's role(s) + the skill files it should read.
- HV-XXX: Update `bot-startup.md` to walk the consolidation table on every session start. First output line: `role: <roles> (<n>/<m> in colony)`.
- HV-XXX: Health invariants (rung-aware, ship with this FS):
  - In a colony of 2, the longer-tenured bot must NOT have any in-progress claims; the newer bot must
  - In a colony of 3+, the PM (longest-tenured) must NOT have any claims; tester must NOT commit code on a coder's branches
  - Mid-session role drift: a bot's role assignment must match what whoami.* would compute on each session start (re-check on next claim)

## Done when (rung-2 dependency)
- [ ] `whoami.ps1` + `whoami.sh` exist and print correct role for 1, 2, 3, and 4-bot scenarios
- [ ] `bot-startup.md` instructs bots to run whoami first, read matching skill files, announce role
- [ ] All three skill rubrics exist
- [ ] Role-aware invariants fire correctly in panel when triggered (e.g. PM claims a ticket → anomaly within 5 min)
- [ ] **Local test**: spawn buzz first, then dart in same colony. buzz announces `role: PM + tester (1/2)`. dart announces `role: coder (2/2)`. dart claims; buzz does not. Tester invariant fires if buzz attempts a claim.

## Out of scope (this FS)
- Suggestions inbox — separate FS (025)
- Cross-colony role coordination — out of scope (each colony is independent)
- Per-role permissions enforcement (e.g. blocking `claim.sh` for PM bots) — start with conventions + invariants; harden later if needed

## Test rung this unlocks
Rung 2 (2 bots, same colony) and rung 3 (3 bots, same colony) for the role-split half. Cross-colony rung 4+ depends on FS-024.
