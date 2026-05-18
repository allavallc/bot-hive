# Bot Hive — Hindsight Memory Architecture

**For:** Claude Code  
**Purpose:** Implement role-scoped persistent memory using Hindsight (local, no Docker) into the Bot Hive role system  
**Status:** Architecture spec — implement from this document

---

## The problem this solves

Bot Hive bots currently start every session with no memory of past sessions. This creates two failure modes:

1. **Structural failures** — the PM omits required ticket sections, the tester passes tickets without checking all acceptance criteria. These are fixed by better skill file instructions (checklists, required fields, self-verification steps). Memory does not fix this — instructions do.

2. **Pattern failures** — the tester keeps missing a specific class of bug. The PM keeps writing tickets that get rejected for the same reason. These failures *are* fixed by memory, because they represent learned patterns that should compound over time.

This architecture addresses both. Instructions enforce structure. Memory improves judgment over time. Both are required. Neither substitutes for the other.

---

## The closed loop principle

Without memory, each bot session is an open loop:

```
Instruction → Work → Output → (nothing feeds back)
```

With memory, each bot session is a closed loop:

```
Instruction + Past Learnings → Work → Output → Outcome captured → Retained to memory
                ↑                                                          ↓
                └──────────────────────────────────────────────────────────┘
```

The loop closes when: outcomes from past sessions inform the behavior of future sessions. This is the mechanism that makes bots improve over time rather than repeat the same mistakes.

---

## Hindsight setup — local, no Docker

Hindsight runs as a local embedded daemon with built-in PostgreSQL. No Docker required.

**Installation:**
```bash
pip install hindsight-all
```

**Start the daemon (first time, takes ~60 seconds):**
```bash
hindsight start --llm-provider openai --llm-api-key $OPENAI_API_KEY
# or use anthropic / groq / ollama for the LLM provider
```

**Verify it's running:**
```bash
curl http://localhost:9077/health
```

The daemon starts automatically on first bot session and stops after idle timeout. Subsequent startups are fast. All data lives in `~/.hindsight/`.

**Environment variables to add to `.env` and `.env.example`:**
```
HINDSIGHT_API_URL=http://localhost:9077
HINDSIGHT_LLM_PROVIDER=openai        # or anthropic, groq, ollama
HINDSIGHT_LLM_API_KEY=your-key-here
```

No `HINDSIGHT_API_KEY` needed for local mode.

---

## Memory bank design

Three banks, one per role. Any bot assigned that role reads from and writes to the same bank regardless of colony, session, or agent type (Claude Code, Codex, etc.).

| Role | Bank ID | What accumulates |
|---|---|---|
| PM | `role-pm` | Ticket patterns that get rejected, checklist items commonly missed, human preference signals |
| Coder | `role-coder` | Codebase gotchas, implementation patterns, recurring errors and fixes, architectural constraints |
| Tester | `role-tester` | Bug classes commonly missed, acceptance criteria patterns that pass but shouldn't, rejection reasons |

**Create the three banks once at project setup:**

```bash
# PM bank
curl -X PUT http://localhost:9077/v1/default/banks/role-pm \
  -H "Content-Type: application/json" \
  -d '{
    "retain_mission": "Extract and store: ticket sections that were missing or incorrect, human rejection patterns and reasons, checklist items the PM commonly forgets, preference signals from the human operator about ticket quality.",
    "reflect_mission": "Synthesize what the PM role has learned: what makes a good ticket in this project, what gets rejected, and what the human operator cares about most."
  }'

# Coder bank
curl -X PUT http://localhost:9077/v1/default/banks/role-coder \
  -H "Content-Type: application/json" \
  -d '{
    "retain_mission": "Extract and store: implementation decisions and why they were made, codebase patterns and conventions discovered, recurring errors and their fixes, architectural constraints, gotchas in dependencies.",
    "reflect_mission": "Synthesize what the coder role has learned about this codebase: patterns, constraints, and implementation conventions a new coder bot should know."
  }'

# Tester bank
curl -X PUT http://localhost:9077/v1/default/banks/role-tester \
  -H "Content-Type: application/json" \
  -d '{
    "retain_mission": "Extract and store: bugs that were missed in review, categories of defects this codebase is prone to, acceptance criteria that passed but contained errors, patterns of what commonly fails after approval.",
    "reflect_mission": "Synthesize what the tester role has learned: what bug classes to always check, which ticket types need extra scrutiny, and what patterns of failure recur in this codebase."
  }'
```

---

## Helper scripts

### `scripts/hindsight-recall.sh`

Called before any work begins. Injects past learnings into the session.

```bash
#!/usr/bin/env bash
# Usage: scripts/hindsight-recall.sh <role> [query]
# Prints recalled memories to stdout. Always exits cleanly.

set -euo pipefail

ROLE="${1:-}"
QUERY="${2:-session start}"

if [ -z "$ROLE" ]; then
  echo "[hindsight] no role supplied, skipping recall" >&2
  exit 0
fi

API_URL="${HINDSIGHT_API_URL:-http://localhost:9077}"

# Start daemon if not running
curl -sf "$API_URL/health" >/dev/null 2>&1 || {
  echo "[hindsight] daemon not running, attempting start..." >&2
  hindsight start --llm-provider "${HINDSIGHT_LLM_PROVIDER:-openai}" \
    --llm-api-key "${HINDSIGHT_LLM_API_KEY:-}" &>/dev/null &
  sleep 5
}

BANK_ID="role-${ROLE}"

RESPONSE=$(curl -sf -X POST \
  "$API_URL/v1/default/banks/$BANK_ID/memories/recall" \
  -H "Content-Type: application/json" \
  -d "{\"query\": $(echo "$QUERY" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))'), \"budget\": \"mid\"}" \
  2>/dev/null) || {
  echo "[hindsight] recall failed, continuing without memory" >&2
  exit 0
}

MEMORY=$(echo "$RESPONSE" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(d.get('answer',''))
" 2>/dev/null || echo "")

if [ -n "$MEMORY" ]; then
  echo "--- Learnings from past sessions (role: $ROLE) ---"
  echo "$MEMORY"
  echo "--- End learnings ---"
fi
```

```bash
chmod +x scripts/hindsight-recall.sh
```

### `scripts/hindsight-retain.sh`

Called after work is complete. Writes the session's learnings back to memory.

```bash
#!/usr/bin/env bash
# Usage: scripts/hindsight-retain.sh <role> <text>
# Always exits cleanly — never blocks work.

set -euo pipefail

ROLE="${1:-}"
TEXT="${2:-}"

if [ -z "$ROLE" ] || [ -z "$TEXT" ]; then
  echo "[hindsight] missing args, skipping retain" >&2
  exit 0
fi

API_URL="${HINDSIGHT_API_URL:-http://localhost:9077}"
BANK_ID="role-${ROLE}"

curl -sf -X POST \
  "$API_URL/v1/default/banks/$BANK_ID/memories/retain" \
  -H "Content-Type: application/json" \
  -d "{\"text\": $(echo "$TEXT" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))'), \"type\": \"experience\"}" \
  >/dev/null 2>&1 || {
  echo "[hindsight] retain failed, continuing" >&2
  exit 0
}

echo "[hindsight] retained to $BANK_ID"
```

```bash
chmod +x scripts/hindsight-retain.sh
```

### PowerShell equivalents

Create `scripts/hindsight-recall.ps1` and `scripts/hindsight-retain.ps1` as Windows equivalents with identical contracts. Same args, same stdout behavior, same graceful failure.

---

## How memory integrates into the work lifecycle

This is the critical section. Memory must be consulted **before work begins** and written **after work ends**. It is not optional or conditional — both steps are mandatory in the skill files.

```
SESSION START
     │
     ▼
[1] Bot receives role assignment from server
     │
     ▼
[2] Bot reads skill file for its role
    (hive/skills/<role>.md)
     │
     ▼
[3] *** MEMORY RECALL ***
    Bot calls: scripts/hindsight-recall.sh <role> "<task context>"
    Output is injected as context before any work begins
    If recall returns nothing: continue normally
    If recall returns learnings: treat as background context
    that informs judgment — not as new instructions
     │
     ▼
[4] Bot does its work per skill file instructions
     │
     ▼
[5] Bot produces output (ticket / code / review)
     │
     ▼
[6] Outcome occurs (human accepts / rejects / points out error)
     │
     ▼
[7] *** MEMORY RETAIN ***
    Bot retains a 2-5 sentence summary of what was learned
    Called at sign-off via bot-shutdown.md
     │
     ▼
SESSION END
     │
     ▼
(next session for this role inherits the retained learning)
```

---

## Skill file changes required

### All three skill files — add memory recall as Step 1

At the top of each skill file (`hive/skills/pm.md`, `hive/skills/coder.md`, `hive/skills/tester.md`), before any work instructions, add:

```markdown
## Step 1 — Load role memory before starting

Before doing any work this session, load accumulated learnings from past sessions:

\```bash
scripts/hindsight-recall.sh "<your-role>" "<brief description of the work you are about to do>"
\```

Read the output carefully. These are patterns learned from real past sessions in this role:
- What went wrong and why
- What the human operator flagged as incorrect
- What this codebase is prone to

Treat this as background judgment — it informs how you approach your work.
It does not override your skill file instructions or the current task.
If nothing is returned, continue normally.
```

### PM skill file — add structural enforcement

The PM skill file must enforce ticket completeness as a hard gate, not a suggestion. Add a self-verification checklist that the PM must run against every ticket before filing:

```markdown
## Ticket self-verification (mandatory before filing)

Before filing any ticket, verify every item below. A ticket with any unchecked
item must not be filed — fix it first.

[ ] Title is specific and action-oriented
[ ] Problem statement is written (what is broken or missing, not how to fix it)
[ ] Acceptance criteria are written as testable statements (not vague goals)
[ ] FE impact assessed (even if answer is "none — backend only")
[ ] BE impact assessed (even if answer is "none — frontend only")
[ ] Out-of-scope section present (what this ticket explicitly does NOT cover)
[ ] Effort estimate present
[ ] Feature set assigned or explicitly marked "no FS"

Do not ask for confirmation. Run this check yourself and fix what's missing.
```

### Tester skill file — add per-criterion review gate

The tester must review each acceptance criterion individually and produce a line-by-line verdict. Add:

```markdown
## Review procedure (mandatory)

1. Copy the acceptance criteria from the ticket verbatim.
2. For each criterion, write: PASS or FAIL + one sentence of evidence.
3. A review with any criterion left unaddressed is incomplete and cannot be submitted.
4. If a criterion is ambiguous, mark it UNCLEAR and write what clarification is needed.

A ticket passes only when every criterion has a PASS verdict.
A ticket fails if any criterion is FAIL or UNCLEAR.

Do not write a summary verdict without completing the per-criterion list first.
```

### Coder skill file — add pre-claim recall

Before claiming a ticket, the coder should recall relevant codebase context:

```markdown
## Before claiming a ticket

Run recall with the ticket's subject as the query:

\```bash
scripts/hindsight-recall.sh coder "<ticket title or key terms>"
\```

Check whether past sessions have learned anything relevant to this area of the codebase
before starting implementation. This prevents rediscovering known gotchas.
```

---

## `hive/bot-startup.md` changes

Add between the existing Step 4 (read skill files and announce) and Step 5 (consume kickoff marker):

```markdown
## Step 4b — Load role memory

After reading skill files and announcing, load accumulated role learnings:

\```bash
# POSIX
scripts/hindsight-recall.sh "<role-from-notice>" "session start for <role>"

# PowerShell
& scripts/hindsight-recall.ps1 -Role "<role-from-notice>" -Query "session start for <role>"
\```

For consolidated roles (solo bot with PM+coder+tester), run recall for each:

\```bash
for r in pm coder tester; do scripts/hindsight-recall.sh "$r" "session start"; done
\```

If the script fails or returns nothing: continue normally.
Memory is additive — its absence never blocks a session.
```

---

## `hive/bot-shutdown.md` changes

Add before the final "Signed off. Safe to close this window." line:

```markdown
## Final step — retain session learnings

Before closing, write a 2–5 sentence summary of what was learned or discovered
this session to the role memory bank.

**What to retain (durable facts that compound):**
- A bug class or failure pattern discovered this session
- A ticket rejection reason and what was missing
- A codebase gotcha that cost time to discover
- A human operator preference signal observed this session
- An acceptance criterion pattern that was passed but should have been caught

**What NOT to retain:**
- Task logs ("I ran npm test, it passed")
- Things that change per session (seat, handle, colony)
- Anything already in tasks/lessons.md — don't duplicate it
- Vague summaries ("did good work today")

\```bash
# POSIX
scripts/hindsight-retain.sh "<role>" "<your 2-5 sentence summary of durable learnings>"

# PowerShell
& scripts/hindsight-retain.ps1 -Role "<role>" -Text "<your summary>"
\```

For consolidated roles, retain to each relevant bank separately.
If the script fails: continue to sign-off. Memory failure never blocks shutdown.
```

---

## How instructions and memory work together — the full picture

```
YOU (project owner)
    │
    ├── Write skill files          ← defines correct behavior (structure, checklists, gates)
    │   hive/skills/pm.md              this is the floor — what bots must always do
    │   hive/skills/coder.md
    │   hive/skills/tester.md
    │
    └── Create Hindsight banks     ← defines what to learn (retain_mission per bank)
        role-pm
        role-coder
        role-tester

BOT SESSION
    │
    ├── Reads skill file           ← gets the rules (your instructions)
    │
    ├── Recalls memory             ← gets the learnings (accumulated experience)
    │       ↓
    │   skill file + memory = informed judgment
    │
    ├── Does work
    │
    ├── Produces output
    │       ↓
    │   [outcome: human accepts, rejects, points out error]
    │
    └── Retains learnings          ← closes the loop

OVER TIME
    │
    ├── role-pm bank grows:
    │       "tickets missing FE impact get rejected"
    │       "PM tends to skip out-of-scope section"
    │       "human prefers acceptance criteria as numbered lists"
    │
    ├── role-tester bank grows:
    │       "auth tickets consistently have token expiry edge cases"
    │       "webhook tickets need race condition checks"
    │       "this codebase has a known async issue in src/lib/sync.ts"
    │
    └── role-coder bank grows:
            "Drizzle requires db:migrate before schema tests"
            "rapid webhook delivery triggers race condition — HV-160"
            "never use Set-Content with utf8 on PowerShell — adds BOM"

RESULT: Each new bot session starts with the floor (instructions)
        PLUS the accumulated ceiling (memory). Both improve independently.
        Instructions improve when you edit the skill files.
        Memory improves automatically as bots work.
```

---

## What this does NOT do

Be explicit with Claude Code about these boundaries:

- Memory does not replace skill file instructions. If the skill file doesn't mandate the FE/BE checklist, memory cannot enforce it.
- Memory does not self-curate. Whatever gets retained gets retained. The quality of what's in the bank depends on the quality of what bots write at sign-off. The retain step in `bot-shutdown.md` must guide bots to write durable facts, not session logs.
- Memory is not real-time. A learning retained in one session is available to the next session — not to the current one.
- The daemon must be running locally before bots start. The recall script attempts to start it if not running, but on a cold machine the first startup takes ~60 seconds.

---

## Files to create or modify — complete list

| File | Action | What changes |
|---|---|---|
| `scripts/hindsight-recall.sh` | Create | Recall helper — called before work |
| `scripts/hindsight-recall.ps1` | Create | Windows equivalent |
| `scripts/hindsight-retain.sh` | Create | Retain helper — called at sign-off |
| `scripts/hindsight-retain.ps1` | Create | Windows equivalent |
| `hive/skills/pm.md` | Modify | Add Step 1 memory recall + ticket self-verification checklist |
| `hive/skills/tester.md` | Modify | Add Step 1 memory recall + per-criterion review gate |
| `hive/skills/coder.md` | Modify | Add Step 1 memory recall + pre-claim recall |
| `hive/bot-startup.md` | Modify | Add Step 4b — load role memory after skill files |
| `hive/bot-shutdown.md` | Modify | Add final retain step before sign-off |
| `.env.example` | Modify | Add HINDSIGHT_API_URL, HINDSIGHT_LLM_PROVIDER, HINDSIGHT_LLM_API_KEY |
| `docs/hindsight-setup.md` | Create | One-time setup instructions for the three banks |

---

## Acceptance criteria for this implementation

Claude Code should verify the following before considering this complete:

- [ ] `scripts/hindsight-recall.sh` exits cleanly when daemon is not running
- [ ] `scripts/hindsight-retain.sh` exits cleanly on network failure
- [ ] All three role banks exist and have retain_mission set
- [ ] All three skill files have memory recall as Step 1
- [ ] `hive/bot-startup.md` Step 4b is present and correct
- [ ] `hive/bot-shutdown.md` retain step is present with correct guidance
- [ ] PM skill file has the full self-verification checklist
- [ ] Tester skill file has the per-criterion review gate
- [ ] Round-trip test passes: retain a fact → recall it in new session → fact appears
