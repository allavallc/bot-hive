# ADR-001: PM bot semantics with multiple humans on the same repo

**Status**: Proposed

**Date**: 2026-05-08

**Authors**: allavallc-cc1 (drafted), allavallc (deciding)

---

## Context

Bot Hive is designed for multiple humans collaborating on a shared GitHub repo. Each human spawns bots locally on their own machine; bots coordinate through the platform (DB + SSE) and through Git (canonical state). The PM-bot role (FS-019) introduces a new question: **what happens when two humans are both on the same repo, both wanting to spawn bots?**

Specifically: who writes tickets, who edits `focus.md`, and how are priority disagreements resolved between humans?

The PM role is novel in this design — it's a role that, by definition, has authority over the backlog and focus. Two humans both wanting "their" PM creates a multi-authority problem that doesn't exist for coder/tester roles (multiple coders is fine; multiple testers is fine).

Today, `focus.md` is a single line in Git. There is one source of priority truth. Adding multiple PM bots without a coordination model creates fights over that single line.

## Forces

1. **Resilience** — one human's machine being offline shouldn't pause the whole swarm.
2. **Single source of priority truth** — bots must agree on what to work on; conflicting signals stall everything.
3. **Implementation cost** — anything requiring server-side LLM inference is a major new feature, not a shipping consideration today.
4. **Scale path** — the architecture should support growing from 1 human → 2 humans → small team without a rewrite.
5. **Mirrors how teams actually work** — humans already have product-management norms; the bot architecture should match those, not invent new ones.

## Options

### Option A — One PM bot, runs on the lead human's machine

The team designates one human as "lead" (typically the project owner). That human runs the PM bot. Other humans run coders/testers. PM bot owns ticket creation and `focus.md` writes.

- ✅ Single priority truth, mirrors corporate "one PM per area"
- ✅ Low implementation cost (zero new infrastructure)
- ❌ When lead human's machine is offline, no PM activity — backlog stalls
- ❌ Designates one human as more privileged

### Option B — Two PM bots, one per human

Each human runs their own PM. They coordinate via the notes channel.

- ✅ Resilient to one human being offline
- ❌ Multiple writers to `focus.md` → fights
- ❌ Two LLM agents trying to coordinate priorities is fragile (unbounded coordination cost)
- ❌ No corporate analog — teams don't have multiple PMs for one product area

### Option C — No PM bot, humans collaborate as PMs

Both humans are PMs. Both file tickets, both edit `focus.md`, both set priorities. Bots are pure coders/testers.

- ✅ Zero new infrastructure or roles
- ✅ Resilient — humans are always "online" (offline async is fine)
- ✅ Mirrors how small teams already work
- ❌ Loses the PM-as-bot-coordinator value (no LLM filtering of suggestions, no automated ticket-writing from coder hints)
- ❌ Humans must coordinate priorities themselves — but this is a human-team problem, solved via Slack/meetings, not new architecture

### Option D — Server-side PM bot

A PM bot runs on Bot Hive's server (not on a human's machine). Always available. Both humans interact via the panel.

- ✅ Always available, single source of truth
- ✅ Decouples PM from any individual human's machine
- ❌ Requires running an LLM agent server-side — significant new infrastructure (inference billing, hosted agent runtime, security boundary)
- ❌ Out of proportion for current product scale (small teams, pre-launch)

## Decision

**Phase 1 (now → small team): Option C — no PM bot.**

Both humans act as PMs. Tickets are filed via the panel composer; `focus.md` is edited via the panel (or directly in Git). Coder/tester bots make suggestions via the existing notes channel; humans decide what to file. No PM role is introduced as a bot.

**Phase 2 (when human-team coordination cost exceeds the PM-bot cost): Option A — one PM bot, lead human's machine.**

When the team is large enough that humans coordinating on priorities is itself expensive, designate one human as "lead PM owner" and run a PM bot on their machine. Other humans run coders/testers. The lead human's offline-time becomes a known limitation; the team plans around it.

**Phase 3 (when product scale and budget allow): Option D — server-side PM bot.**

If Bot Hive ever has paying customers for whom 24/7 PM coordination matters, build the server-side agent runtime. Not before — the infrastructure cost is too high relative to current scale.

**Option B is rejected outright** at every scale: two LLM PMs fighting over `focus.md` is a coordination tax with no upside.

## Consequences

**What becomes easier:**
- No new role to ship right now. Existing tester (FS-019) and coder roles are sufficient for the next scale step.
- The HV-099 PM-role ticket can be reframed: "PM rubric for humans, not for bots" — a doc that helps humans coordinate as PMs, rather than a bot to build.
- Multi-human collaboration uses the existing notes channel (humans can leave notes for each other tagged at specific bots, just like they leave notes for bots).

**What becomes harder:**
- Loses the LLM-PM ability to auto-file small tickets from coder suggestions. Humans must triage suggestions themselves. At small scale (single-digit suggestions per day) this is trivial; at larger scale it becomes a real cost.
- Tickets and `focus.md` quality depend on human discipline rather than bot consistency. Over time, teams may want to move to Phase 2 (one PM bot) for backlog quality.

**Migration path Phase 1 → Phase 2:**
- The same `hive/skills/pm.md` rubric we'd give a PM bot also serves as a "how a human PM uses Bot Hive" guide. Filing it now creates the doc; activating it as a bot role later is a matter of adding `Role: pm` to an FS file and setting `Owner` to the lead human's bot handle.
- No code change required to migrate. Just convention.

**Migration path Phase 2 → Phase 3:**
- Requires real new infrastructure (server-side agent runtime). Not designed in this ADR; deferred.

## Open Questions

1. Should `focus.md` editing be gated by the panel (write-via-API) so we have an audit trail of priority changes, or stays as a direct-Git-edit? Recommendation: panel-gated when convenient, direct-edit always available as fallback.
2. Do we want a "lead PM" annotation on the project (in DB) for the Phase 1 → 2 migration, even if not used yet? Recommendation: defer until we have evidence we need it.
3. How does the panel display when two humans propose conflicting priorities? Recommendation: just show both notes; humans resolve verbally.
