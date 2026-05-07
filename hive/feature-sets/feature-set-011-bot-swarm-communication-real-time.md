# [feature-set-011] Bot swarm communication — real-time

**Status**: active

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
In progress

## Architecture & decisions

### 2026-05-06 — Real-time channel as a complement to events.log, not a replacement (allavallc-cc1)

**Choice:** Two distinct coordination channels — `hive/events.log` for durable state transitions (append-only, git-backed), and a real-time signal stream for ephemeral chatter (in-memory ring buffer, SSE-delivered, ~1 hour TTL). Agents write to both per their respective conventions.

**Rejected:** (1) Single channel doing both jobs — couples ephemeral noise to durable audit, bloats git history. (2) Real-time only, no durable log — loses replayability for new sessions joining mid-work. (3) Real-time delivered via git push (events.log + webhook) — too slow (~5-10s) for the "I'm starting now" use case.

**Why:** The two channels solve different problems. Durable = "what happened." Real-time = "what's happening." Conflating them either pollutes the audit trail with noise, or loses the ability for new sessions to catch up. Substrate-portable: today the real-time channel is process-local in-memory + SSE; at scale it migrates to Redis/NATS without changing the agent-facing API.

**Implications:** New API endpoints (`POST /signals`, `GET /signals/stream`). New `Signal` type and `signal-buffer.ts` library. Conventions in AGENTS.md/HIVE.md splitting "what to publish where." Agents must subscribe on session start in addition to tailing events.log.

**Reference:** HV-047 / PR #27 (API), HV-049 / PR (this PR) (conventions), HV-048 (UI, deferred per "coordination over polish").

### 2026-05-06 — In-memory ring buffer over Redis for v1 (allavallc-cc1)

**Choice:** Process-local `Map<projectId, Signal[]>` with FIFO eviction at 100 signals/project and 1-hour TTL. No persistence; restart wipes the buffer.

**Rejected:** Redis pub/sub + sliding-window key. More robust under multi-instance / restart / scale.

**Why:** Pre-launch, single-instance Render service. Adding Redis is real infra (provisioning, env vars, connection pooling, fault handling) for capacity we don't need. Process-local is sufficient and ships in a day. The signal type and the API surface are designed so the substrate can swap to Redis later without changing agent code.

**Implications:** Signals don't survive process restart. That's fine — they're ephemeral. New sessions joining after a restart see ~0 buffered signals; they catch up via events.log for durable state and via fresh SSE deliveries for live signals. No one gets stuck waiting on a "lost" signal.

**Reference:** HV-047 / PR #27.
