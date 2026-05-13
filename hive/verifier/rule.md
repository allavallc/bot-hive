# The verifier protocol

Agent-neutral rule. Applies to every AI agent (Claude Code, Codex, Cursor, Gemini, etc.) operating in this repo.

## Hard rules

1. **Before EVERY user-facing response, spawn a verifier agent** (Agent tool / Task tool / equivalent) that fact-checks the claims about to be made. Only verified content gets sent. No carve-outs — conversational acknowledgments included. The discipline is the spawn, not the gating.

2. **Every factual claim about repo / PR / file / branch / function / code state must end with `(verified: <command>)`** where the command actually ran this session, OR be prefixed `Unverified —`. The verifier checks this discipline.

3. **For destructive recommendations** (close PR, delete, drop, force-push, supersede, archive), `Unverified —` is NOT acceptable. You must verify.

4. **Title / name / one-liner ≠ behavior.** Before saying "X is superseded by Y" or "X is equivalent to Y", diff X and diff Y. Same for "X is missing", "X is in main", "X already shipped."

5. **Do NOT announce the spawn.** No phrases like "spawning the verifier" or "let me check this first." The Agent tool call is the visible evidence — narration is noise without signal.

## Boundary

The verifier check applies to:
- Repo/PR/file/branch/code state claims
- Recommendations to close, delete, supersede, merge, drop, force-push, archive
- Behavior claims about functions, hooks, scripts, endpoints
- Existence claims ("X exists", "there's no Y")

The verifier returns "nothing to verify, proceed" for:
- Acknowledgments
- Asking the user a question
- Capability/preference questions
- Structural conversation moves

The spawn still happens in the "nothing to verify" case. Skipping the spawn defeats the protocol.

## Why

Agents that rely on self-discipline to verify keep failing. Pattern-matching from partial context produces plausible-sounding wrong answers. Structural pre-flight check by a separate agent (no shared context) catches what the originating agent would miss. See `lessons.md` for concrete failure cases.

## Backstops (Claude Code)

A Stop hook flags messages that slipped through (e.g. agent forgot to spawn). A PreToolUse hook blocks destructive Bash unless the target was inspected earlier. See `hooks/claude-code/`.

Other agents' harnesses need their own backstops. The protocol still applies without them — the backstops just enforce it structurally instead of relying on the agent's self-discipline.
