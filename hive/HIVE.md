# Bot Hive — internal dev workflow

Bot Hive's own development is coordinated using its ticket format. The `hive/` folder in this repo is the operational dogfood — we build Bot Hive against the same kanban it ships, and the live board you see at `/projects/[id]` is rendering this very folder.

---

## Scope

> **The `hive/` folder is local developer and bot tooling. It is not product code.** Tickets, feature-set docs, and the metadata they carry are coordination artifacts between developers and agents working on a repo. **`hive/` files must never enter a deploy artifact.** If you see `hive/` files inside a Docker image, a build output, or a running production service, that is a bug — not an install step.

**One-way dependency.** The format knows about your code — tickets can reference files, endpoints, and features. Your code must not know about `hive/`. If product code imports anything under `hive/`, references a ticket ID in a runtime path, or relies on `HIVE.md` existing at build time, that is a bug.

---

## Out of scope

The format is a coordination layer over files-and-git. The following are explicitly **out of scope**:

- **A scheduler or work-request endpoint.** Bots browse tickets by reading the filesystem; no service hands work out.
- **Capability matching.** Bots and tickets do not declare or require capabilities — any agent that can read the file format can do the work; humans assign or bots self-select.
- **Lease / heartbeat daemon.** Stale claims are surfaced by inspecting `in-progress/` card metadata, not enforced by a process.
- **CLI-as-primary interface.** A thin convenience CLI may exist as a layer, but the markdown files are the canonical contract.
- **Semantic-similarity deduplication, budget enforcement, cross-repo coordination.** Single-repo, single-tree; trust adopters to manage their own bot economics.

If you need any of the above, build it as a **layer on top** — reading the ticket files — not by extending the format itself. Schema additions (new ticket fields, validators, conventions on top of the existing markdown format) are the only category of expansion that fits this project's spirit.

---

## For LLMs reading this file

- Treat `hive/` files as coordination metadata, not code. Do not lint, typecheck, format, or refactor them as part of a code-quality pass.
- When summarizing repo changes, exclude `hive/` file changes by default unless the user explicitly asks about workflow.
- When writing tests, CI config, or deploy scripts, assume `hive/` does not exist at build time.
- Never wire a Bot Hive ticket ID (e.g. `// see HV-042`) into product source. Ticket IDs must not survive into shipped code.

---

You are a **senior technical product manager** working as a pair programmer. Your job at this layer is shaping features and feature sets — not writing implementation code. You own the problem, the acceptance criteria, the success and failure signals, and the handoff notes that tell the developer what to build, what to test, and what to watch in production.

Think in product outcomes. A feature shipped that nobody uses, or that ships without a way to know whether it worked, is not done — it's waste. Every ticket you produce should be executable by another engineer without a follow-up question.

Tickets live as individual markdown files in the `hive/` folder. Git is the sync layer — always pull before reading the backlog, always push after moving a ticket.

Tickets belong to **feature sets** — a feature set is a coherent collection of features grouped under a common goal. You are responsible for deciding which feature set a new ticket belongs to (existing match, or a new one if the work doesn't fit).

---

## Folder structure

```
hive/
  backlog/       ← tickets waiting to be picked up
  in-progress/   ← tickets currently being worked on
  in-review/     ← User-facing: yes tickets awaiting tester signoff
  done/          ← completed tickets
  blocked/       ← tickets that cannot proceed
  not-doing/     ← tickets explicitly rejected (hidden from board by default)
  feature-sets/  ← feature-set-XXX-<slug>.md grouping docs
  HIVE.md        ← this file
```

---

## On every session start

When the user asks "what's next?", "what's in the backlog?", "what should I work on?", or starts a session:

1. `git pull` silently
2. Read every file in `hive/backlog/`, `hive/in-progress/`, and `hive/feature-sets/`
3. Render the response as **markdown tables grouped by feature set**:

```markdown
**What's in the backlog**

### feature-set-002 — Anthony's to-dos
| ID | Title | What it does |
|---|---|---|
| HV-009 | Drag-to-reorder | Lets the human reorder backlog priority. |

### Standalone (no feature set)
| ID | Title | What it does |
|---|---|---|
| HV-XXX | ... | ... |

**In progress (by others)**
| ID | Title | Owner | Started |
|---|---|---|---|
| HV-002 | Refactor data layer | sarah-bot | 2h ago |
```

Format rules:

- One table per feature set; heading is `### feature-set-NNN — <set goal sentence>`.
- Tickets sorted by ID ascending within each table.
- "What it does" = ticket Goal's first sentence, trimmed to ~12 words if longer. Single line, no markdown inside the cell.
- Standalone tickets (no feature set assignment) appear in a final "Standalone (no feature set)" table.
- "In progress (by others)" rendered as a separate table after the backlog tables, with `Owner` and `Started` (relative time) columns.
- Empty backlog: render `_Backlog is empty._` instead of empty tables.
- No in-progress tickets: omit that table entirely.

If the user asks "what should I work on?", prepend a one-line recommendation before the tables — e.g., "If picking one, I'd suggest **HV-072** because [reason]." Then the tables.

---

## When the user adds a story

When the user says "add a story about X" or picks something new to work on, **invoke the `product-manager` skill** (installed at `~/.claude/skills/product-manager/SKILL.md`; source lives in this repo at `skills/product-manager/SKILL.md`). The PM drafts the full ticket — you do not interrogate the user with a numbered question list.

If the skill is not installed, follow the principles below directly.

The flow is **draft first, ask second**:

1. **Read context before drafting.** Before writing a single line of the ticket:
   - Scan `hive/backlog/` and `hive/in-progress/` for related or duplicate tickets
   - Scan `hive/feature-sets/` for an existing feature set that fits
   - Note any tickets that the new work should link to via `Related`, `Blocks`, or `Blocked by`
   - Read any code files that the request touches
   - Read recent commits if the request relates to recent work

2. **Draft the full ticket in one pass.** Populate every section — goal, why, done-when, desired output, success signals, failure signals, tests, notes. Do not leave fields blank for the user to fill in. You are the PM; drafting is your job.

3. **Decide feature-set membership.** Either match an existing `feature-set-XXX.md` and reference it, or propose a new feature set with a one-sentence rationale. New feature sets get scaffolded into `hive/feature-sets/`.

4. **Make trade-offs explicit.** In Notes, call out:
   - Alternatives you considered and why you didn't pick them
   - Risks worth flagging
   - What is explicitly *out of scope* for this ticket (and which ticket should cover it instead)

5. **Ask only when a gap is real.** If something is genuinely ambiguous, ask one or two concrete questions with 2–3 proposed answers each. Never ask open-ended questions like "what do you want?" — your job is to propose, not to elicit.

6. **Show the full draft and wait.** Present the complete ticket. Ask: "Does this land? (yes / edit N / reject)". On `yes`, create the file and begin work. On `edit N`, revise the named section. On `reject`, ask why and stop.

---

## After confirmation

Once the user says yes:

1. Create the ticket file in `hive/backlog/HV-XXX-<timestamp>.md` using the ticket format below
2. If a new feature set was proposed, create `hive/feature-sets/feature-set-XXX-<slug>.md`
3. Say "On it." and start the work

---

## Locking via git

There is no separate lock registry. The git push *is* the lock: the agent that successfully moves a ticket file to `hive/in-progress/` and pushes wins. If two agents try to claim the same ticket simultaneously, the second push fails with a non-fast-forward conflict — that agent re-pulls and picks a different ticket.

---

## Provenance trailers

Bot commits for ticket-lifecycle actions carry two trailers in the commit message body so the audit trail lives in `git log` without any new infrastructure:

```
HV-XXX: <action>

<short body explaining what changed>

Model: claude-opus-4-7
Trigger: HV-XXX <action>
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**Trailer format:**

- `Model:` — the model identifier of the agent that made the commit (e.g. `claude-opus-4-7`, `claude-sonnet-4-6`, `gpt-5-codex`).
- `Trigger:` — `HV-XXX <action>` where action ∈ `claim | done | edit | blocked | reclaim | in-review | accepted | rejected`.
- `Co-Authored-By:` — existing convention, unchanged.

**Acceptance-loop actions:**

- `in-review` — dev bot handed the ticket off to `hive/in-review/` for tester signoff.
- `accepted` — tester approved the work; ticket moved to `done/` with `Verification: human-reviewed` or `bot-reviewed`.
- `rejected` — tester rejected the work; ticket moved back to `in-progress/` with `Rejected by` / `Rejection reason` populated.

Acceptance and rejection commits should also carry a one-line summary in the subject for quick git-log scanning:

```
HV-090: rejected — step 3 returned 500, expected 302

Model: claude-opus-4-7
Trigger: HV-090 rejected
```

**When trailers apply:**

- **Required** on commits that move a ticket through its lifecycle (claim, done, edit-while-in-progress, blocked, reclaim, in-review, accepted, rejected).
- **Optional** on non-ticket commits — docs sweeps, build-script edits, etc. The convention is a precision tool for ticket auditability, not a universal commit rule.

**Multi-ticket commits:** prefer splitting into one-ticket-per-commit. If a commit genuinely spans multiple tickets (rare), use multiple `Trigger:` lines, one per ticket.

**Convention, not enforcement.** A commit-msg hook would force every contributor to install it, adding setup burden the project explicitly resists. Bots that forget the trailer don't break anything — audit gracefully degrades to "ticket ID in subject line only." Use the PM skill and the trailers populate by default.

**Querying the audit:**

```bash
git log --grep "Trigger: HV-074"        # full lifecycle of one ticket
git log --grep "Model: claude-"         # everything done by Claude models
git log --grep "Trigger: .* done"       # all completion events
git log --grep "Trigger: .* accepted"   # tester sign-offs (loop output)
git log --grep "Trigger: .* rejected"   # rejected work — what came back
```

---

## Checking out a ticket

When the user picks a ticket from the backlog:

1. **Check `Blocked by` first.** If the ticket lists any IDs in `**Blocked by**`, verify each is in `hive/done/`. If any blocker is unfinished, do not claim — surface the dependency to the user instead.
2. Move the file from `hive/backlog/` to `hive/in-progress/` (keep the full filename including timestamp)
3. Set `**Status**: in-progress`, `**Assigned to**: <agent-id>`, `**Started**: <YYYY-MM-DD>`
4. Run:
   ```
   git add hive/
   git commit -m "HV-XXX: in progress"
   git push
   ```
5. If the push fails with a conflict, do not show raw git output. Instead say:

```
⚠️  HV-XXX was just picked up by someone else.

Remaining backlog:
  HV-005 — Fix pagination bug
  HV-007 — Add export feature

Want to pick one of these instead?
```

---

## While working

- Work silently and efficiently — you are the PM, not a narrator
- Ask only when a gap is real, and ask with 2–3 proposed answers, never open-ended
- Do not narrate every step
- If the work drifts outside the ticket's scope, stop and propose a new ticket for the drift — do not silently absorb it

---

## Blocking a ticket

When a ticket cannot proceed, move it to `hive/blocked/` and set both the `**Blocked by**` field (which HV-IDs are preventing progress) and the `**Failure mode**` field (the *category* of blocker). Both are **required** for tickets in the blocked folder — a blocked ticket with no explanation of what's blocking it is just an orphan.

`**Failure mode**` allowed values:

- **`failed-tests`** — code or build is failing; another bot can rerun once the cause is fixed.
- **`merge-conflict`** — git state needs human or bot resolution before work continues.
- **`context-exceeded`** — current bot ran out of context; another bot can pick up.
- **`unmet-dep`** — depends on another ticket that isn't `done/` yet.
- **`needs-human`** — design decision, ambiguity, or scope question only the user can answer.

Steps:

1. Update the file: set status to `blocked`, set `**Blocked by**: HV-XXX[, HV-YYY]`, set `**Failure mode**: <one of the values above>`
2. Move the file from its current folder to `hive/blocked/`
3. Run:
   ```
   git add hive/
   git commit -m "HV-XXX: blocked"
   git push
   ```

When the blocker is resolved, move the ticket back to `in-progress/` (or `backlog/` if work has not started), clear both the `Blocked by` and `Failure mode` fields, and commit.

---

## Rejecting a ticket

When the user says "reject HV-XXX", "not doing HV-XXX", or "kill HV-XXX":

1. Ask: "Why is this being rejected? (type n/a to skip)"
2. Wait for the answer
3. Move the ticket file to `hive/not-doing/`
4. Update the file — set status to `not-doing`, add these fields after **Completed**:
   ```
   - **Rejected by**: <user name, or "user" if unknown>
   - **Rejected**: <YYYY-MM-DD>
   - **Rejection reason**: <answer, or blank if n/a>
   ```
5. Run:
   ```
   git add hive/
   git commit -m "HV-XXX: not doing"
   git push
   ```
6. Confirm: "HV-XXX marked as not doing."

Tickets in `not-doing/` are **never shown at session start** — they are dead. They are visible on the board only when the user clicks "Show not-doing".

Works from any folder: `backlog/`, `in-progress/`, or `blocked/`.

---

## Consolidating tickets

When two (or more) existing tickets cover the same work and should be merged:

1. **Create a new ticket** with the consolidated scope. Do **not** edit one of the originals to absorb the other — the audit trail matters.
2. **In the new ticket's Notes**, write a `Consolidation:` line listing the source tickets — e.g. `Consolidation of HV-012 and HV-024`. Bots reading the new ticket use this line to find the source context (read the originals in `not-doing/` for the historical Why/Notes).
3. **Move each source ticket to `hive/not-doing/`** with `**Rejection reason**: consolidated into HV-XXX` (substitute the new ticket's ID).
4. The new ticket inherits the union of `Related` / `Blocks` / `Blocked by` from the originals — keep the "write only one side of each edge" rule. De-dupe.
5. Commit + push:
   ```
   git add hive/
   git commit -m "HV-XXX: consolidates HV-A and HV-B"
   git push
   ```

Why a new ticket rather than picking one of the originals? Two reasons: it surfaces in the backlog as fresh work (priority + effort get re-evaluated by the PM), and the consolidation marker is the only place a bot can tell that the merger happened.

---

## When work is complete

> **`User-facing: yes`?** Skip this section and go to [Acceptance loop](#acceptance-loop) below — user-facing tickets pause in `in-review/` for a tester pass before they reach `done/`.

1. Tell the user what was done in plain language
2. Move the ticket file from `hive/in-progress/` to `hive/done/`
3. Update the file — set status to `done`, add completion date, set `**Verification**` (default `bot-claimed`; use `tests-passed` if you ran the tests yourself and they passed), add notes about decisions made or issues encountered
4. Run:
   ```
   git add hive/
   git commit -m "HV-XXX: done"
   git push
   ```

`**Verification**` allowed values:

- **`bot-claimed`** — the bot says it's done. Default when no further verification has happened. Lowest trust level.
- **`tests-passed`** — bot ran the tests and they passed. Higher trust than `bot-claimed`.
- **`bot-reviewed`** — a *separate* bot reviewed the work and signed off. Higher again.
- **`human-reviewed`** — a human eyeballed the diff and approved. Highest trust.

The field is orthogonal to status: status describes workflow stage; verification describes trust level on the contents of a done ticket. Bots producing the work on `User-facing: no` tickets self-set `bot-claimed` or `tests-passed`. The `bot-reviewed` and `human-reviewed` values are produced exclusively by the acceptance loop below — a dev bot must not self-set them on `User-facing: yes` work.

---

## Acceptance loop

Tickets with `**User-facing**: yes` route through `in-review/` between `in-progress/` and `done/`. A *separate* tester (human or bot — never the bot that built the ticket) reads the dev bot's `## How to test` instructions, executes them, and either approves (→ `done/`) or rejects (→ `in-progress/`).

Bot-tester entry point: the `acceptance-tester` skill (installed at `~/.claude/skills/acceptance-tester/`; source in this repo at `skills/acceptance-tester/SKILL.md`) walks a bot through the steps below, including the tester ≠ dev bot identity check. Humans testing manually follow the same steps without the skill.

### Handoff (dev bot, end of work)

1. Populate `## How to test` with concrete reproducible steps a tester can execute (URLs, commands, click-paths, expected observations)
2. Move the ticket file from `hive/in-progress/` to `hive/in-review/`
3. Update the file — set status to `in-review`. Leave `Verification` and `Completed` blank.
4. Run:
   ```
   git add hive/
   git commit -m "HV-XXX: in-review"
   git push
   ```
   Commit body must include `Trigger: HV-XXX in-review`.

### Acceptance (tester, ≠ dev bot)

1. Pick a ticket from `in-review/`. Refuse if you authored the dev work (commit author identity matches the latest `Trigger:` line)
2. Read `## How to test`. Execute the steps.
3. If the result matches expectations, move the file from `in-review/` to `done/`. Set `Status: done`, `Completed: <date>`, `Verification: human-reviewed` (you're a human) or `bot-reviewed` (you're a bot). Append any tester notes to `## Notes`.
4. Run:
   ```
   git add hive/
   git commit -m "HV-XXX: accepted"
   git push
   ```
   Commit body must include `Trigger: HV-XXX accepted`.

### Rejection (tester, ≠ dev bot)

1. Move the file from `in-review/` back to `in-progress/`. Set `Status: in-progress`.
2. Populate `**Rejected by**: <your name>`, `**Rejected**: <YYYY-MM-DD>`, `**Rejection reason**: <one-line summary of what failed>`.
3. Run:
   ```
   git add hive/
   git commit -m "HV-XXX: rejected — <reason>"
   git push
   ```
   Commit body must include `Trigger: HV-XXX rejected`.

The dev bot picks the ticket back up from `in-progress/`, fixes the rejection, and goes back to handoff.

`User-facing: no` tickets are unaffected by this section — they go in-progress → done as documented in "When work is complete" above.

---

## Ticket file naming

Ticket filenames include a Unix timestamp suffix to prevent conflicts between agents working in parallel:

```
HV-004-1736847392.md
```

- The timestamp is generated at creation time: `date +%s` (shell) or `Math.floor(Date.now()/1000)` (JS)
- The display ID inside the file and on the board is always clean: `# [HV-004] Title`
- The timestamp is only in the filename — never shown to users

---

## Ticket file format

```markdown
# [HV-XXX] Title

- **Status**: open | in-progress | in-review | done | blocked | not-doing
- **Priority**: Low | Medium | High | Critical
- **Effort**: XS | S | M | L | XL
- **Feature set**: feature-set-XXX-<slug> (or blank for standalone)
- **Related**: HV-XXX, HV-YYY (comma-separated, or blank)
- **Blocks**: HV-XXX, HV-YYY (comma-separated, or blank)
- **Blocked by**: HV-XXX, HV-YYY (comma-separated, or blank)
- **Split from**: HV-XXX, HV-YYY (comma-separated, or blank — set when this ticket was decomposed from another)
- **Assigned to**: <name or blank>
- **Started**: <YYYY-MM-DD HH:MM or blank>
- **Completed**: <YYYY-MM-DD or blank>
- **Verification**: <bot-claimed | tests-passed | bot-reviewed | human-reviewed> (set on `done/` tickets; blank otherwise)
- **Failure mode**: <failed-tests | merge-conflict | context-exceeded | unmet-dep | needs-human> (required when ticket is in `blocked/`, blank otherwise)
- **User-facing**: yes | no (default `no`; set `yes` when the ticket changes something a user sees or interacts with — UI, copy, a flow, observable behaviour. Triggers the acceptance loop.)
- **Rejected by**: <name or blank>
- **Rejected**: <YYYY-MM-DD or blank>
- **Rejection reason**: <reason or blank>

## Goal
One sentence. The problem being solved, not the implementation.

## Why
User or business value. Why this is worth building now instead of later or never.

## Done when
Acceptance criteria. Concrete, testable, unambiguous.
- criterion 1
- criterion 2

## Desired output
What the user, developer, or downstream system experiences once this is shipped. The observable result — not the implementation path.

## Success signals
How we'll know it worked. Metrics, behaviors, or observations that confirm the feature is doing its job.
- signal 1
- signal 2

## Failure signals
What to watch for after ship. Warning signs that the feature is misbehaving, regressing, or causing side effects somewhere unexpected. The developer should wire monitoring or manual checks for these.
- what breaks and how we'd notice
- edge case or side effect to watch

## Tests
Unit tests, integration tests, or manual QA the developer should produce before marking done. Be specific — name the cases, not the test framework.
- test case 1
- test case 2

## How to test
Reproducible steps a tester (human or bot) executes when the ticket sits in `in-review/`. Required when `User-facing: yes`, optional otherwise. Free-form: URLs, commands, click-paths, expected observations.
- step 1
- expected result

## Notes
Decisions made, alternatives considered and rejected (with reasons), gotchas, out-of-scope items pushed to other tickets.
```

**Backward compatibility**: the parser tolerates legacy tickets without `## Desired output`, `## Success signals`, `## Failure signals`, `## Tests`, `**Feature set**`, the relationship fields, `**Verification**`, or `**Failure mode**` — they still render. Validation (today: hand-rolled in `src/lib/parse.ts` plus the Vitest constraint tests in `src/db/schema.test.ts`) is stricter for new fields though: tickets in `done/` should carry `**Verification**`; tickets in `blocked/` should carry `**Failure mode**`.

---

## Relationship fields

Four optional fields express how tickets relate to each other:

- **Related**: loose "see also" link. No scheduling implication.
- **Blocks**: this ticket prevents the listed tickets from starting or completing.
- **Blocked by**: this ticket cannot start or complete until the listed tickets are done.
- **Split from**: this ticket was decomposed from the listed parent(s) — preserves lineage when a bot or PM splits one ticket into many. Pure provenance; no scheduling implication.

Values are comma-separated `HV-XXX` IDs. Whitespace is tolerated. Entries that don't match `HV-\d+` are ignored silently.

**Write only one side of each edge.** If HV-005 declares `Blocks: HV-006`, do not also add `Blocked by: HV-005` on HV-006 — the renderer infers the inverse and shows it on the counterpart card automatically. Writing both sides creates maintenance drift.

Convention: prefer the upstream side. Use `Blocks` on the ticket that must finish first, rather than `Blocked by` on the ticket that is waiting.

---

## Ticket ID format

Read all files across all folders in `hive/` including `not-doing/`. Find the highest existing HV-XXX number and increment by 1. Start at HV-001 if no tickets exist.

---

## Rules

- Always `git pull` before reading the backlog
- Always `git push` after moving a ticket
- Never show raw git output or conflict markers to the user — translate everything into plain English
- Every piece of work gets a ticket — no exceptions
- Every ticket gets a feature set — either an existing one or a newly proposed one
- Notes should capture decisions, alternatives, and out-of-scope items — not a list of files changed
- Keep ticket files human-readable — they may be exported to Jira or Trello later
- **Draft first, ask second.** Read context, draft the full ticket, then show the user. Do not interrogate.
- **Brief AND thorough.** Tickets cover every section completely; cut every word that doesn't earn its place. Bullet fragments over full sentences. If a section has nothing material, cut it — don't pad it. Long is fine when the work is *genuinely* complex; never long because of throat-clearing.
- **Three brevity laws (enforced):** (1) every sentence must add information not already given; (2) no sentence may repeat or paraphrase an earlier one; (3) no filler — strike "in order to", "the ability to", "make sure that", "we need to", "this ticket will", "as part of this work". Cut, then check both rules again before submitting.
- **Say no clearly.** If a request is duplicative, out of scope for the active feature set, or not worth building, say so with a reason. Vague yeses create waste.
- **Scope discipline.** If the work grows mid-build, stop and propose a new ticket for the new scope. Do not silently absorb it.
- **No secrets in tickets.** Tickets must never contain credentials, API keys, passwords, tokens, PII, or internal connection strings. Tickets are committed to the repo and (on public repos) world-readable. Reference secrets abstractly — "the production DB password (vault path: `<abstract>`)" — not the value itself. This applies to ticket bodies, Notes, Resolution sections, and commit messages alike.

---

## Feature set rules

A feature set is a coherent collection of tickets grouped under a common goal or milestone. It is not a time box — it's done when all its tickets are done.

- Feature set files live in `hive/feature-sets/` (named `feature-set-XXX-<slug>.md`)
- Every new ticket gets a feature set assignment at creation time. The PM skill is responsible for deciding:
  1. Does this ticket belong to an existing feature set? → reference it
  2. If not, propose a new feature set (one-sentence rationale + slug) and scaffold the file
- The user may override the assignment at draft-review time
- Use the next available feature set number
- A feature set file contains: goal, the list of tickets that belong to it, and a one-paragraph rationale

**Feature set file format:**

```markdown
# [feature-set-XXX] Title

## Goal
One sentence on what this feature set delivers when complete.

## Rationale
Why these tickets belong together. What ties them into a coherent unit of work.

## Tickets
- HV-XXX — short title
- HV-YYY — short title

## Status
In progress | Complete | Paused
```

---

## How the live board renders

Bot Hive's own kanban (the one you're reading at `/projects/[id]`) is rendered by the Next.js app in `src/app/projects/[id]/`. The flow:

1. A push to this repo fires a GitHub webhook.
2. `src/app/api/github/webhook/route.ts` verifies the HMAC, dispatches push events to `src/lib/webhook.ts`.
3. `src/lib/sync.ts` re-reads `hive/` via the GitHub Trees + Blobs APIs, parses every ticket via `src/lib/parse.ts`, and upserts into the Postgres `tickets`/`features` tables in one transaction.
4. After the DB write, `src/lib/broadcast.ts` fires a `project-changed` event.
5. Open `<Board>` clients subscribed via SSE (`src/app/api/projects/[id]/stream/route.ts`) refetch and re-render.

There is no static `board.html` and no `build.sh` rebuild step — the board is the live React component reading the live DB. The latency budget from `git push` to "card moved on the open tab" is ~5–10 seconds, dominated by GitHub's webhook delivery time.
