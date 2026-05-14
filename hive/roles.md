# Bot roles

Catalog of bot roles in Bot Hive, the consolidation rule (how roles map to colony size), and pointers to per-role rubrics.

This is the **operational doc** — what bots read when picking up their role on session start. The deeper "what each role checks / outputs" lives in `hive/skills/<role>.md`. The "why we chose this design" lives in `hive/decisions/ADR-002-bot-role-consolidation.md`.

---

## Roles

| Role | Owns | Does NOT do |
|---|---|---|
| **PM (product manager)** | Writes tickets and FSs. Sets the colony's `focus.md` (`hive/colonies/<colony>/focus.md`). Triages coder/tester suggestions. Coordinates the team. | Doesn't write code (when other coders exist). Doesn't make strategic priority calls without the human's input. |
| **Tester** | Reviews `in-review/` tickets against their "Done when." Approves or rejects with one specific reason citing the ticket. | Doesn't redesign work. Doesn't suggest style improvements. Doesn't write code. |
| **Coder** | Claims `backlog/` tickets per DAG-walk. Writes the code, the tests, the docs needed to ship. | Doesn't write tickets (only suggests via notes). Doesn't review peers' work as a tester. |

Each role has a rubric file at `hive/skills/<role>.md` that defines the role's specific checks, output format, and behaviors. Bots read their rubric on session start after applying the consolidation rule below.

---

## Consolidation rule

Roles **consolidate when bots are few** and **split as more bots are spawned**. The colony's current bot count determines role assignment:

| Active bots | Bot 1 | Bot 2 | Bot 3 | Bot 4+ |
|---|---|---|---|---|
| 1 | PM + coder + tester | — | — | — |
| 2 | PM + coder | tester | — | — |
| 3 | PM | tester | coder | — |
| 4+ | PM | tester | coder | coder (additional) |

The PM bot is the highest-tier role and **sheds responsibilities as more bots arrive**:
- When bot 2 spawns, PM hands off testing (tester takes that); PM keeps coding
- When bot 3 spawns, PM hands off coding (coder takes that); PM is now dedicated PM only
- After that, PM stays dedicated; new bots scale the coder pool

### How a bot determines its role

Roles are assigned **by the server**, within a colony. Each colony is isolated — `allavallc`'s bot count has no effect on any other colony's role assignment.

On session start, the bot connects to the SSE stream (`/api/bots/stream?colony=<colony>`). The server:
1. Looks up active bots in this colony.
2. Assigns the next free seat and a handle from the colony's handle pool.
3. Derives the role from the consolidation table above.
4. Sends a `your-role` event with `handle`, `seat`, `total`, `role`, and `skillFiles`.

The bot reads the `skillFiles` listed in the event. That is the complete role rubric for this session. No client-side counting.

### Mid-session role changes

If a peer joins your colony, the bot's role can transition mid-session. **Finish the current task under the existing role context, then apply the new rule on the next claim.** Matches the "finish-current, don't abandon" pattern from the FS-Owner reassignment rule (HV-093).

If a peer in your colony goes stale (no events for >2h), the bot may pick up the responsibilities the stale peer was covering — same logic as the stale-claim watchdog.

### Colony-level FS ownership and the cascade rule

Roles operate within colonies; **claiming work** also operates at the colony level via the FS claim cascade (see `hive/HIVE.md` "Hive ↔ colony ↔ bot hierarchy"). A bot can claim a ticket only if its colony has claimed the ticket's FS — or the ticket has no FS at all (free-for-all). FS claims are recorded in the `Owner:` field on each FS file (set to the colony's GitHub login). 48-hour dormancy releases an FS claim.

---

## Suggestions and escalation

Coder/tester bots can **suggest** new tickets or priority changes via the notes channel. They do not file tickets directly.

Mechanism: write a note tagged `@<colony>.<pm-handle>` (e.g., `@allavallc.kestrel-pm`). The qualifier is required — never just `@pm`. PM picks up suggestions on session start, applies the colony's `always_ask` policy:

- **`always_ask = true` (default)**: PM creates a suggestion entry in the panel inbox. Human approves/rejects per question. On approve, PM files the ticket. On reject, PM writes a reason note back to the suggesting bot.
- **`always_ask = false` (future)**: PM applies its rubric (`hive/skills/pm.md`) to decide whether to auto-file or escalate.

The `always_ask` flag is per-colony (not per-user). Two humans on the same project can have different policies.

Latency: PM-only review pass on session start, typically once per work cycle. For urgent suggestions, ping the human directly via `@<colony>.<human-handle>` in the same notes channel.

Decision record: [`hive/decisions/ADR-004-pm-suggestions-inbox.md`](./decisions/ADR-004-pm-suggestions-inbox.md).

---

## See also

- `hive/skills/pm.md` — PM rubric (rules, output format, anti-bias safeguards)
- `hive/skills/tester.md` — tester rubric (approve-by-default, 280-char rejection cap, 2-rejection escalation)
- `hive/skills/coder.md` — coder rubric (claim flow, work boundaries, when to suggest vs file)
- `hive/decisions/ADR-002-bot-role-consolidation.md` — the decision and its trade-offs
