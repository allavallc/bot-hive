# [feature-set-017] Client onboarding — getting a new project from "I want this" to "live board with their tickets"

**Status**: active

## Goal
Make Bot Hive adoptable by a new project in under 10 minutes, end-to-end, with no shoulder-surfing from the Bot Hive maintainer. Today the connect flow exists but a new client has no walkthrough, no seed for the `hive/` folder, no migration path from competing tools, no UX for collaborators who lack the repo-admin permissions GitHub App install requires, and no empty-state guidance on the dashboard. This FS closes those gaps.

## Rationale
This session surfaced a concrete need: a project currently using "bot-horde" wants to switch to Bot Hive. The user is a *collaborator* on the project, not the owner. Walking through what "switching over" actually requires exposed every onboarding gap at once:

- **No empty-state UX**: when a signed-in user has no projects, the dashboard is blank, not guided.
- **No `hive/` seed template**: a new repo has no Bot-Hive-shaped folder; someone has to manually create it.
- **No collaborator path**: GitHub App installs require admin perms; a collaborator hitting "connect repo" today is stuck without clear guidance to hand off to the owner.
- **No migration story**: importing tickets from bot-horde or any other coordination tool is a manual file-by-file rewrite.
- **No onboarding doc**: there's no `docs/ONBOARDING.md` an operator can read end-to-end.

The previous session-end answer to "is Bot Hive client-ready?" was *not yet* precisely because of these gaps. This FS turns that into yes.

## Likely tickets

| | What | Effort | Type |
|---|---|---|---|
| **A** | **Dashboard empty-state UX** — when a signed-in user has no projects, render guided next steps (install the GitHub App, connect a repo, learn what Bot Hive is) instead of a blank dashboard. | S | UI — placement approval required |
| **B** | **`scripts/seed-hive.sh` + `.ps1`** — drops the canonical `hive/HIVE.md` + folder skeleton (`backlog/`, `in-progress/`, `in-review/`, `done/`, `blocked/`, `not-doing/`, `feature-sets/`) + empty `events.log`, `presence.log`, `focus.md` into a target repo. One command makes any repo Bot-Hive-ready. | S | Script + template files |
| **C** | **Owner-vs-collaborator UX** — when a collaborator clicks "Connect repo" but lacks admin perms, surface a clear "you need the repo owner to install the GitHub App" message with a copy-pasteable handoff snippet for the owner (link to install URL, brief explanation, what permissions the App needs). | S | UI — placement approval required |
| **D** | **Migration helpers** — `scripts/migrate-from-<tool>.sh` with `bot-horde` as the first concrete migrator. Reads source-tool tickets, writes Bot-Hive-shaped ticket files, preserves provenance. Generic structure that other migrators can reuse. | M | Script |
| **E** | **`docs/ONBOARDING.md`** — operator-facing walkthrough: "I have a repo, I want Bot Hive on it. Here's the end-to-end." Covers: prerequisites, owner-side GitHub App install, collaborator onboarding via derived-membership, `hive/` seed via B, optional migration via D, first push, verifying the live board. | M | Doc |

Sequence for the immediate bot-horde case: **E → B → D**. A and C are polish for the next user.

## Status
Active — first batch of tickets (E, B, D) ready to claim once a sample bot-horde ticket has been shared so D can be specific rather than generic.

## Notes
- The 10-minute target is a forcing function. If onboarding takes 30 minutes, the FS isn't done.
- "Owner does one thing, then collaborators auto-join" is the right flow given GitHub's permission model — don't try to work around it.
- Migration helpers should preserve provenance (original ticket id in a frontmatter field, ideally a backlink to the source-tool location). Audit-honesty for the inherited tickets.
- This FS pairs with FS-001 (initial onboarding for the maintainer-facing case) but is for *adopters*, not first-time Bot Hive setup.
- Out of scope: a hosted "try Bot Hive" sandbox, multi-tenant customization, or custom themes per project. v1 is "any GitHub repo can host its own kanban."
