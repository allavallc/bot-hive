# [feature-set-015] Human ↔ Bot communication on the platform

## Goal
A human can leave a message for the swarm directly from the Bot Hive web UI — and the next bot to start a session, or any bot mid-session, sees it as an actionable signal. Closes the gap where coordinating with a bot today requires the human to chat with one terminal-based agent and have that agent relay messages to others.

The right surface is the **swarm panel** on the project board. It's where the human is already looking, it's where bot activity surfaces, and the underlying substrate (`hive/events.log` + the existing webhook → SSE broadcast) already wires both sides.

## Rationale
Today's flow when a human wants to direct a bot:

1. Human chats with bot A in bot A's local terminal.
2. Bot A drafts a message wrapped in copy-paste delimiters.
3. Human switches windows and pastes the message into bot B's terminal.
4. Bot B reads the message as if the human typed it.

That works for two-bot setups but doesn't scale, isn't visible to anyone watching the project, and leaves no audit trail. The platform should absorb it.

A relevant truth surfaced this session: today's bots **don't subscribe to the SSE channel in real time**. They run as terminal-based agents. They read state by `git pull` on session start (and again as they work). So "bot sees within 1 second" was always aspirational — the realistic delivery is "bot sees on next pull."

Realistic delivery is fine for the use case. A human leaves a note ("CC2: try X next" or "swarm: focus on FS-005"), and the next bot to wake up — including a fresh CC2 session that just started — sees it in `events.log` alongside other recent activity.

## Architecture (post-rip-out)

After PR #111 / #112, Bot Hive has **one** coordination channel: `hive/events.log`. The swarm panel renders it. Adding human notes is a thin addition:

```
human types in swarm panel composer
  → POST to /api/projects/[id]/events  (session-cookie-authenticated, no token)
  → server uses GitHub App installation token to commit a `note` line to events.log
  → existing webhook → SSE broadcast fires
  → all open swarm panels see the new line within ~10s of webhook delivery
  → next bot session pulls and sees it on session start
```

No new auth, no bot tokens, no separate channel. The swarm panel is the surface; events.log is the substrate; the existing webhook is the propagation.

### `note` action format

```
<ISO timestamp>  note-to-<agent-id-or-swarm>  <message>  <human-actor>
```

Examples:

```
2026-05-06T20:00:00Z  note-to-allavallc-cc2  try the WSL path next  allavallc
2026-05-06T20:05:00Z  note-to-swarm  focus shift: FS-009 over FS-007  allavallc
```

A bot's session-start procedure already tails `events.log`. Add: filter for `note-to-<my-agent-id>` and `note-to-swarm` from the last ~24h, surface as priority context. Done.

## Likely scope (ticket breakdown TBD)

- **Swarm panel composer** — bring back the input field that was removed in the rip-out, but route to the new endpoint (not the deleted /signals).
- **POST /api/projects/[id]/events** — session-authenticated; server commits a `note-to-...` line to `hive/events.log` via the App's installation token. Same flow accept/reject already uses for ticket-file commits.
- **Bot-side convention** — agents on session start scan recent events.log for `note-to-<my-agent-id>` and `note-to-swarm` lines; surface the message as part of the session-start summary.
- **UI affordance for targeting** — text starting with `kestrel:` or `@kestrel ` parses to `note-to-kestrel`; otherwise defaults to `note-to-swarm`.
- **Acknowledgment** — when a bot acts on a human note (or explicitly chooses not to), it appends `note-ack` referencing the original timestamp. Visible to the human as "kestrel saw your message at 20:14, acted on it."

## Status
Planning — not yet broken into tickets. Lifts naturally once needed; the substrate already exists.

## Notes
- The composer was removed in PR #111 because it was theater (no bot read it). This FS describes how to reintroduce it as something **actually wired to bots**.
- Out of scope: external chat integrations (Slack, Telegram, etc.). Platform-only per user direction.
- Out of scope: real-time interrupt of running bots. Today's bots are terminal sessions; the human can interrupt by typing in the same terminal. The swarm panel comm is for cross-session, asynchronous direction.
- Pairs with HV-074 (agent-id) — the `to:` semantics need a stable identifier, which agent-id provides.
- Pairs with the existing `events.log` substrate — no new infrastructure.
