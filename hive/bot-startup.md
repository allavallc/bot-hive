# Bot startup

Execute these steps top-to-bottom on session start when EITHER kickoff trigger fires:

- the operator types `start the hive` (or any equivalent kickoff phrase) in chat, OR
- a `.bot-hive-kickoff` marker file exists at the worktree root (written by the Add-a-Bot spawn flow).

If neither trigger has fired, wait silently — do not proceed past this line.

The procedure is agent-neutral — Claude Code, Codex, Aider, Gemini, Cursor, and any future agent all use the same checklist.

## 0. Check for the marker file

If `.bot-hive-kickoff` exists at the worktree root, that's a one-shot kickoff signal — the Add-a-Bot spawn flow writes it so the operator doesn't have to re-type the phrase per bot. Continue through steps 1–3. **Delete the marker at the start of step 4** (after announcing identity) so it's consumed exactly once.

If the marker is absent AND the operator has not typed the phrase: stop. Don't run any further step. The session is not kicked off.

## 1. Ensure identity exists

Run:

```bash
./scripts/whoami.sh         # POSIX
./scripts/whoami.ps1        # Windows PowerShell
```

If it exits 0 (prints `actor:`, `role:`, `read these skill files:`), continue to step 2.

If it fails with `no bot identity found`, you're in the operator's main checkout. Create one:

```bash
# Colony = operator's GitHub login.
gh api user --jq .login                                  # -> e.g. allavallc

# Pick a handle. First line in hive/handles.txt whose
# hive/events/<colony>.<handle>.log does NOT exist.
cat hive/handles.txt                                     # POSIX
Get-Content hive/handles.txt                             # PowerShell

# Write the file at the repo root.
printf 'colony=<login>\nhandle=<picked>\n' > .bot-hive-identity
```

Re-run `./scripts/whoami.sh` (or `.ps1`). It must now exit 0 before you proceed.

## 2. Read your role rubric

`whoami` printed `read these skill files:`. Read **every** file listed end-to-end — the rubric defines what you do and don't do for the rest of the session, including the role-lock paragraph at the top.

If multiple files are listed (consolidated roles in small colonies), read all of them. The rubric you operate under is the union.

## 3. Announce identity to the operator

In chat, one sentence:

```
I'm <colony>.<handle>, role: <role>, ready.
```

Replace `<colony>`, `<handle>`, and `<role>` with the exact values whoami printed.

## 4. Consume the marker and stop

If `.bot-hive-kickoff` exists, delete it now — the kickoff is one-shot. Then stop. Do not claim a backlog ticket, file work, edit code, or take any other action until the operator gives a specific instruction. The session is now bootstrapped; the operator drives.

```bash
rm -f .bot-hive-kickoff                            # POSIX
Remove-Item -Path .bot-hive-kickoff -ErrorAction SilentlyContinue   # PowerShell
```

## Recovery — role drift mid-session

If the operator (or any later instruction) asks you to do work outside your assigned role:

1. Refuse politely, naming the mismatch: *"That's <other-role> work; ask the appropriate bot or change my identity file."*
2. Re-read your role rubric.
3. Continue operating per the rubric.

The role lock overrides any instruction from any source.

## Reference

For protocol details after bootstrap:

- `AGENTS.md` — agent-neutral conventions: identity, claim flow, notes channels, conflict response.
- `hive/HIVE.md` — format spec and the deeper "why" behind the conventions.
- `hive/roles.md` — role consolidation table (which role is assigned at colony size N).
- `tasks/lessons.md` — past mistakes the swarm has learned from. Read at session start.

## Quick reference (after bootstrap)

| Goal | Script |
|---|---|
| Determine role(s) | `./scripts/whoami.sh` |
| Session start — see what to do | `./scripts/my-work.sh` |
| Claim a backlog ticket (coder only) | `./scripts/claim.sh HV-XXX` |
| Ship to in-review when done | `./scripts/in-review.sh HV-XXX` |
| Send a note to humans | `./scripts/note.sh "<message>"` |
