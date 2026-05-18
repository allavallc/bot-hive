# [feature-set-030] Server-assigned bot identity and single startup procedure

**Status**: active
**Owner**:

## Goal

Make bot startup impossible to fail. Every bot — PM, coder, tester — starts through one startup procedure. The server assigns the role, and local runtime state is isolated per bot cwd. No Procedure A/B split. No role arguments.

## Rationale

FS-028 moved role derivation into the platform DB. But startup still required:

1. A pre-written `.bot-hive-identity` file with the handle (set by a spawn script).
2. A `Procedure B` that asked an LLM agent to "transform itself" into a different identity.

Procedure B failed repeatedly in production — the agent kept relaying the spawn script's output to the operator instead of continuing to start the stream. Every patch (ironclad prologue, inject-bot-startup hook, hive-spawn fixes) addressed symptoms. The root cause is Procedure B itself: it is cognitively too complex for an LLM to execute reliably.

This FS eliminates the root cause by making startup boring and request-scoped. The operator can open another terminal in the same repo root and type `start the hive`; the stream uses a startup id to write `.bot-hive-startups/<startup-id>.json`, creates/uses `worktrees/<handle>/` when another bot already owns the root cwd, and receives the server-authoritative role in the `your-role` SSE event. Multiple real Hive bots still use separate worktrees for state isolation, but the operator does not manage those worktrees manually.

## Tickets

- **HV-144** — Server: make `handle` optional on stream connect; assign from `hive/handles.txt` pool; add `handle` to `your-role` event
- **HV-145** — Stream scripts (`stream.ps1`, `stream.sh`): request-scoped startup handoff; bind cwd-local identity when present; receive role; create/use worktree for same-root secondary startup
- **HV-146** — `hive.ps1`/`hive.sh`: remove `add coder`/`add tester`; keep `stop`

## Ticket order

HV-144 → HV-145 → HV-146. Server lands first; scripts follow; cleanup last.

## Out of scope

- Auth on the stream endpoint (separate ticket).
- FS-029 (proactive role-change announcements) — depends on this FS but is separate.
