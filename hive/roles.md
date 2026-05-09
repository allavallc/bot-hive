# Bot roles

Catalog of bot roles in Bot Hive, the consolidation rule (how roles map to colony size), and pointers to per-role rubrics.

This is the **operational doc** — what bots read when picking up their role on session start. The deeper "what each role checks / outputs" lives in `hive/skills/<role>.md`. The "why we chose this design" lives in `hive/decisions/ADR-002-bot-role-consolidation.md`.

---

## Roles

| Role | Owns | Does NOT do |
|---|---|---|
| **PM (product manager)** | Writes tickets and FSs. Sets `focus.md`. Triages coder/tester suggestions. Coordinates the team. | Doesn't write code (when other coders exist). Doesn't make strategic priority calls without the human's input. |
| **Tester** | Reviews `in-review/` tickets against their "Done when." Approves or rejects with one specific reason citing the ticket. | Doesn't redesign work. Doesn't suggest style improvements. Doesn't write code. |
| **Coder** | Claims `backlog/` tickets per DAG-walk. Writes the code, the tests, the docs needed to ship. | Doesn't write tickets (only suggests via notes). Doesn't review peers' work as a tester. |

Each role has a rubric file at `hive/skills/<role>.md` that defines the role's specific checks, output format, and behaviors. Bots read their rubric on session start after applying the consolidation rule below.

---

## Consolidation rule

Roles **consolidate when bots are few** and **split as more bots are spawned**. The colony's current bot count determines role assignment:

| Active bots | Bot 1 | Bot 2 | Bot 3 | Bot 4+ |
|---|---|---|---|---|
| 1 | PM + coder + tester | — | — | — |
| 2 | PM + tester | coder | — | — |
| 3 | PM | coder | tester | — |
| 4+ | PM | coder | tester | additional coders |

The PM bot is the highest-tier role and **sheds responsibilities as more bots arrive**:
- When bot 2 spawns, PM stops coding (coder takes that)
- When bot 3 spawns, PM stops testing (tester takes that)
- After that, PM stays dedicated; new bots scale the coder pool

### How a bot determines its role

1. On session start (or after a peer joins/leaves), count active bots in the colony.
2. A bot is **active** if `hive/events/<handle>.log` exists and has a recent entry (within the stale-claim threshold, currently 2 hours per HV-089).
3. Apply the table above. The bot's position is determined by how recent its first claim/presence event is — earlier = higher tier.
4. Read the rubric file(s) for the role(s) you're now responsible for.

### Mid-session role changes

If a peer joins the colony, the bot's role can transition mid-session. **Finish the current task under the existing role context, then apply the new rule on the next claim.** Matches the "finish-current, don't abandon" pattern from the FS-Owner reassignment rule (HV-093).

If a peer goes stale (no events for >2h), the bot may pick up the responsibilities the stale peer was covering — same logic as the stale-claim watchdog.

---

## Suggestions and escalation

Coder/tester bots can **suggest** new tickets or priority changes via the notes channel. They do not file tickets directly.

Mechanism: write a note tagged `@<pm-handle>` (or `@swarm` if the colony has only one PM-bearing bot). PM picks up suggestions on session start, decides whether to file or escalate to the human.

Latency: PM-only review pass on session start, typically once per work cycle. For urgent suggestions, ping the human directly via `@<human-handle>` in the same notes channel.

---

## See also

- `hive/skills/pm.md` — PM rubric (rules, output format, anti-bias safeguards)
- `hive/skills/tester.md` — tester rubric (approve-by-default, 280-char rejection cap, 2-rejection escalation)
- `hive/skills/coder.md` — coder rubric (claim flow, work boundaries, when to suggest vs file)
- `hive/decisions/ADR-002-bot-role-consolidation.md` — the decision and its trade-offs
