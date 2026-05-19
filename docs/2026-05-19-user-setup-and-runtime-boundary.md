# User setup and runtime boundary for Bot Hive

Goal: define the product's intended setup flow for a normal Bot Hive user, decide what must live in the user's repo versus inside Bot Hive itself, and outline a migration path from the current implementation.

## 1) Primary user model

The primary Bot Hive user is:
- a single developer or small team
- with their own software repo
- who wants a hive of local AI agent sessions working against that repo
- while using the Bot Hive web app as the control plane and live board

This is not the same as a maintainer developing the `bot-hive` product repo.
The user experience should be designed around "my repo + my bots + the Bot Hive app", not around the internals of this repository.

## 2) Canonical user journey

The default user journey should be:

1. The user signs into the Bot Hive web app.
2. The user connects or installs Bot Hive on their repo.
3. The user initializes that repo for Bot Hive.
4. Bot Hive creates the minimum repo-resident coordination files needed for work tracking.
5. The user starts one local bot session from their repo.
6. The bot joins the project's colony, receives a handle/seat/role from the server, and starts working.
7. If the user wants more throughput, they start additional local bot sessions.
8. The web app shows the live board, active bots, notes, and progress.

That is the product story.

The user should not have to think about:
- Bot Hive's own repo structure
- copying internal role-definition files by hand
- startup implementation details like handoff files or PID bookkeeping
- keeping app-shipped role docs in sync with repo-shipped role docs

## 3) What should live in the user's repo

These are project coordination artifacts. They belong to the user's repo because they describe the user's work.

Required repo-resident state:
- `hive/backlog/`
- `hive/in-progress/`
- `hive/in-review/`
- `hive/done/`
- `hive/blocked/`
- `hive/not-doing/`
- `hive/feature-sets/` if feature sets remain part of the workflow
- a format spec or bootstrap doc only if the bots truly need repo-local instructions to work in arbitrary agent hosts

Optional repo-resident state:
- `hive/colonies/<colony>/focus.md`
- `hive/events/`
- `hive/notes-to-bots/`
- `hive/notes-to-humans/`
- agent-host shims like `AGENTS.md` or `CLAUDE.md`

Principle:
The user's repo should store the project's coordination data and instructions that are meaningfully specific to that project.

## 4) What should NOT have to live in the user's repo by default

These are Bot Hive runtime behaviors and defaults. They should be app-owned by default.

App-owned runtime defaults:
- role consolidation logic
- default role rubrics / skill bundles
- handle generation or handle pools
- seat-assignment semantics
- startup/shutdown protocol semantics
- default wording for bootstrap instructions
- default bot lifecycle behavior

Principle:
The user's repo should store hive work.
Bot Hive should store hive behavior.

## 5) Why this boundary is the right product shape

### Benefits
- Easier onboarding: connect repo, initialize, start bot.
- Fewer files the user must understand before first success.
- No app/repo drift for core runtime policy.
- Safer upgrades because runtime rules ship with the app.
- Lower support burden because there is one authoritative default runtime.

### Costs
- Less transparent than storing every rule as markdown in the repo.
- Advanced teams lose some file-level hackability unless overrides exist.
- Bot hosts that only inspect local files may need a clearer bootstrap contract.

### Product conclusion
The easy path should optimize for first success, not maximum inspectability.
Inspectability and customization should be layered on later as advanced overrides.

## 6) Current codebase reality

Today, the implementation is still coupled to repo-resident runtime files:

- `src/lib/roles.ts` reads `hive/roles.md` and derives `hive/skills/*.md`
- `src/lib/bot-stream.ts` reads `hive/handles.txt`
- startup docs tell bots to read skill files from repo paths supplied by the server

That means the current system treats the repo as both:
1. the user's work board
2. the Bot Hive runtime definition

This is convenient during product development, but it is the wrong long-term boundary for normal users.

## 7) Important warning: current repo-defined runtime is already fragile

The current arrangement has already shown a failure mode: runtime-defining docs can drift.

At the time of writing:
- `hive/seats.md` says 2 bots => bot 1 = PM + coder, bot 2 = tester
- `hive/roles.md` says 2 bots => bot 1 = PM + tester, bot 2 = coder
- `src/lib/roles.ts` uses `hive/roles.md` as the actual source of truth

That is exactly the kind of inconsistency users should not be exposed to in their own repos.

## 8) Recommended product model

Use a hybrid model.

### Default mode
Bot Hive initializes a minimal `hive/` workspace in the user's repo for project coordination only.
The app/server owns the runtime defaults.

### Advanced mode
A repo may optionally override specific runtime defaults later, for example:
- custom role mapping
- custom skill bundles
- custom bot naming strategy
- custom workflow files

But overrides should be explicit and opt-in, not required for first-run success.

## 9) Recommended user-facing setup flow

The normal user documentation should be structured around this flow:

### Step 1: Connect your repo
Sign into the Bot Hive web app and install/select your repo.

### Step 2: Initialize Bot Hive in your repo
Use a single "Initialize Bot Hive" flow that creates the minimal `hive/` project workspace.
Do not require the user to manually copy internal Bot Hive runtime docs.

### Step 3: Start your first bot locally
From the user's repo, open a terminal in the supported local runtime and start one bot.
The server assigns handle, seat, and role automatically.

### Step 4: Watch the board
The web app becomes the live visibility surface: tickets, bot team, notes, status, review queue.

### Step 5: Add more bots if needed
Open another terminal and start another bot. The server rebalances seats/roles.

This flow should be explained without reference to the `bot-hive` product repo.

## 10) Migration plan

### Phase 1: define the boundary in docs
Purpose: stop writing instructions from the maintainer point of view.

Tasks:
1. Rewrite README and setup docs around the real user journey: user repo + web app + local bots.
2. Explicitly separate "Bot Hive product development" docs from "Bot Hive user setup" docs.
3. State that current repo-coupled runtime files are an implementation detail, not the intended long-term product contract.

### Phase 2: move runtime defaults into app code/config
Purpose: make first-run setup easy.

Tasks:
1. Move default role mapping out of `hive/roles.md` into an app-owned config module.
2. Move default skill bundle mapping out of markdown-derived path logic into app-owned config.
3. Move handle pool generation out of `hive/handles.txt` into app-owned defaults.
4. Keep existing repo files temporarily as compatibility inputs only if needed.

Verification:
- A fresh user repo can work without `hive/roles.md`, `hive/skills/`, or `hive/handles.txt`.
- The first bot can still start and receive role/seat/skill assignment.

### Phase 3: introduce repo initialization
Purpose: make user onboarding one action.

Tasks:
1. Add an "Initialize Bot Hive" action in the app or CLI.
2. Create only the minimal project coordination structure in the user's repo.
3. Generate any agent bootstrap files only when required by the chosen host.
4. Document exactly which files are created and why.

Verification:
- A user can connect a repo and initialize it without reading internal architecture docs.
- The resulting repo contains project coordination artifacts, not the whole Bot Hive runtime.

### Phase 4: add optional overrides
Purpose: preserve power-user flexibility.

Tasks:
1. Define a small override surface for runtime customization.
2. Make overrides explicit, versioned, and validated.
3. Keep the default path zero-config.

Verification:
- Default users never need overrides.
- Advanced teams can customize without forking core runtime behavior invisibly.

## 11) Concrete decision summary

For product design, assume this contract:

- Yes, the user's repo should usually contain a `hive/` folder.
- No, that folder should not be required to carry all Bot Hive runtime definitions.
- The repo should primarily hold project coordination state.
- Bot Hive itself should own the default bot runtime behavior.
- Repo-level runtime customization should be optional, not mandatory.

## 12) Immediate follow-up work

Recommended next docs work:
1. Add a dedicated "For Bot Hive users" setup doc.
2. Add a separate "For Bot Hive maintainers" local-dev doc.
3. Rewrite README's getting-started section to point users at the first doc and maintainers at the second.
4. Audit runtime dependencies on repo-resident files and classify each as:
   - must stay in repo
   - should move into app defaults
   - optional override
