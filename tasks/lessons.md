# Lessons (Bot Hive)

Self-correction log. Append entries as patterns emerge. Reread at session start.

## L1 — Edit tool requires Read at the new path after `git mv`

After `git mv hive/backlog/HV-XXX.md hive/in-progress/HV-XXX.md`, the Edit tool's "have you Read this file?" check is path-based. The previous Read at the old path doesn't count. **Workaround**: edit fields *before* the `git mv` (then move), or re-Read at the new path before editing.

This burned ~5 commits this session. Default to "edit while still in `backlog/`, then `git mv`, then commit."

## L2 — `NEXT_PUBLIC_*` env vars must exist *at build time* and be in `render.yaml`

`process.env.NEXT_PUBLIC_APP_URL` reads in client code get **inlined into the JS bundle at build time**. Setting it post-deploy doesn't help — the bundle was already built without it. So: any `NEXT_PUBLIC_*` env var the codebase uses must be declared in `render.yaml` (with `sync: false`), filled in the Render dashboard, *and the build re-runs* with the var present.

Bot Hive's `auth-client.ts` reads `NEXT_PUBLIC_APP_URL`. Missing it from `render.yaml` shipped a bundle pointing at `localhost:3000`, which CORS-blocked sign-in from prod.

Rule: **before any deploy, grep for `NEXT_PUBLIC_` and confirm every one is in `render.yaml`.**

## L3 — `NextRequest.url` returns the upstream localhost on Render

Behind Render's reverse proxy, `req.url` reports `http://localhost:10000` (the internal upstream), not the public origin. Any redirect built with `new URL(path, req.url)` lands on localhost — broken UX.

Fix pattern: a helper that prefers the explicit public origin env var:
```ts
function publicUrl(req: NextRequest, path: string): URL {
  const base = process.env.BETTER_AUTH_URL ?? new URL(req.url).origin;
  return new URL(path, base);
}
```

Caught by HV-024 testing. Fix in commit `eb9f53f`. Pattern applies to **any redirect** in API routes / server actions hosted behind a reverse proxy.

## L4 — GitHub OAuth Apps allow exactly ONE callback URL

Not a list, not multi-line. The "Authorization callback URL" field on github.com is single-value. Multi-environment setup (dev + prod) requires **separate OAuth Apps**, each with its own client ID + secret.

Same single-URL constraint applies to GitHub App **Webhook URL**, **Setup URL**, and **Callback URL**. So `Hive (Dev)` + `Hive (Prod)` GitHub Apps too if you want both environments fully working.

I incorrectly told the user "add to the list" early in HV-024 — corrected mid-ticket. Don't repeat.

## L5 — GitHub App permissions default to *no permissions*

Creating a GitHub App via github.com's UI defaults all repository permissions to **"No access"**. The "Repository access" section on the install page then shows **"No repositories"** with no option to select any, because the app has zero permissions to grant.

Always set Contents (Read/Write or Read), Metadata (Read), and any others before installing. And subscribe to the events you actually need (Push for Bot Hive's webhook flow). Otherwise the install creates an empty shell that can't do anything.

## L6 — Drizzle Kit's interactive rename prompt blocks piped stdin on Windows

`drizzle-kit generate` shows an interactive "is this column a rename or drop+add?" prompt when it detects an ambiguous schema diff. Piping `printf '\x1b[B\n'` (down-arrow + enter) does NOT advance the prompt on Windows Git Bash — the process hangs.

When you can't answer interactively: hand-write the SQL migration file *and* the meta snapshot JSON *and* the journal entry. Verify with `npm run db:migrate` then `npm run db:generate` (which should report no further drift).

## L7 — Walkthrough first, then one-at-a-time — never drip-feed

When the user is following a multi-credential / multi-platform setup, dripping out instructions one message at a time without a master plan loses them. They lose track of which value goes where, and which app owns which secret.

Pattern: lead with a single comprehensive **map** (table or list of "every credential, every source, every destination"). Then walk through it step by step, one at a time, marking off each. The map is the safety net they refer back to when they get lost.

Used this in HV-024 *only after* the user explicitly asked for it. Should be the default for any deploy / setup / multi-step credential walkthrough.

## L8 — Don't split a ticket's lifecycle moves across multiple PRs

Caught during the first parallel-bot test (CC2 working HV-039, 2026-05-05). CC2 made two PRs:
- PR #19: source-code work for the modal feature (branch based on stale main; HV-039 file in `in-progress/` per CC2's branch)
- PR #20: ticket move from in-progress to in-review (premature — opened while #19 was still in CI)

When PR #20 merged first and PR #19 merged second (auto-rebased), the squash-merged diff added the *new* `in-review` copy of the file without deleting the *old* `in-progress` copy. Result: HV-039 ended up in **both folders** on main, with no merge conflict surfaced. The board would render it twice.

**Rule:** a single ticket's lifecycle should live in one PR. The PR that ships the work also performs the ticket move (e.g., `in-progress` → `in-review`). Don't split "do the work" and "move the ticket" into separate PRs that race each other.

If the work spans multiple PRs (rare; mostly for very large features with intermediate milestones), keep the ticket file motionless until the final PR — don't move it back-and-forth from PR to PR.

Recovery (this case): one extra small PR to delete the duplicate file, append the lesson here, file HV-046 to capture the rejection-flow gap that surfaced from the same review cycle.

## L9 — UI changes need explicit visual approval before build, not just ticket approval

Burned twice in one session (2026-05-06):

1. **HV-048 swarm panel** — built right-side fixed because the ticket said "right-side panel"; ignored that the right side was already occupied by the HV-039 ticket detail overlay. Result: the two panels stacked on top of each other on every card click. Hotfixed (PR #50) by moving to the left.
2. **HV-020 billing-owner panel** — built per-spec and pinned to the top of the project board page. The ticket said "let collaborators transfer the seat"; the user never saw a layout sketch. They hated the placement. Wholesale rip-out + re-park under FS-012 (admin dashboard).

The pattern: a ticket spec describes *what* a feature does; it does not describe *where it sits visually* or *how it lays out alongside everything else on the page*. Approving a ticket is approving the goal, not approving the design choices the implementor will make later. For anything a human will see, the user needs to approve the placement / shape before code is written.

**Rule:** before implementing any user-facing UI ticket, post a layout sketch (text description of placement + any nearby elements + an ASCII / Mermaid sketch if helpful) and wait for explicit approval. Even one line: "panel pinned to the top of the board page, full width, above the kanban — ok?" — that's enough to surface the conflict before it ships.

Pre-build interview already exists as a global rule (`~/.claude/CLAUDE.md`); this is the UI-specific subcase that I kept skipping. UI approval is a separate gate from ticket approval.

Also tied to scope drift: I built HV-020 while the user had explicitly said "stay focused on coordination". Acknowledge the assigned focus before claiming any ticket — if the ticket is outside scope, surface it instead of silently working around the assignment.

## L10 — In mixed Windows/WSL startup, the wrapper must not classify primary vs secondary from PID liveness

The startup wrapper and the stream process were both trying to answer the same question: "am I the primary bot or a secondary bot joining an existing colony?" The wrapper used a root `.bot-hive-stream.pid` liveness probe to decide whether to wait for a root `.bot-hive-role-notice` (primary path) or a request-scoped `.bot-hive-startups/<id>.json` handoff (secondary path).

That design is unsafe in mixed-runtime local dev. A PowerShell-launched stream can be alive even when the wrapper's runtime-specific PID probe says otherwise, or the wrapper can classify the session differently from the stream process it just spawned. When those disagree, the wrapper waits on the wrong artifact: it blocks waiting for a root role notice that will never be written, while the stream correctly writes a startup handoff for a secondary session.

The symptom is deceptive seat inflation: the next bot appears as seat 2 even though the human never successfully established seat 1 from that terminal flow. The underlying fault is not seat assignment — it is startup-mode misclassification before the wrapper begins waiting.

**Rule:** treat the presence of shared-root startup artifacts only as a reason to request a startup handoff, never as authority about startup mode. The spawned stream process is the authority. The wrapper should infer primary vs secondary from the returned `stateDir` / handoff result after the stream has decided, not from a pre-spawn cross-runtime PID check.

Corollary: when debugging Bot Hive startup, distrust any design where two layers independently classify ownership or startup mode from shared root files. Use one authority, and make the other layer observe its result.

## L11 — Local startup must not trust a stale localhost API base or assume localhost is reachable across runtimes

Bot Hive startup was reading `.bot-hive-api-url` and using it as the stream base without verifying that it still matched the running dev server. That broke in two ways during mixed Windows/WSL local runs:

1. the dev server moved from `localhost:3000` to `localhost:3001` because port 3000 was already taken, but `.bot-hive-api-url` still pointed at 3000; and
2. even the correct Windows-local URL (`http://localhost:3001`) was not reachable from the WSL runtime that launched `stream.sh`, while the dev log's network URL (`http://10.5.0.2:3001`) was reachable.

The symptom looks like a startup-contract failure (`No role notice appeared within startup timeout`), but the actual fault is upstream: the stream never reached `/api/bots/stream` at all because it was dialing the wrong or unroutable base URL.

**Rule:** in local dev, treat `.bot-hive-dev.log` as the freshest authority for the active Next.js port/address. If a persisted `.bot-hive-api-url` disagrees with the current dev log, override it. If `localhost` is not reachable from the current runtime and the dev log exposes a network URL, fall back to that network URL and persist the corrected base.

## L12 — Distinguish Bot Hive startup failures as implementation bugs vs bad designs

Two startup/seat failures looked similar on the surface but should be classified differently so future fixes target the right layer.

1. **Implementation bug — shutdown tracked the wrong process identity.** In the Windows/PowerShell path, `.bot-hive-stream.pid` could point at a process that was no longer the real seat-owning SSE connection. Shutdown then reported success while the real stream stayed alive and kept the seat occupied. Symptom: the next startup appears as seat 2 even though the previous seat was thought to be gone.

2. **Bad design — startup handoff mode was inferred from shared-root artifact presence instead of one authoritative owner.** `scripts/hive-start.mjs` treated the existence of `.bot-hive-stream.pid` as enough reason to classify startup/handoff behavior, even when that artifact was stale or belonged to a different runtime view. That is not just a conditional bug; it is an unsafe ownership model because two layers independently infer startup mode from shared files.

**Rule:** when recommending Bot Hive startup fixes, first check this lessons file and reject any recommendation that repeats a known bug pattern or revives a known bad design. In particular, do not recommend shared-root PID-file authority, cross-runtime PID liveness as ownership truth, or dual-classification of primary vs secondary startup paths.

## L13 — Don’t diagnose transient local Next route 500s as app-code bugs before checking for duplicate dev servers / shared build-output contention

During HV-136/HV-148 local validation, project-scoped routes briefly failed with framework-level runtime symptoms (`__webpack_modules__[moduleId] is not a function`, other internal Next invariant errors). The tempting diagnosis was "`src/lib/github.ts` or the route code is broken" because the stack pointed through generated route bundles that imported that module.

Re-checking showed the route bundles could be required successfully and the same endpoints later returned normal `401` unauthenticated responses. The stronger local-state clue was that two `next dev` processes were running from the same checkout at once (`:3000` and `:3001`), and logs also showed framework-level manifest/runtime corruption (`Expected clientReferenceManifest to be defined`).

**Rule:** before treating a local Next route 500 as a durable application bug, check whether multiple dev servers are sharing one checkout/build-output tree. If the failure is transient and the stack/error shape is framework-internal, classify it first as possible local artifact/runtime contention. Reproduce again against one clearly authoritative dev server before changing app code.
