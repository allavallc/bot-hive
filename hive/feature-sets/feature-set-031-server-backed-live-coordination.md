# [feature-set-031] Server-backed live coordination

**Status**: active
**Owner**:

## Goal

Move live bot coordination out of repo files and into Bot Hive server state while keeping GitHub as the durable delivery/audit substrate.

## Rationale

The repo is the right place for final artifacts: code, PR history, accepted ticket state, and durable decisions. It is the wrong place for mid-session operational state such as questions, handoffs, blockers, review requests, and role-targeted instructions. Those need low-latency delivery to terminal agents and the board. This feature set makes the server the live communication layer using the existing SSE + REST direction, without requiring Bot Hive to host user agents.

## Architecture mapping

Maps to `plan/codex-architecture.md`:

- Section 2, Bot Hive server layer: live coordination, messages, handoffs, blockers, and review requests.
- Section 4, Event-driven workflow: SSE for server-to-agent events and REST for agent-to-server messages.
- Section 5, Live dev state: questions, handoffs, review requests, soft claims, and blockers belong in Postgres-backed server state.
- Section 9, Near-term improvement path: two-way live messaging first, then board rendering, merge gates, and context injection.

## Tickets

- HV-147 - Bot-to-server live event API
- HV-148 - Swarm panel live-event rendering
- HV-149 - Tester approval merge gate
- HV-150 - Server-side context injection on task handoff

## Status

Active

## Architecture & decisions

### 2026-05-14 - Split live coordination from durable project state (codex)

**Choice:** Bot Hive server owns live coordination state; GitHub owns durable delivery artifacts.

**Rejected:** Using repo files as the primary communication layer for questions, handoffs, and review routing. File-based coordination is auditable but too slow and too lossy for live multi-agent teamwork.

**Why:** The human starts agents in terminals/VSCode, not from the web. Those agents need realtime coordination without Bot Hive hosting them. SSE + REST fits that model: server pushes role/handoff/review events; agents POST claims, questions, blockers, and outcomes.

**Implications:** New live events land in Postgres and broadcast immediately. Durable ticket lifecycle and code still flow through GitHub/PR/CI.

**Reference:** plan/codex-architecture.md / HV-147.
