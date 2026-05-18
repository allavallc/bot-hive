# CLAUDE.md

Thin shim for Claude Code sessions. The canonical, agent-neutral project rules live in [`AGENTS.md`](./AGENTS.md) — read that first.

Why this file is a stub instead of carrying the rules itself:

- `CLAUDE.md` is a Claude Code-specific filename. Other Claude Code users have their own personal `CLAUDE.md` and would have it overwritten on pull.
- Other agents (Codex, Cursor, Aider, Gemini, etc.) don't read `CLAUDE.md` at all — they'd miss the protocol entirely.
- The conventions are agent-neutral. The file they live in should be too.

If you're a Claude Code session: read `AGENTS.md`, then `hive/HIVE.md`, then `hive/seats.md` (FS-028 — bot identity, seat assignment, sign-off — shipped 2026-05-12), then `tasks/lessons.md`, then start work per the swarm protocol.

**Kickoff:** two equivalent triggers — execute the single procedure in [`hive/bot-startup.md`](./hive/bot-startup.md) when either fires:

1. The operator types `start the hive` in chat.
2. A `.bot-hive-kickoff` marker file exists at the worktree root. One-shot — bootstrap consumes it.

The server assigns your handle and role. Both triggers run the same procedure — no Procedure A/B split. Agent-neutral, no Claude-specific magic.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- ALWAYS read graphify-out/GRAPH_REPORT.md before reading any source files, running grep/glob searches, or answering codebase questions. The graph is your primary map of the codebase.
- IF graphify-out/wiki/index.md EXISTS, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
