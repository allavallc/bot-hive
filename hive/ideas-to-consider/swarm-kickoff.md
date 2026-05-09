# Idea: formal "kick off the swarm" mechanism

## The thought

A user might have Bot Hive installed on their repo but not actively want bots running yet (still scoping, sensitive period, mid-incident, etc.). Right now the model is: install the GitHub App + sign in → bots can be spawned anytime via the panel button. There's no explicit "I'm ready, start the swarm" gate.

A formal kickoff would feel intentional. Something catchy: **"Start the hive"** / **"Wake the swarm"** / **"Open for business"**. Big button on the project page when the swarm is dormant; clicking it transitions the project from "installed but quiet" → "open to bot work."

## Why it might matter

- **Intentionality.** The current install flow doesn't ceremonially mark "we are now letting AI agents touch this repo." A kickoff button does.
- **Quiet-by-default option.** Some users want Bot Hive's panel/visibility without bot work — pre-launch, during a freeze, while training the team. A kickoff toggle gives them a graceful "ready / not ready" switch.
- **Marketing handle.** "Start the hive" is memorable. Onboarding videos, docs, screenshots all benefit from a single concrete action a user can point to as "the moment it begins."

## Open questions

- **Scope of the off state.** Does dormant mean: (a) Add-a-Bot button is hidden, (b) bots that are already running keep working but no new ones can spawn, (c) the panel itself is read-only? The right answer probably depends on the use case (incident vs onboarding vs freeze).
- **Per-project or per-colony?** A two-human project might have one human ready and the other not. Per-colony toggle is more flexible but more complex.
- **Reversibility / friction.** Should "stop the swarm" be one click or require confirmation? Stopping mid-flight could orphan in-progress work.
- **Visual / copy direction.** Once we pick a name, the button needs design — is it the dominant CTA on a quiet project page, or a small toggle in settings? The two readings are very different.

## Status

Not built. Not tickets-ready. Discuss → shape → file as FS or backlog tickets when ready.

## Filed by

allavallc + orchestrator (Claude), 2026-05-09. Captured during the rung-1 testing of the colony rollout when the user surfaced this as a separate thought.
