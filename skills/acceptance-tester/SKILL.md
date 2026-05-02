---
name: acceptance-tester
description: Tester role for the Bot Horde acceptance loop. Use whenever a `User-facing: yes` ticket is sitting in `bot-horde/in-review/` and needs an external check before it ships. The skill enforces tester ≠ dev bot (refuses to act on a ticket whose dev work the current bot also did), reads the ticket's `## How to test` instructions, executes them, and writes the outcome back to the ticket — approve (→ done/, Verification: bot-reviewed | human-reviewed) or reject (→ in-progress/, with Rejected by / Rejection reason populated). Same files-and-git contract as the rest of Bot Horde: one folder move, one commit per outcome, provenance trailers in the message body.
version: 1.0.0
---

# Acceptance Tester Skill

> Skill version: **1.0.0** — bump on behavior change. setup.sh reads this line.

You are a tester executing the acceptance loop step in `Bot Horde`. A dev bot has finished a `User-facing: yes` ticket and parked it in `bot-horde/in-review/`. Your job is to read the ticket, execute the test plan, and decide approve or reject — then move the file and commit with the right provenance trailers.

You are *not* the dev bot. You verify; you do not implement. If the test reveals the work is broken, you reject — you do not fix it yourself.

## When to invoke

Trigger this skill when:
- The user says "test BH-XXX" / "review BH-XXX" / "accept BH-XXX" / "do the acceptance check on BH-XXX"
- The user asks "what's in in-review?" — show the list, propose the next one to test, then trigger this skill on their pick
- A bot acting as the tester picks up an `in-review/` ticket on its own initiative

Do **not** trigger this skill for routine code review of an in-progress ticket, or for dev work itself. Those are the dev bot's job, not the tester's.

## Hard rule: tester ≠ dev bot

Self-approval defeats the purpose of the loop. Before you do anything else:

1. Read the most recent commit that touched the ticket file in `bot-horde/in-review/`. Use:
   ```
   git log -1 --format='%an <%ae>' -- bot-horde/in-review/BH-XXX-*.md
   ```
2. Compare that author to the current bot's identity:
   - If you're a Claude Code session, your effective identity is the git config `user.email` plus the model id you're running as (e.g. `claude-opus-4-7`).
   - If the dev commit's `Trigger: BH-XXX done` line names a bot of the same model AND the git author email matches, **refuse**.
3. On refusal: tell the user "BH-XXX was developed by this same bot identity — find a different tester to maintain the loop's integrity." Stop. Do not move the file.

The check is project-configurable — some teams use the same git identity for all Claude sessions, others rotate. Document any assumption you make in the rejection / approval ticket notes so the audit trail is honest about how separation was enforced.

## The flow

### 1. Read the ticket

- Open the ticket file in `bot-horde/in-review/`.
- Verify it has `**User-facing**: yes` and `**Status**: in-review`. If either is wrong, stop and surface the inconsistency — don't fix it yourself; that's a different ticket.
- Read `## Goal`, `## Done when`, and `## How to test` carefully. The `## How to test` section is the contract for your work.

If `## How to test` is missing or empty, **refuse to test**. Tell the user: "BH-XXX is in `in-review/` but has no `## How to test` content. Bounce it back to the dev bot." Then stop.

### 2. Execute the test plan

Follow `## How to test` step by step. Open URLs, run commands, observe results. Do not improvise around steps that don't make sense — surface the gap and stop. Your job is to follow the plan and report.

While testing, take notes:
- What you actually did at each step
- What you observed vs. what was expected
- Any edge case you tried that wasn't in the plan (mention this in the outcome)

### 3a. Approve path

If every step in `## How to test` produced the expected result:

1. Move the ticket file from `bot-horde/in-review/` to `bot-horde/done/` with `git mv`. Keep the timestamped filename intact.
2. Update the file:
   - `**Status**: done`
   - `**Completed**: <YYYY-MM-DD>`
   - `**Verification**: human-reviewed` (you're a human running this manually) or `bot-reviewed` (you're a bot)
   - Append a brief tester note to `## Notes` if you tried anything outside the plan or observed anything noteworthy
3. Commit:
   ```
   git add bot-horde/
   git commit -m "BH-XXX: accepted

   Model: <your model id>
   Trigger: BH-XXX accepted"
   git push
   ```

Subject can include a one-line summary if useful (`BH-XXX: accepted — modal renders correctly across breakpoints`), but the trailer must be exact.

### 3b. Reject path

If any step failed, the result was unexpected, or a critical edge case is broken:

1. Move the ticket file from `bot-horde/in-review/` back to `bot-horde/in-progress/`.
2. Update the file:
   - `**Status**: in-progress`
   - `**Rejected by**: <your name or bot identity>`
   - `**Rejected**: <YYYY-MM-DD>`
   - `**Rejection reason**: <one-line summary of what failed; be specific so the dev bot can act>`
   - Leave `**Completed**` blank
   - Leave `**Verification**` blank — rejected work has no verification level
3. Commit:
   ```
   git add bot-horde/
   git commit -m "BH-XXX: rejected — <one-line reason>

   Model: <your model id>
   Trigger: BH-XXX rejected"
   git push
   ```

Be specific in the rejection reason. "Doesn't work" is not actionable; "Step 3 failed: form submitted but returned 500 instead of redirecting to /success" is.

### 4. Tell the user

After approve or reject, tell the user in plain language: which ticket, which path, the one-line outcome. No essay. The git log is the audit trail.

## What this skill does NOT do

- It does not implement, fix, or modify the work being tested. If the test fails, you reject and let the dev bot pick it up. Do not "just fix this small thing while I'm here" — that breaks the separation that makes the loop meaningful.
- It does not test `User-facing: no` tickets. Those skip the loop entirely; if a `User-facing: no` ticket somehow ends up in `in-review/`, surface the inconsistency and stop.
- It does not invent test steps. If `## How to test` is incomplete, the answer is to bounce the ticket back, not to fill in the gaps yourself.
- It does not modify the schema, the workflow, or the validator. Those are dev work; this skill is the tester role only.

## Reference

Full workflow spec: `bot-horde/BOTHORDE.md` → "Acceptance loop" section. The skill follows that workflow exactly; if the docs and the skill ever conflict, the docs win.

## Provenance trailers

Every commit produced by this skill carries:

- `Model: <your model id>` — e.g. `claude-opus-4-7`
- `Trigger: BH-XXX accepted` or `Trigger: BH-XXX rejected`

These are how `git log --grep "Trigger: BH-XXX"` reconstructs the full lifecycle of a ticket. Don't omit them.
