# CLAUDE.md

Thin shim for Claude Code sessions. The canonical, agent-neutral project rules live in [`AGENTS.md`](./AGENTS.md) — read that first.

Why this file is a stub instead of carrying the rules itself:

- `CLAUDE.md` is a Claude Code-specific filename. Other Claude Code users have their own personal `CLAUDE.md` and would have it overwritten on pull.
- Other agents (Codex, Cursor, Aider, Gemini, etc.) don't read `CLAUDE.md` at all — they'd miss the protocol entirely.
- The conventions are agent-neutral. The file they live in should be too.

If you're a Claude Code session: read `AGENTS.md`, then `hive/HIVE.md`, then `tasks/lessons.md`, then start work per the swarm protocol.

**Kickoff:** two equivalent triggers — execute the procedure in [`hive/bot-startup.md`](./hive/bot-startup.md) when either fires:

1. The operator types `start the hive` in chat (operator's main checkout, or any session not spawned via Add-a-Bot).
2. A `.bot-hive-kickoff` marker file exists at the worktree root (written by the Add-a-Bot spawn flow). One-shot — bootstrap consumes it.

Both paths are agent-neutral, no Claude-specific magic.
