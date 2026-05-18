# Bot Hive - Agent-Neutral Architecture

**For:** Codex, Claude, Cursor, Gemini, Aider, and any LLM agent working on Bot Hive
**Purpose:** Explain what Bot Hive is trying to become and how to improve it without losing the core product shape
**Status:** Active architecture; use this to guide implementation tickets, review, and closeout decisions

---

## 0. Implementation status

This section is the running checklist for the architecture. When a feature set closes, mark it closed here and in its feature-set file.

| Area | FS / tickets | Status | Notes |
|---|---|---|---|
| Agent-neutral architecture definition | `plan/architecture-20260515.md` | Done | North-star architecture captured here. |
| Server-backed live coordination | `feature-set-031-server-backed-live-coordination` | Active | Tracks the shift from repo-as-comm-layer to server-as-live-comm-layer. |
| Bot-to-server live event API | `HV-147` | In review | `bot_events` table, `POST /api/bots/events`, validation, broadcast type, targeted bot SSE delivery, tests. |
| Role consolidation rule alignment | `hive/roles.md` / role tests | Done | Aligned source-of-truth table with current product rule: 2 bots = PM+tester and coder; 3 bots = PM, coder, tester. |
| Bot stream role-change payloads | `HV-142` / `feature-set-029` | Mostly done; reconcile ticket | Current code carries `skillFiles` and `departed`; ticket metadata still needs cleanup/review. |
| Swarm panel live event rendering | `HV-148` | In review | `bot_events` now join the project events API and render in the swarm panel as `bot-event` rows. |
| Tester approval merge gate | `HV-149` | Open | Make tester approval explicit and enforceable before merge-ready state. |
| Server-side context injection | `HV-150` | Open | Add a durable curated-learnings store, then inject feature-set/ticket/learning context into task and review handoff events. |
| Bot API auth hardening | follow-up needed | Open | `POST /api/bots/events` currently requires an active bot row but no bot-issued API token. Add explicit bot auth before broad external use. |
| Hindsight production integration | none | Not planned | Hindsight remains owner-side curation only; not user-required infrastructure. |

Latest full verification for the implemented slice:

- `npm.cmd run test` passed: 15 files, 142 tests.
- `npm.cmd run lint` passed.
- `npm.cmd run typecheck` passed.
- `npm.cmd run build` passed.

---

## 1. Product purpose

Bot Hive exists to turn one human using one coding agent into one human managing a visible product and engineering team of AI agents.

The human should be able to open one or more terminals or VSCode agent sessions, start the hive, and have those agents coordinate like a small team:

- A PM role turns human goals into feature sets, tickets, and acceptance criteria.
- Coder roles claim and implement scoped work.
- A tester role reviews work before it ships.
- The human can see what is happening, intervene when needed, and trust the GitHub-to-production path.

The core product is not just a kanban board and not just multi-agent coding. The product is a coordination layer that makes many subscription-based terminal agents behave like a predictable product and engineering team.

This matters because running several agents without orchestration creates the same failures a disorganized human team creates: duplicate work, missing context, unclear ownership, untested output, hidden blockers, and unpredictable merges.

Bot Hive should solve two problems:

1. **Scale one agent to N agents.** More agents should mean role separation and throughput, not chaos.
2. **Make the delivery process visible and governed.** Work should move through definition, implementation, review, CI, and merge in a way the human can see and trust.

---

## 2. Architectural split

Bot Hive has four distinct layers. Keep these responsibilities separate.

### User-owned agent layer

Agents are not hosted or spawned by Bot Hive in the core model. The human starts them in terminals, VSCode, Claude Code, Codex, Cursor, Aider, Gemini, or another agent host.

Bot Hive assumes users want to use subscriptions they already pay for, not platform-provided API keys. That means the agent execution environment remains local or user-owned.

The agent host does the actual coding, testing, file editing, and terminal work.

### Bot Hive server layer

The Bot Hive server is the live coordination and communication layer.

It owns:

- active bot membership
- role assignment
- seat assignment
- liveness
- role changes when bots join or leave
- live human-to-bot messages
- live bot-to-human questions
- handoffs between roles
- blocker routing
- review requests
- current in-flight dev state
- context injection for agents

This layer should be real-time. The current pragmatic transport is:

- **SSE** for server-to-agent and server-to-browser events.
- **REST POST endpoints** for agent-to-server messages.

This keeps the model simple and works with terminal agents. WebSockets may be useful later, but SSE plus REST is enough for the near-term architecture.

### GitHub layer

GitHub is the durable source of truth for final artifacts, not the primary live communication bus.

GitHub owns:

- source code
- pull requests
- branches
- CI checks
- merged ticket lifecycle artifacts
- accepted feature/ticket files
- audit history
- final project state

The repo can hold durable state, but it should not be treated as the live communication layer. File-based coordination is too slow and too lossy for mid-session questions, role changes, handoffs, or blockers.

Use GitHub for things that should survive as history. Use the Bot Hive server for things that are live, transient, or operational.

### Human visibility layer

The kanban board is the process window.

It should show:

- what the PM has defined
- what coders are working on
- what is in review
- what the tester rejected or approved
- which bots are active
- who has which role
- blockers and questions
- PR/CI/merge status

The board should not be the only way to operate the system. The human may mostly work from a terminal or VSCode. The board exists so the process is visible and trustworthy.

---

## 3. Role model

Bot Hive assigns roles based on the number of active bots in a colony. The human does not manually choose roles for each bot during normal operation. The server assigns and reassigns roles authoritatively.

The consolidation rule:

| Active bots | Seat 1 | Seat 2 | Seat 3 | Seat 4+ |
|---|---|---|---|---|
| 1 | PM + coder + tester | - | - | - |
| 2 | PM + tester | coder | - | - |
| 3 | PM | coder | tester | - |
| 4+ | PM | coder | tester | additional coders |

When a bot joins:

1. The server allocates the lowest available seat.
2. The server counts active bots in the colony.
3. The server derives the role assignment from the table.
4. The server pushes a role event to the new bot.
5. If existing bots' roles changed, the server pushes role-change events to them too.

When a bot leaves or times out:

1. The server marks it offline.
2. The server renumbers active seats.
3. The server recomputes role assignments.
4. The server pushes role-change events to affected bots.

Agents must treat server role events as authoritative. Skill files should be loaded according to the current role, not stale local assumptions.

---

## 4. Event-driven workflow

The correct execution model is not purely push-driven or purely pull-driven. It is event-driven.

The human starts agents. Agents connect. The server coordinates. Agents remain autonomous within their role, but they respond to server events that affect their work.

### Typical flow

1. The human gives a PM goal, such as "build an admin dashboard with x, y, and z."
2. The PM bot turns that goal into feature sets, tickets, acceptance criteria, and implementation order.
3. The server records and broadcasts that new work is available.
4. A coder bot claims available work and implements it in an isolated branch or worktree.
5. The coder signals completion to the server.
6. The server routes the work to the tester.
7. The tester reviews the work against the ticket and acceptance criteria.
8. If rejected, the server routes the rejection and reason back to the coder.
9. If approved, the work proceeds to CI and merge.
10. GitHub records the final PR, code, and accepted ticket lifecycle state.

### Server-to-agent events over SSE

The server should push events such as:

- `your-role`: current seat, role, total active bots, and skill files to load
- `your-role`: also used for role changes when a bot leaves or joins; payload may include `departed`
- `work-available`: tickets or feature sets are ready for a role
- `review-requested`: coder work is ready for tester review
- `rework-requested`: tester rejected work and the coder should revise
- `human-message`: the human sent instructions or answered a question
- `blocker-updated`: a blocker was created, resolved, or assigned
- `context`: relevant learnings, constraints, or prior failure patterns for the task

The exact payload shape should be small and typed. Each event should include at least project ID, colony, target role or handle, event kind, timestamp, and enough IDs to fetch the full state if needed.

### Agent-to-server messages over REST

Agents should POST events such as:

- status updates for an already-open bot stream
- claim ticket
- ask human
- report blocker
- mark implementation ready for review
- submit tester approval
- submit tester rejection with reason
- acknowledge role change
- report local execution status

Bot lifecycle and liveness should stay stream-owned: opening `GET /api/bots/stream` joins/rebinds the bot, and closing the stream starts the disconnect/renumber flow. Do not reintroduce heartbeat as the primary liveness authority.

These messages should update server-side live state first. Durable GitHub artifacts should be written only when the state transition is meant to become project history.

---

## 5. State model

Bot Hive needs two state classes.

### Live dev state

Live dev state belongs in the Bot Hive server database.

Examples:

- active bots
- current roles
- current task ownership
- pending handoffs
- unresolved questions
- transient blockers
- tester review state
- human instructions not yet committed into a ticket
- soft claims
- liveness and connection state

This state needs low latency. It should be queryable by the board and pushed to agents through SSE.

### Durable project state

Durable project state belongs in GitHub.

Examples:

- code changes
- PRs
- accepted tickets
- completed feature sets
- decision records
- audit logs worth preserving
- final lifecycle moves

This state can move at GitHub speed. It benefits from review, CI, branch protection, and history.

Do not use Git commits as the primary way to send live questions, handoffs, or "what should I do next?" prompts between agents. That was a useful starting constraint, but it does not satisfy the real-time coordination requirement.

---

## 6. Quality gates

Bot Hive should make quality a process, not a hope.

The intended gate order:

1. **PM definition gate.** Work starts from a feature set and ticket with testable acceptance criteria.
2. **Coder completion gate.** The coder must produce an implementation, local verification, and a clear summary.
3. **Tester gate.** The tester reviews against each acceptance criterion and either approves or rejects with evidence.
4. **CI gate.** Automated checks must pass.
5. **Merge gate.** Only approved, passing work merges.

The tester is the first quality gate, not an afterthought. CI catches mechanical regressions. The tester catches wrong behavior, missing acceptance criteria, poor fit, and gaps that tests may not cover.

Human review should remain available, but the architecture should not require the human to manually inspect every change for the system to function. The human should be able to spot-check, override, or intervene.

### Merge enforcement target

The long-term merge rule should be:

- no merge unless tester approval exists for the PR or ticket
- no merge unless CI passes
- no merge if the work is blocked, rejected, or missing required ticket linkage

This can be implemented incrementally with GitHub checks, PR labels, Bot Hive status records, or a server-side merge controller. The key architectural point is that tester approval becomes enforceable, not just a convention.

---

## 7. Memory and learnings

Hindsight is not required production infrastructure for users in the near-term architecture.

The intended model:

1. The project owner may run Hindsight locally while developing Bot Hive.
2. Useful patterns are periodically curated by a human.
3. Curated learnings become one of:
   - skill-file rules
   - server-side context injections
   - tester checklists
   - PM ticket quality rules
   - codebase notes
4. Bot Hive injects relevant learnings into agent events or task startup context.
5. **Curated learnings are permanent until explicitly retired by the owner.** Do not implement decay, time-based relevance scoring, aging, or "last used" tracking. A rule from six months ago is as valid as a rule from yesterday. Learnings only get removed when the owner deliberately removes them from the learnings store.

Users should not need to install Hindsight, Docker, or memory infrastructure to get value from Bot Hive.

Implementation note: no curated-learnings store exists yet. HV-150 should add the durable store and the context-injection path together, rather than adding decay/scoring infrastructure.

### What memory should do

Memory should improve judgment before work starts.

Examples:

- "Webhook tickets often fail because of duplicate delivery handling."
- "Auth changes need token expiry and missing-session cases reviewed."
- "UI changes need explicit layout approval before implementation."
- "Tester must evaluate every acceptance criterion individually."

These are useful as context injections or durable rules.

### What memory should not do

Memory should not replace:

- explicit skill instructions
- acceptance criteria
- automated tests
- tester review
- human judgment

If a behavior must always happen, make it a rule or gate. If it is situational background, inject it as context.

---

## 8. Business model implications

The product should be valuable with one bot and more valuable with more bots.

Free tier shape:

- one active bot
- consolidated PM + coder + tester role
- visible board
- GitHub workflow
- basic quality process

Paid tier shape:

- multiple active bots
- separated roles
- parallel work
- faster throughput
- richer coordination
- team visibility

The upgrade is not "pay for the board." The upgrade is "pay to turn one AI assistant into a coordinated product and engineering team."

This also means the one-bot experience must be good. It teaches the workflow and proves the value before the user pays for parallelism.

---

## 9. Near-term improvement path

Prioritize the pieces that make multi-agent work predictable.

1. **Complete two-way live messaging.**
   Add or harden REST endpoints for bot-to-server messages: questions, claims, blockers, ready-for-review, tester approvals, tester rejections, and acknowledgements.

2. **Make live dev state DB-backed.**
   Store questions, handoffs, review requests, soft claims, and blockers in Postgres. Broadcast updates over SSE.

3. **Expand SSE event types.**
   Move beyond generic refresh events. Send role, handoff, review, blocker, human-message, and context events directly to affected bots.

4. **Make tester approval enforceable.**
   Add an explicit approval record and prevent merge flow from completing until tester approval and CI pass.

5. **Move transient communication out of Git.**
   Keep final ticket state and audit-worthy decisions in GitHub. Keep live operational conversation in the server.

6. **Add context injection.**
   When a bot receives work, include feature-set goal, ticket context, related blockers, prior tester failures, and curated learnings relevant to the task.

7. **Keep onboarding terminal-first.**
   The human should be able to open terminals, type `start the hive`, and see bots join the board with assigned roles.

---

## 10. Design constraints for future agents

When improving Bot Hive, preserve these constraints unless the human explicitly changes direction.

- Agent execution stays user-owned; Bot Hive coordinates but does not need to host user agents.
- Support any LLM agent host that can follow instructions, run scripts, and make HTTP requests.
- Avoid requiring user API keys for the core product.
- GitHub remains the durable delivery backbone.
- The server, not Git, is the live communication layer.
- SSE plus REST is the near-term transport.
- Role assignment is server-authoritative and changes when active bot count changes.
- The kanban board is visibility, not the whole product.
- Quality must include tester review before CI/merge.
- Hindsight is an owner-side curation tool for now, not required user infrastructure.
- Curated learnings persist; do not build decay or aging logic.

---

## 11. How to use this document

Use this document when deciding whether a new feature belongs in the server, GitHub, the board, or the local agent workflow.

Ask:

1. Is this live coordination? Put it in the Bot Hive server and broadcast it.
2. Is this final project history? Put it in GitHub.
3. Is this something the human needs to see? Surface it on the board.
4. Is this something an agent must do? Put it in role instructions, context events, or enforceable gates.
5. Is this a recurring lesson? Curate it into a rule, checklist, or server-injected context.

The architecture is successful when a human can add more agents and get a more capable team, not just more simultaneous terminal output.
