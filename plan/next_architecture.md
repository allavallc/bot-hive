# Next Architecture

Goal: stabilize Bot Hive startup without rebuilding the known bad designs.

Core rule
- one authority for liveness/state
- one startup classifier
- one startup result
- no shared-root PID truth
- no heartbeat truth
- no local role truth

Bad design -> replacement rule -> proof test

1. Shared-root PID/artifact ownership
- Bad design: wrapper decides primary vs secondary from `.bot-hive-stream.pid` or other shared-root artifacts.
- Replacement rule: the stream worker decides; the wrapper only observes the returned `stateDir` / startup result.
- Proof test: startup succeeds for a secondary bot even when shared-root artifacts already exist; no pre-spawn PID check changes the startup path.

2. Dual startup classification
- Bad design: wrapper and worker both classify startup mode.
- Replacement rule: exactly one layer classifies; all other layers consume that result.
- Proof test: no case exists where the wrapper waits on one artifact while the worker writes another.

3. Heartbeat/multi-authority liveness
- Bad design: liveness comes from heartbeat, sweeps, PID files, and endpoint choreography.
- Replacement rule: open SSE/socket is the only liveness authority.
- Proof test: join, disconnect, reconnect-within-grace, and reconnect-after-grace all produce the expected live bot set without heartbeat state.

4. Local role truth
- Bad design: local files or helper commands can disagree with server-derived seat/role.
- Replacement rule: server assigns seat/role; local files are cached reflections only.
- Proof test: seat/role shown in startup output, board state, and modal all match the same server state.

5. Unverified local API base
- Bad design: startup trusts stale localhost or unreachable persisted API base.
- Replacement rule: startup must verify reachability from the real runtime before treating an API base as valid.
- Proof test: when the persisted base is stale or unreachable, startup selects a reachable candidate or fails explicitly before hanging.

Minimal startup contract

1. Single startup authority
- The stream worker is the only component allowed to decide startup mode and session root.
- The wrapper must not classify primary vs secondary from PID files, shared-root artifacts, or runtime-local process checks.

2. Single startup result
- Each startup gets exactly one request-scoped result file.
- Result states: `pending`, `live`, `failed`.
- `live` must include: `stateDir`, `handle`, `seat`, `total`, `role`, `sessionId`, `streamPid`.
- `failed` must include: explicit machine-readable error reason.

3. Single liveness authority
- A bot is live if and only if its SSE stream is live from the server's point of view.
- PID files, role notices, and local session registries are bookkeeping only.

4. Explicit success/failure behavior
- Wrapper success = startup result reaches `live` within timeout.
- Wrapper failure = startup result reaches `failed`, or no result reaches `live` before timeout.
- No startup path is allowed to "sort of succeed" only via side effects in unrelated files.

5. Observed, not inferred, session location
- After startup, all later reads must use the returned `stateDir`.
- Root/shared artifacts must never be used as a fallback source of truth for a secondary bot.

6. Reachability before connect
- Startup must verify API-base reachability from the actual runtime before waiting for stream success.
- If no reachable API base exists, startup must fail explicitly instead of hanging.

Workflow
1. Plan
   - compare the candidate architecture against the bad designs above
   - reject any path that revives one of them
   - define the minimal startup contract

2. Write tests and observability first
   - define the startup contract in tests before implementation
   - cover the known failures first: wrapper timeout despite live join, wrong startup-mode classification, stale shared-root artifact confusion, bad/unreachable API base selection, and secondary-state reads from the wrong root
   - add logs that tell us exactly where startup failed or succeeded

   First test set
   - startup returns exactly one request-scoped result with `pending -> live|failed`
   - wrapper never chooses startup mode from shared-root PID/artifacts
   - secondary startup reads/writes only from returned `stateDir`
   - stale or unreachable API base fails explicitly
   - live join cannot be reported as wrapper timeout success ambiguity

3. Build
   - implement the simplified startup path to satisfy those tests
   - keep SSE/socket liveness as the only real authority
   - collapse wrapper/worker handoff complexity where possible
   - make success/failure unambiguous from one startup result

4. Test
   - rerun automated tests
   - then rerun the manual lifecycle: ramp bots up, verify roles/seats, ramp down, verify reseating/removal
   - check startup behavior and Bot Team visibility separately so UI bugs do not hide startup-state bugs

First code/test touchpoints
- `scripts/hive-start.mjs`
  - extract the startup-result contract into testable helpers
  - remove any wrapper-side startup-mode inference from shared-root artifacts
- `scripts/hive-start-windows.ps1`
  - converge launch ack + handoff into one request-scoped startup result path
  - make timeout/failure machine-readable
- `scripts/stream.ps1`
  - make the worker own startup mode, `stateDir`, and final startup result
  - fail explicitly on unreachable API base instead of leaving ambiguous side effects
- `scripts/bot-session.mjs`
  - keep session bookkeeping subordinate to returned `stateDir`
  - never let session-record helpers become startup-mode authority
- `scripts/lib/api-base.ps1`
  - preserve reachability-first behavior and test stale/unreachable candidate handling

First automated test files
- `src/bot-session.test.js`
  - add tests proving secondary state resolution uses the returned session record root, not cwd/shared-root fallbacks
- `src/app/projects/[id]/add-bot-spawn-command.test.ts`
  - keep spawn-command expectations aligned with the simplified startup contract if the command shape changes
- new: `src/hive-start.test.js`
  - test wrapper behavior around one startup result: `pending -> live|failed`
  - test that wrapper does not choose startup mode from PID/artifact presence
  - test that wrapper treats timeout as failure unless the startup result explicitly reaches `live`
- new: `src/api-base.test.js`
  - test stale persisted base vs reachable dev-log base selection logic at the contract level

Definition of done for the architecture pass
- wrapper can no longer report ambiguous timeout while the worker "sort of succeeded"
- secondary startup cannot read/write identity from the wrong root
- startup mode is decided in one place only
- API-base failures are explicit
- the next manual HV-136 lifecycle run gives trustworthy startup-state evidence

What I am going to do
- use this order: plan > tests/logs > build > test
- apply test-driven development throughout
- keep the scope on design-level stabilization, not quick patches
- compare every change to `tasks/lessons.md` and HV-136 before treating it as valid
