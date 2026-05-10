# Ideas to consider

Single file. One section per live idea. When an idea is promoted to a ticket or FS, delete the whole section.

Format per section:
- `##` heading: `[YYYY-MM-DD] @<github-handle> — <one-line title>`
- 1-3 short paragraphs of context
- `**Open questions**` list
- `**Status:**` line — `parking` | `discussing` | `ready-to-file`

---

## [2026-05-09] @allavallc — Formal "Start the hive" kickoff

A user might have Bot Hive installed but not be ready to let bots work yet (still scoping, sensitive period, mid-incident, training the team). Today there's no explicit gate — install the GitHub App + sign in, and bots can be spawned anytime via the panel. A formal kickoff would feel intentional and unlock a quiet-default mode.

Catchy framing options: **"Start the hive"** / **"Wake the swarm"** / **"Open for business"**. Big button on the project page when the project is dormant; clicking it transitions from "installed but quiet" → "open to bot work."

Why it might matter beyond UX polish: marketing handle (memorable single action for onboarding videos/docs/screenshots), graceful "ready / not ready" toggle for incidents and freezes, and an intentional ceremony for the moment AI agents start touching the repo.

**Open questions**
- Scope of the off state — Add-a-Bot button hidden, in-flight bots quiet, or panel read-only?
- Per-project or per-colony toggle?
- Reversibility friction — one click to "stop the swarm" or confirmation? Stopping mid-flight could orphan in-progress work.
- Visual / copy direction — dominant CTA on a quiet project page, or small toggle in settings?

**Status:** parking

---

## [2026-05-09] @allavallc — Promote ideas from markdown to DB-backed inbox

Ideas currently live in this markdown file. The suggestions inbox planned in FS-025 (`bot_suggestions` table) handles bot-source suggestions with a panel UX. Both are "thing PM triages." A natural upgrade: extend the suggestions inbox schema to accept a `source` field (`bot` | `human-orchestrator` | `human-direct`), giving humans `idea #5` addressability + panel clickability without two parallel systems.

When this lands, the markdown file becomes the casual parking lot for orchestrator-conversation captures, and the DB inbox is the formal track that PM bots and humans can reference by stable id. Promotion path: orchestrator drops idea here → if it formalizes, file as a `human-orchestrator` row in the inbox via a panel button → PM picks up exactly as it does bot-source suggestions.

**Open questions**
- Should there be a UI button to "promote this idea to inbox" that auto-files from markdown, or always manual re-entry?
- Same `always_ask` policy as bot suggestions, or a separate human-suggestions setting?
- When an idea is promoted, do we auto-delete from the markdown file or just mark it `Status: promoted (#<id>)` for trail?

**Status:** parking — depends on FS-025 landing first

---

## [2026-05-10] @allavallc — Deterministic "done" enforcement via per-ticket check scripts

Problem: bots report "shipped X" without actually shipping X. Markdown "Done when" lists are prose, self-attested, easy to lie about. The HV-075 incident on 2026-05-10 had a bot report "moved to in-review + cherry-picked the code" when its PR contained zero code changes. Trust-but-verify failed because there was nothing to verify against.

Proposal: every ticket carries a small bash check script at `hive/checks/HV-XXX.sh`. The script returns 0 (done) or 1 (not done). Two enforcement points run the same script: a per-worktree pre-commit hook (refuses commits referencing the ticket if the check fails) and a CI gate (refuses PR merge). Bot literally cannot ship without the script returning 0.

Researched ~17 alternatives (failing-test-first, mutation testing, spec-as-code, diff-must-touch, two-phase commit, tester-bot review, etc.). Per-ticket bash scripts won on simplicity + lightweight + no new DSL + composes with existing CI.

**Open questions**
- **PM authoring overhead is the biggest scaling concern.** With 100s of tickets, who writes 100s of check scripts? Mitigations explored: ticket-type templates (UI bug, schema migration, doc-only), PM bot drafts the check as part of ticket creation, CI rejects trivial scripts (≤3 lines or just `exit 0`). Still — the PM writing real assertions is the bottleneck.
- Stale checks: paths/test names move; checks break months later on unrelated reorgs. Need a check-script linter and treat broken checks as their own bug ticket.
- Adoption friction for other Bot Hive customers — every customer would need to author check scripts. Templates per ticket type help but it's still onboarding work.
- Could the PM bot reliably draft check scripts? If yes, scaling resolves. If no, the whole thing is bottlenecked.

**Status:** parking — direction is right but the PM-bot-must-write-the-check chokepoint isn't solved. Revisit when PM bot rubric (FS-023) is more defined; if PM can reliably author checks, this becomes the next big swing.

