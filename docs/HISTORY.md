# Project history — change-mate → Horde of Bots → Bot Horde

This file exists so a future Claude (or human) walking into this repo cold can rebuild the three-stage history of the project without digging through git log. It also points to where past per-machine memory lives, because Claude Code keys session memory on the absolute path to the working directory — and this project's path has changed twice.

---

## The three names

| Stage | Name | Directory | Ticket prefix | Spec file | Repo |
|---|---|---|---|---|---|
| 1 | `change-mate` | `change-mate/` | `CM-` | `CHANGEMATE.md` | `allavallc/change-mate` |
| 2 | Horde of Bots | `horde-of-bots/` | `HB-` | `HORDEOFBOTS.md` | `allavallc/horde-of-bots` |
| 3 | **Bot Horde** (current) | `bot-horde/` | `BH-` | `BOTHORDE.md` | `allavallc/bot-horde` |

GitHub redirects from each old URL to the current one, so old clones still work. Local remote URLs were updated each time as part of the rename.

## Why the renames happened

- **change-mate → Horde of Bots (2026-04-29).** The original name described the tool's outward purpose ("change management") but didn't convey what was actually distinctive: this is a coordination layer for multiple bots, not for tracking change requests. "Horde of Bots" named the audience.
- **Horde of Bots → Bot Horde (2026-04-30).** Pure brand iteration; "Bot Horde" reads cleaner than "Horde of Bots" — fewer words, same meaning. No technical motivation.

Both renames were **the user's call**. No technical pressure, no incompatibility forcing it.

## The 4-phase rename pattern

Both renames followed the same structure (and the same structure should be reused if it ever happens again):

1. **Phase 1** — flip `project_name` and `ticket_prefix` in `bot-horde/config.json`; repoint `origin` to the renamed GitHub repo. Trivial verification step.
2. **Phase 2** — directory rename + path-string rewrites across every tracked file. Excludes brand text.
3. **Phase 3** — ticket-prefix flip + ticket-file rename + content references inside ticket bodies and feature-set files.
4. **Phase 4** — brand copy ("Horde of Bots" → "Bot Horde"), env-var prefix, HTML/CSS/JS IDs (`hb-` → `bh-`), localStorage keys, CLAUDE.md import-block markers.

A docs cleanup pass closed the migration story for adopters: `MIGRATION.md` walks anyone on either previous name through the upgrade in one shell script, and `setup.sh` strips stale import-block markers in adopters' CLAUDE.md.

## What carried forward unchanged

These shipped pre-rename and survived both transitions intact:

- The walking-robot animation on in-progress cards
- The brutalist visual style (single rust accent, hairline borders, dash patterns for status)
- The auto-rebuild GitHub Action that regenerates the board on every push
- The PM skill (now at version 1.5.0) — including the brevity rule and grouped-by-feature-set backlog table format
- The full schema redesign from feature-set-010: `Verification`, `Failure-mode`, `Split-from`, dependency enforcement, commit-message provenance trailers, the validator
- All 80 tickets from the project's history (numbers preserved across CM-* / HB-* / BH-*)

## What was lost or sacrificed

- **Historical accuracy of old tickets.** Ticket files in `bot-horde/done/` were rewritten so old `CM-` and `HB-` references became `BH-`. Some prose in old tickets that described "the change-mate workflow" or "Horde of Bots files" was likewise rewritten. This matches the previous rename's precedent and prioritizes consistency over preservation. The git log preserves the original wording if anyone needs it.
- **Adopters' localStorage state.** Filter selections and the cached GitHub PAT reset once after each rename (key names changed: `cm_*` → `hb_*` → `bh_*`).

## The v3.0 directional decision

Mid-session, feedback arrived proposing a daemon-scale bot-native tracker (capability matching, scheduler, lease daemon, semantic dup detection, work-request endpoint, cross-repo coordination). After review, the daemon-scale items were **deliberately deferred to a separate project** that lives outside this repo. Bot Horde stays files-and-git, readable in an afternoon. The schema-only subset of that feedback shipped here as `feature-set-010-bot-native-schema`.

The standing rule for future sessions: if asked to add a CLI-as-primary-interface, scheduler, lease daemon, capability registry, or cross-repo coordination, push back. Those items belong in the user's separate v3.0 project.

## Audit queries (commit-message provenance)

Bot Horde commits to ticket-lifecycle actions carry `Model:` and `Trigger:` trailers in the commit body. `git log` is therefore a real audit trail:

```bash
# Full lifecycle of one ticket
git log --grep "Trigger: BH-074"

# Everything done by Claude models
git log --grep "Model: claude-"

# All completion events
git log --grep "Trigger: .* done"
```

See `bot-horde/BOTHORDE.md` → "Provenance trailers" for the full convention.

---

## Memory pointers (local-machine, for resuming Claude sessions)

Claude Code stores per-project session memory under `~/.claude/projects/<encoded-path>/memory/`. The encoded path is the absolute working directory with separators rewritten. Each rename of the local folder creates a fresh memory directory. Old memory directories don't get cleaned up automatically — they sit there until the user migrates or deletes them.

On this machine, the relevant memory directories are:

| Stage | Memory path |
|---|---|
| `change-mate/` | `C:\Users\adefilippo\.claude\projects\C--Users-adefilippo-MyDocuments-17-projects-change-mate\memory\` |
| `horde-of-bots/` | `C:\Users\adefilippo\.claude\projects\C--Users-adefilippo-MyDocuments-17-projects-horde-of-bots\memory\` |
| `bot-horde/` (current after the local rename) | `C:\Users\adefilippo\.claude\projects\C--Users-adefilippo-MyDocuments-17-projects-bot-horde\memory\` |

### Migration recipe (run once after each local-folder rename)

The same recipe was used for both transitions:

1. **Copy durable feedback memories** (these survive any rename — they encode user-preferences, not project state):
   - `feedback_always_list.md`
   - `feedback_no_overengineering.md`
   - `feedback_no_fixture_replication.md`
   - `feedback_surface_scope_cuts.md`

2. **Copy current project memories**:
   - `project_rename_v2.md` (rename completion record)
   - `project_fs010_in_flight.md` (the schema-redesign + board-honesty + test-infra closure record)
   - `project_hb010_parked.md` (BH-010 reviewer-LLM intentionally parked)
   - `todo_reevaluate_animations.md` (BH-011 forge animations rejected)
   - `test_setup.md` (pytest layout + CRLF gotcha)

3. **Copy `MEMORY.md`** (the index file) and **update its top section** to reflect the new directory path.

4. **Skip stale resume-point files**. Anything named `resume_point_*` from a prior rename describes a state that's been superseded — don't bring those forward.

5. **Sessions** (`*.jsonl` files, sibling to the `memory/` directory). These are conversation transcripts. Copy if you want `/resume` and `--continue` to find them; skip if you want a fresh start.

### What's safe to leave behind in old memory directories

- Old `resume_point_*.md` files (point-in-time snapshots that are now historical)
- Sessions older than the current project state (they reference paths and tickets that no longer exist)
- The whole old directory itself, eventually — once the migration is verified complete

The user typically deletes old project memory directories ~1–2 weeks after a rename, once they're confident nothing's missing.

---

## Pointers to current authoritative docs

This file is history. For live state, read these:

- `bot-horde/BOTHORDE.md` — workflow spec (single source of truth for how the workflow operates)
- `README.md` — outward-facing project overview
- `bot-horde/INSTALL-FAQ.md` — install-time questions
- `bot-horde/UPDATING.md` — bot-readable update procedure
- `MIGRATION.md` — adopter migration guide (handles all three names)
- `skills/product-manager/SKILL.md` — PM skill (drafts tickets; loaded by Claude Code if installed)
- `bot-horde/MANIFEST.json` — version map of every managed file (drives upgrade detection)
- `bot-horde/feature-sets/` — the project's strategic-grouping records
- `bot-horde/done/` — archive of every ticket ever shipped
