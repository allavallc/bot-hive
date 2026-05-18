# Step 3 Setup: Task-Level Outcome Logging

## What you are building

A lightweight logging system so we can track when you declare a task done and what gets found afterward. This is an internal ops tool, not an application feature.

---

## Instructions

### 1. Create the folder and current log file

Create `hive/outcomes/current.md` with this structure:

```markdown
# Agent Outcome Log

| date | task_summary | declared_done | bugs_found_after | how_found | root_cause |
|------|-------------|---------------|-----------------|-----------|------------|
```

### 2. Seed it with one row

Add the following row as the first entry — this is a real example from a recent session:

| date | task_summary | declared_done | bugs_found_after | how_found | root_cause |
|------|-------------|---------------|-----------------|-----------|------------|
| 2026-05-16 | Added session_id field to bot identity and startup docs | yes | session_id missing from bot-startup.md notice example | human prompted "check again" | shallow verification — ran tsc/vitest but did not cross-reference doc examples against writer code |

### 3. Add a rule to AGENTS.md

In the Verification Protocol section at the top of AGENTS.md, add:

```markdown
## Outcome Logging

When you complete any task, append one row to `hive/outcomes/current.md`:
- date: today's date (YYYY-MM-DD)
- task_summary: one sentence
- declared_done: yes
- bugs_found_after: leave blank
- how_found: leave blank
- root_cause: leave blank

The human fills in the last three columns. Do not assess your own root cause.
```

### 4. Add a monthly archive rule to AGENTS.md

In the same section, add:

```markdown
## Monthly Archive

At the start of each month, if `hive/outcomes/current.md` contains rows from the prior month:
1. Copy it to `hive/outcomes/YYYY-MM.md` (prior month)
2. Reset `hive/outcomes/current.md` to the empty table structure
```

### 5. Add a monthly review rule to AGENTS.md

```markdown
## Monthly Review

When asked for a "monthly agent review", read all files under `hive/outcomes/` 
and produce a summary of:
- Top 3 recurring root causes
- How many tasks declared done vs bugs found afterward
- Recommended additions or changes to this AGENTS.md verification protocol

This summary is used to update AGENTS.md. It is the closed loop.
```

---

## What you do NOT need to build

- No script
- No automation
- No database
- No UI

The markdown table is correct. The human annotates it manually. That's intentional.

---

## When done

Confirm:
- [ ] `hive/outcomes/current.md` exists with the correct table structure
- [ ] Seed row is present
- [ ] Three rule blocks added to AGENTS.md verification section
- [ ] Nothing else was changed
