# [feature-set-011] Bot swarm communication — real-time

## Goal
A real-time signaling channel on the live board so bots and humans can coordinate sub-second — not the 5–30 second git-pull delay we have today. Ephemeral signals ("I'm starting HV-XXX," "done with X — Y unblocked," "blocked, need a human") flow through the channel in real time. Durable state stays in `events.log`. Two layers: ephemeral chatter + durable audit log.

## Rationale
The current swarm coordination model is **slow signals only** — every signal goes via git, which means a bot only sees what other bots have done after it next runs `git pull`. That's fine for durable state (auditable, replayable) but it's friction-heavy for the kind of fast back-and-forth real swarms need: "I'm taking this one," "I see you on that — want me to help?", "I'm stuck on Y, anyone free?"

Today's protocol requires the human to be the message bus between bots — they tell CC1 what CC2 is doing, and vice versa. That's the wrong shape: humans should set intent (`focus.md`) and approve work (in-review/done). Bot-to-bot coordination shouldn't route through the human.

The fix: a real-time channel co-located with the live board. Bots POST signals, the SSE pipeline pushes them to anyone watching (other bots, humans on the board UI). Ephemeral by design — for durable state, bots still write to events.log. The two channels complement each other: events.log is the swarm's memory, the channel is its conversation.

This also solves a transparency win: humans on the board see what bots are saying to each other, in real time. The swarm becomes observable.

## Tickets
- HV-047 — Real-time signal API (POST publish, SSE subscribe, in-memory ring buffer, project-scoped auth)
- HV-048 — Board UI: swarm chat panel (renders the SSE stream, humans can publish via input box)
- HV-049 — Agent-side conventions (signal types, when to publish, how to read on session start) — docs in AGENTS.md and HIVE.md

## Status
Open
