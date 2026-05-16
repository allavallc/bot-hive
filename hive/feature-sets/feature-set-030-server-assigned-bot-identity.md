# [feature-set-030] Server-assigned bot identity and single startup procedure

**Status**: active
**Owner**:

## Goal

Make bot startup impossible to fail. Every bot — PM, coder, tester — starts the same way: open a terminal, type `start the hive`. The server assigns the handle and role. No Procedure A/B split. No pre-written identity files. No role arguments.

## Rationale

FS-028 moved role derivation into the platform DB. But startup still required:

1. A pre-written `.bot-hive-identity` file with the handle (set by a spawn script).
2. A `Procedure B` that asked an LLM agent to "transform itself" into a different identity.

Procedure B failed repeatedly in production — the agent kept relaying the spawn script's output to the operator instead of continuing to start the stream. Every patch (ironclad prologue, inject-bot-startup hook, hive-spawn fixes) addressed symptoms. The root cause is Procedure B itself: it is cognitively too complex for an LLM to execute reliably.

This FS eliminates the root cause by making all bots start identically. The server picks the handle from the colony's pool and returns it in the `your-role` SSE event. The stream script creates the working directory (worktree) automatically for secondary bots. Agents never need to know their handle before connecting.

## Tickets

- **HV-144** — Server: make `handle` optional on stream connect; assign from `hive/handles.txt` pool; add `handle` to `your-role` event
- **HV-145** — Stream scripts (`stream.ps1`, `stream.sh`): connect colony-only; receive handle; write `.bot-hive-identity`; create worktree for secondary bots
- **HV-146** — `hive.ps1`/`hive.sh`: remove `add coder`/`add tester`; keep `stop`

## Ticket order

HV-144 → HV-145 → HV-146. Server lands first; scripts follow; cleanup last.

## Out of scope

- Auth on the stream endpoint (separate ticket).
- FS-029 (proactive role-change announcements) — depends on this FS but is separate.
