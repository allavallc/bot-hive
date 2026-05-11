# [feature-set-021] Per-colony focus

**Status**: active
**Owner**: allavallc

## Goal
Replace the global `hive/focus.md` with per-colony focus files at `hive/colonies/<github-login>/focus.md`. Each bot reads its own colony's focus file (resolved from `.bot-hive-identity`) at session start. Two humans on the same project no longer fight over one focus file.

## Rationale
Per ADR-003 (colony model), every bot belongs to a colony, and the colony is scoped to a human's GitHub login. Direction is per-human: I tell my colony of bots what to work on; Tony tells his. A single shared focus file forces both humans to coordinate every edit, which defeats the colony model. Per-colony files make the surface area match the responsibility.

## Tickets (skeletons)
- HV-XXX: Migrate `hive/focus.md` → `hive/colonies/allavallc/focus.md` (preserve current contents). File migration only, no code change.
- HV-XXX: Bot session-start (in `bot-startup.md` + `my-work.{sh,ps1}`) reads `hive/colonies/<colony>/focus.md`. Logs a one-line warning + falls back to empty if the file is missing. No fallback to legacy global path — clean break.
- HV-XXX: Update `AGENTS.md` + `HIVE.md` references from "global focus.md" to "per-colony focus".
- HV-XXX: Panel widget (later) — let humans edit their colony's focus from the project page. Out of scope for this FS; file as future work.

## Done when (rung-1 dependency)
- [ ] `hive/focus.md` no longer exists; `hive/colonies/allavallc/focus.md` exists with the migrated content
- [ ] `my-work.ps1` + `my-work.sh` read the per-colony file (verified by spawning a bot and checking the output mentions colony focus)
- [ ] `bot-startup.md` no longer references `hive/focus.md`
- [ ] **Local test**: spawn buzz, verify it picks up the colony's focus correctly

## Out of scope (this FS)
- UI for editing colony focus from the panel (future)
- Multi-file colony state beyond focus.md (future)
- Cross-colony focus discovery (PMs already check Owner field on FS files; no new mechanism needed)

## Test rung this unlocks
Rung 1 (1 bot end-to-end), in combination with FS-022.
