# [feature-set-014] Agent abstraction — protocol must work for any LLM, not just Claude

## Goal
Bot Hive's coordination protocol — every convention, ticket, doc, and example — must be readable and executable by any agent (Claude, Codex, GPT-family, Aider, Cursor, Gemini, future models). Today's docs were drafted while Claude Code was the only agent, so prose, examples, and tooling references quietly assume it. This FS is a sweep that scrubs the assumption.

## Rationale
The product *is* the protocol. If the protocol assumes Claude, the moment a second agent type joins the swarm they fail — silently, by reading text that doesn't apply to them. The split between `AGENTS.md` (any-agent) and `CLAUDE.md` (Claude shim) was created exactly so non-Claude agents read the right file, but the actual content of `AGENTS.md` and `hive/HIVE.md` still leaks Claude-specific concepts in places (skill invocations, "Claude Code session" prose, `Co-Authored-By: Claude Opus 4.7` example trailers).

A grep audit during 2026-05-06 found the leaks; this FS holds the cleanup work plus a positive direction (document the agent-shim pattern so future agents know how to integrate cleanly).

## Tickets
**HV-067** — `hive/HIVE.md`: replace Claude-specific identity prose ("Claude Code session" → "agent session"; reword passages that assume Claude is the only kind of bot).

**HV-068** — `hive/HIVE.md`: skill references → generic "host-specific helper" concept. The "invoke the `product-manager` skill" / "the `acceptance-tester` skill" lines assume Claude Code's skill system; rewrite as "invoke the host's ticket-drafting helper" / etc., with the Claude `skills/...` paths moved to a footnote / appendix as one possible implementation.

**HV-069** — `hive/HIVE.md`: provenance trailers — agent-neutral examples. The `Co-Authored-By: Claude Opus 4.7 ...` example block hardcodes Claude; replace with examples covering multiple agent types so adopters see the pattern, not the brand.

(More tickets may be added as the audit deepens — this FS is the home.)

## Status
Active — three cleanup tickets filed, ready to claim.

## Notes
- The model identifier in commit trailers (e.g., `Model: claude-opus-4-7`, `Model: gpt-5-codex`) is itself agent-neutral — the slot is generic; example values are illustrative. Don't overcorrect by removing model identifiers entirely.
- `CLAUDE.md` should remain a thin shim and may legitimately reference Claude-specific tooling (it's the Claude shim, by design). The cleanup is for `AGENTS.md` and `hive/HIVE.md` — the agent-neutral surfaces.
- Conventions like the per-session handle, the `presence.log` format, and the hot-file pre-edit check are already agent-neutral. The cleanup is mostly textual.

## Architecture & decisions

### 2026-05-06 — Filed (nectar)

Triggered by user feedback: "CC2 is Claude Code right now, but it could be Codex, GPT, Aider, Gemini, anything. Everything you do MUST be abstracted from Claude — it has to be something any bot / LLM would be able to understand." Audit run; three cleanup tickets identified covering the prose-level leaks. Larger structural moves (e.g., bot capability negotiation, agent-feature-detection) are explicitly out of scope — agent-neutrality is achieved through written discipline + the existing shim pattern, not through a runtime abstraction layer.
