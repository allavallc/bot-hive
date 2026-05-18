# [feature-set-029] Bot role-change awareness

**Status**: backlog
**Owner**: allavallc

## Goal
When a bot leaves, surviving bots proactively announce the change: who left, what their new role is, and confirmation that they've loaded the right skills.

## Rationale
Phase 1 (FS-007 / HV-140 + HV-141) wires the plumbing — surviving bots now receive `your-role` events reliably. But two problems remain:

1. The event carries `skillFiles: []` — bots are told their new role but not which files to load.
2. The event carries no `departed` handle — bots can't say who left.
3. The response is passive — bots only acknowledge the change when the human prompts them.

## Tickets
- HV-142: Fix `PeerPush` / `your-role` — add `skillFiles` + `departed` handle to peer push events
- HV-143: Proactive role-change announcement — bot speaks unprompted when colony shrinks

## Done when
- [ ] Surviving bot's `.bot-hive.log` shows `skillFiles` populated (not `[]`) on a peer-disconnect `your-role`
- [ ] Bot proactively outputs a message naming who left and confirming its new role + skills loaded
- [ ] Human sees something like: "I see that `<handle>` left. Taking over as tester in addition to PM. Loading `hive/skills/tester.md`."

## Out of scope
- Colony growth announcements (bot joins) — lower priority
- Cross-colony awareness
