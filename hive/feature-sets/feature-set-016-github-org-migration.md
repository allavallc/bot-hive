# [feature-set-016] Migrate Bot Hive repo from personal account to a GitHub organization

## Goal
Move the Bot Hive repository from `allavallc/bot-hive` (personal account) to `<org-name>/bot-hive` (GitHub organization) so the project can use **org-level features that GitHub gates behind organization ownership** — notably the merge queue (HV-080), org-level audit log, teams, and SAML/SCIM (if ever needed).

This FS captures the end-to-end migration: organization setup, repo transfer, all the callback / webhook / config URL updates that depend on the repo's full name, and post-migration validation.

## Rationale
GitHub's merge queue, despite older docs implying otherwise, is **not available on personal Free accounts** as of 2026-05-06. Confirmed in this session:
- Repository → Settings → Rules → Rulesets → "Require merge queue" option missing.
- Repository → Settings → Branches → branch protection rule edit page → "Require merge queue" option missing.
- REST `POST /repos/<owner>/<repo>/rulesets` rejects the `merge_queue` rule type with a feature-flag-style 422.

The fix isn't a plan upgrade — it's a repo location change to an org. Free tier organizations exist; no monetary cost. The migration unlocks merge queue plus a stack of org-level features the project will eventually want anyway (per-repo team permissions, audit log, branch protections-as-code at org scope, etc.).

For today's scale, HV-079 (paths-aware CI) handles the dominant queue friction (hive-only PRs land in seconds). Migration is filed for "when growth justifies the 30-minute migration cost" — not blocking immediate work.

## Operator checklist (what the human needs to do)

This is the migration the human runs; tickets within this FS support each step.

### 1. Create the GitHub organization

- Go to https://github.com/account/organizations/new.
- Pick a plan: **Free** is fine for public repos. (Team is $4/user/month if you ever need private collaboration.)
- Pick an org name. Suggestions: `bot-hive`, `allavallc-labs`, `bothive`, etc. **The repo URL becomes `<org-name>/bot-hive`** — pick a name you're happy with as a public namespace.
- Verify your email if prompted.

### 2. Transfer the repository

- On https://github.com/allavallc/bot-hive → **Settings** → scroll to **Danger Zone** → **Transfer ownership**.
- Type the org name as the new owner.
- Confirm. The transfer is instant; old `allavallc/bot-hive` URLs auto-redirect to the new location.

### 3. Update the OAuth App (sign-in)

The existing OAuth App (`Bot Hive (Prod)`) has a single callback URL field hardcoded for the personal-account-era URL. After the repo transfer:

- The web app's URL (`bot-hive-j0ax.onrender.com`) does **not** change — it lives on Render, independent of the repo location. **No OAuth callback update needed.**
- The OAuth App's "Owner" field stays as the personal account; that's fine.

### 4. Update the GitHub App (repo access + webhooks)

The GitHub App (`Hive (Prod)`) is installed on the personal account today. After repo transfer:

- The install moves with the repo automatically (GitHub re-points it).
- The app's owner is still the personal account; you can leave it there or transfer the App ownership separately if you want everything under the org. Functionally either works.
- **Webhook URL** is `bot-hive-j0ax.onrender.com/api/github/webhook` — Render-side, doesn't change.
- **Callback URL** is `bot-hive-j0ax.onrender.com/projects/install/callback` — same.

No GitHub App reconfiguration should be required. **Verify** by triggering a `hive/` commit after transfer and confirming the webhook still fires (live board updates within ~10s).

### 5. Update `render.yaml`

`render.yaml` references the repo for the auto-deploy connection. After transfer:

- In the Render dashboard → bot-hive service → **Settings** → **Build & Deploy** → **Repository**: confirm Render is following the new `<org>/bot-hive` URL. (Render usually auto-redirects via GitHub's redirect; verify by pushing a commit and seeing the deploy trigger.)
- If the Render integration drops: disconnect, reconnect against the new repo. May require granting Render access to the org.

### 6. Update local clones

Anyone with a local clone runs:

```bash
git remote set-url origin git@github.com:<org-name>/bot-hive.git
```

GitHub's redirect handles HTTP fetches automatically, but updating the remote keeps things tidy. The Bot Hive bots' `agent-id` (`<email>@<hostname>`) is unchanged.

### 7. Enable the merge queue (HV-080 follow-through)

Once the repo is org-owned:

- Settings → **Rules** → **Rulesets** → **New branch ruleset**, or apply `infra/main-merge-queue-ruleset.json` via `gh api`. Now the option appears.
- Configure per HV-080's spec (squash, build 5, min 1, max 5, wait 5 min).
- Open 3+ source PRs simultaneously to verify batching.

## Likely tickets within this FS

- Pre-migration: snapshot the `infra/` config so post-migration verification is deterministic.
- Org-creation walkthrough script / checklist (extension of the operator checklist above).
- HV-080 unblock: re-attempt the merge queue toggle once on the org. (HV-080 itself stays as the merge-queue feature ticket; this FS provides the prerequisite.)
- `render.yaml` smoke test — after migration, push a deploy and verify Render still wires correctly.
- DEPLOY.md update: refresh all `allavallc/bot-hive` references to `<org>/bot-hive` (the docs currently document the personal-account flow).
- Any GitHub-App-or-OAuth-App URL updates that turn out to be needed in practice (the checklist's "should auto-redirect" bits — probably no work, but worth a verification ticket).

## Status
Planning — to be ideated and broken into tickets when growth justifies the 30-min migration cost.

## Notes
- **No monetary cost**. GitHub Free orgs are free.
- **Migration is reversible** — if the org doesn't work out, transfer the repo back to the personal account. URLs redirect either way.
- **The agent-id convention (HV-074) does not change** — agent-ids are derived from `git config user.email` + hostname, which is operator-side, not repo-side.
- **The bot tokens (HV-064)** are project-scoped, stored in the Bot Hive DB on Render — they survive the repo move.
- Out of scope here: any *redesign* triggered by being on an org. The migration is repo-relocation only; new org-level features (teams, etc.) are tickets-as-needed later.
