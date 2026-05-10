# Swarm test plan — 2-bot and 3-bot rungs

End-to-end checklists. Each rung is a separate test session. Run them
top to bottom; check off as you go.

**Prerequisites for both rungs**
- [ ] You're logged in as `allavallc` on prod (`https://bot-hive-j0ax.onrender.com`)
- [ ] Latest main is deployed on Render (check the Events tab — latest commit SHA matches `git log origin/main -1`)
- [ ] No bots currently running in `worktrees/` (or you're prepared to leave them)

---

## Rung 2 — two bots in your colony, role split

**What we're testing**
- Two bots respect the role consolidation table (older bot = PM + tester, newer bot = coder)
- Coder claims and ships; PM bot does not claim
- Health monitor flags it if the rule is violated

**Setup (~2 min)**

- [ ] Open `https://bot-hive-j0ax.onrender.com/projects/<your-project>` in browser A
- [ ] Open the Add-a-Bot modal, copy Step 1, paste in your main PowerShell. New tab opens with Claude Code starting in a worktree. **This is bot 1** (older bot, will be PM + tester).
- [ ] In bot 1's terminal, paste Step 2 (`claude`) and Step 3 (`Read hive/bot-startup.md and tell me what you're going to work on.`)
- [ ] **Verify bot 1's first output**:
  - [ ] Statusline at the bottom shows `<colony>.<bot1-handle>` (e.g. `allavallc.buzz`)
  - [ ] Tab title shows the same
  - [ ] Bot reports its role as `PM + coder + tester (1/1)` (it's still alone right now)
- [ ] Wait ~30s so bot 1's first event is timestamped earlier than bot 2's
- [ ] In the panel, click Add-a-Bot again, copy Step 1. **Bot 2 spawns.** Paste Step 2 + Step 3.
- [ ] **Verify bot 2's first output**:
  - [ ] Statusline + tab title show `<colony>.<bot2-handle>`
  - [ ] Bot reports its role as `coder (2/2 in colony)`
- [ ] Tell bot 1 in its terminal: "Re-run my-work and re-check whoami." It should now report `PM + tester (1/2 in colony)`.

**Test (~10 min)**

- [ ] Tell bot 2 (coder): "Pick whatever's at the top of the available backlog and claim it."
- [ ] Bot 2 should run `claim.sh` and open a PR. Verify in the panel that the ticket moves to **In progress** with `Assigned to: <colony>.<bot2-handle>`.
- [ ] Bot 2 does the work and runs `in-review.sh`. Ticket moves to **In review** column.
- [ ] In the panel, click **Accept** on the in-review card. The card should jump to **Done** within ~1s (HV-075 optimistic placement).

**Health-monitor success signals (open the Swarm health panel section)**

- [ ] No `ROLE_PM_CLAIMING_2BOT` anomaly fires (PM didn't claim — correct)
- [ ] No `IN_REVIEW_EVENT_FILE_NOT_MOVED` fires (the buzz cherry-pick bug class)
- [ ] Both bots' event logs exist as `hive/events/<colony>.<bot{1,2}>.log`
- [ ] All `Assigned to` values in `hive/in-progress/` and `hive/in-review/` are qualified `<colony>.<handle>`

**Failure signals to watch for**

- [ ] Bot 1 (PM) tries to claim a ticket → `ROLE_PM_CLAIMING_2BOT` fires in Swarm health (expected behavior — invariant catches it)
- [ ] Bot 2's PR doesn't include code changes → `IN_REVIEW_EVENT_FILE_NOT_MOVED` fires (the bug class we explicitly hardened against)

**Rung 2 done when**
- [ ] At least one ticket has gone backlog → in-progress → in-review → done with bot 2 doing the coder work and bot 1 doing nothing on the claim path
- [ ] No critical or warning anomalies in the Swarm health panel
- [ ] Both bots' events logs grew with claim/in-review/done lines as expected

---

## Rung 3 — three bots in your colony, full role split

**What we're testing**
- Three bots respect the full split: PM (no claims), coder (claims), tester (reviews, no claims)
- Coder/tester can suggest tickets to PM via the suggestions inbox
- Human approves/rejects suggestions in the panel
- Health monitor flags role drift (PM claiming, tester claiming)

**Prereq**: rung 2 passed cleanly.

**Setup (~2 min beyond rung 2's bot 1 + bot 2)**

- [ ] Add-a-Bot a third time. **Bot 3 spawns.**
- [ ] **Verify bot 3's first output**:
  - [ ] Statusline + tab title show `<colony>.<bot3-handle>`
  - [ ] Bot reports its role as `tester (3/3 in colony)`
- [ ] Tell bot 1 to re-run whoami: should now be `PM (1/3 in colony)`
- [ ] Tell bot 2 to re-run whoami: should now be `coder (2/3 in colony)`

**Test A: basic 3-bot loop**

- [ ] Tell bot 2 (coder) to claim and ship a backlog ticket — same flow as rung 2.
- [ ] When bot 2 ships to in-review, tell bot 3 (tester): "Review the in-review ticket against its Done-when. Approve or reject per the tester rubric."
- [ ] Bot 3 reads the ticket + diff, updates `Reviewed by:` field, commits, pushes.
- [ ] In the panel, you accept the ticket → moves to **Done**.

**Test B: suggestion flow (FS-025)**

- [ ] Tell bot 2 (coder): "Write a suggestion to PM via note.sh: `@<colony>.<pm-handle> [SUGGESTION] we should add a button for X` (or any sensible idea)."
- [ ] In the panel, in the **Suggestions** section, click **+ File a suggestion** (admin-only manual entry — bot-side API auth ships in v2; for now you'll mirror what bot 2 wrote into the inbox by hand)
- [ ] Fill: suggester = `<colony>.<bot2>`, target PM = `<colony>.<bot1>`, message = the same suggestion text
- [ ] Submit. Pending suggestion appears in the inbox.
- [ ] Click **Reject** with a one-sentence reason → row moves to resolved/rejected
- [ ] Or click **Approve** → row marked approved (in v2 the PM bot would file the ticket; for v1 you'd manually file it)

**Health-monitor success signals**

- [ ] No `ROLE_PM_CLAIMING_3PLUS` (bot 1 didn't claim — correct)
- [ ] No `ROLE_TESTER_CLAIMING` (bot 3 didn't claim — correct)
- [ ] No `IN_REVIEW_EVENT_FILE_NOT_MOVED` anywhere
- [ ] All three bots' events logs exist + grew during the test
- [ ] Suggestion row exists in the DB and was resolved (verify via the inbox section)

**Failure signals to watch for**

- [ ] Bot 1 claims a backlog ticket → `ROLE_PM_CLAIMING_3PLUS` fires
- [ ] Bot 3 claims a backlog ticket → `ROLE_TESTER_CLAIMING` fires
- [ ] Suggestion never appears in the panel after manual file → API or panel-fetch bug
- [ ] Approve/Reject doesn't mark the suggestion resolved → API bug

**Rung 3 done when**
- [ ] At least one ticket has gone through the full coder→tester→human flow
- [ ] At least one suggestion has been filed, rendered, and resolved (approve or reject) via the panel
- [ ] No critical anomalies in Swarm health
- [ ] All three bots' role assignments held throughout (PM didn't drift to coder, etc.)

---

## After both rungs pass

- [ ] Shut down all three bots (`/exit` in each, close tabs)
- [ ] File any new bugs you found as backlog tickets (don't surface them as live anomalies — those resolve automatically)
- [ ] Report rung-2 and rung-3 verified to memory so the next session knows the swarm is operational

## What's NOT covered by these rungs

- **Cross-colony tests** (FS-024) — different humans' colonies on the same project
- **Long-running dormancy** (48h tests) — would need to wait or simulate
- **Visual regression** of the panel UI — eyeballs only, not part of the checklist
- **Automatic bot-to-API suggestion writes** (FS-025 v2) — current rung 3 uses manual file form

---

**Last updated**: 2026-05-10
