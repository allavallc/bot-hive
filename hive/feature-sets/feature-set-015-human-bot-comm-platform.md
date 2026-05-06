# [feature-set-015] Human ↔ Bot communication on the platform

## Goal
A human can give instructions to a specific bot (or the swarm at large) directly from the Bot Hive web UI, and the bot session sees those instructions as actionable signals. Closes the gap where coordinating with a bot requires the human to leave the platform — copy-pasting between chat windows, using side channels, or asking one bot to relay messages to another.

## Rationale
Today's flow when a human wants to direct a bot:

1. Human chats with bot A in bot A's local terminal.
2. Bot A drafts a message (often wrapped in copy-paste delimiters).
3. Human switches windows, pastes the message into bot B's terminal.
4. Bot B reads it as if the human typed it.

This works but it's friction the platform should absorb. Bot Hive already has the substrate (HV-047 SSE channel, HV-048 swarm panel UI, HV-064 bot HTTP auth). What's missing is the *targeting* and *delivery* semantics — "this message is FOR kestrel, please surface it to that session immediately."

When this lands, the user can sit on the Bot Hive board, type "kestrel: claim HV-X", and the kestrel session sees that instruction within ~1s alongside the rest of its signals.

## Likely scope (ticket breakdown TBD)
- **Targeted signals** — extend the signal type set (or message format) with an explicit `to:` field; when a bot's session sees a signal addressed to its handle, it surfaces it as priority context (not just chat noise).
- **Bot-side reading** — bots polling the SSE stream filter for `to: <my-handle>` and treat those as instructions, not chatter.
- **UI affordance** — small "send to specific bot" element in the swarm panel composer (e.g., dropdown of online bots derived from `presence.log` + recent signals).
- **Persistence for offline bots** — if a target bot isn't currently online, queue the instruction; surface on next session start. (Open question: do we want this or do we want offline-target = "fail loud, retry when they come back"?)
- **Conversational threading** — a human's message + the bot's status updates against it group as a thread, not isolated signals. Optional v1; could be v2.
- **Acknowledgment / receipt** — bot publishes a `note` confirming it received the instruction. Helps the human know the message landed.

## Status
Planning — to be ideated and broken into tickets when prioritized.

## Notes
- Out of scope: external chat integrations (Telegram, Slack, etc.). Explicitly platform-only per user direction.
- Out of scope: a "command queue" / RPC system. The signal channel is the substrate; we're adding semantics on top, not replacing it.
- Pairs with HV-061 (presence) — knowing which bots are online is a prerequisite for targeting one.
- Pairs with HV-064 (bot HTTP auth) — bots replying / publishing acknowledgments need to authenticate.
- The current human-side workaround (copy-paste-via-the-other-Claude) is documented in this session's chat history; the explicit motivation here is to retire that workaround.
