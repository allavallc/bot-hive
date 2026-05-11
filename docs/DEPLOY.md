# Bot Hive — production deploy runbook

End-to-end deploy guide for Bot Hive on Render. Target time: **under 30 minutes** if you have the prerequisites in hand. The runbook is a checklist; do every step in order.

If you're deploying a second environment (staging, custom domain, fork) the same steps apply — you just register a *separate* OAuth App and a *separate* GitHub App because both have a single-callback-URL constraint that prevents one app from serving multiple environments. See **Why two of every GitHub app** at the bottom.

---

## Credential map (read this before starting)

You will end the deploy holding **eight secrets** distributed across **four GitHub product surfaces**, **one Render workspace**, and **one local file** (the GitHub App private key). Print or pin this map; refer to it at every step.

| Secret | Source | Goes into Render env var |
|---|---|---|
| OAuth Client ID | github.com → Settings → Developer settings → **OAuth Apps** → your prod app | `GITHUB_CLIENT_ID` |
| OAuth Client Secret | same OAuth App, "Generate a new client secret" | `GITHUB_CLIENT_SECRET` |
| GitHub App ID | github.com → Settings → Developer settings → **GitHub Apps** → your prod app | `GITHUB_APP_ID` |
| GitHub App private key (PEM) | same GitHub App, "Generate a private key" → downloads `.pem` file | `GITHUB_APP_PRIVATE_KEY` (paste full PEM) |
| GitHub App webhook secret | a string *you generate* (see Step 2.4) | `GITHUB_APP_WEBHOOK_SECRET` |
| Postgres `DATABASE_URL` | auto-wired from the Render-provisioned database | (Render sets this automatically via Blueprint) |
| `BETTER_AUTH_SECRET` | Render auto-generates with `generateValue: true` | (set automatically by Blueprint) |
| App public URL | the `https://<service>.onrender.com` URL Render assigns after first deploy | both `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` |

---

## Prerequisites

- A Render account (any plan; free tier works; Pro plan ($25/mo flat) is recommended once you also need branch protection).
- A GitHub account with permission to create OAuth Apps and GitHub Apps.
- A clone of the `bot-hive` repo on your machine, with `git remote -v` pointing at your fork (or the original).
- `gh` CLI installed and authenticated (`gh auth status` should show you logged in).
- Local Postgres if you want to test before deploy (optional).

---

## Step 1 — Create the OAuth App (sign-in)

The OAuth App handles user sign-in. It's separate from the GitHub App.

1. Go to https://github.com/settings/developers → **OAuth Apps** → **New OAuth App**.
2. Fill in:
   - **Application name**: `Bot Hive (Prod)` (the `(Prod)` suffix matters — when you eventually create dev or staging, the suffix tells you them apart)
   - **Homepage URL**: `https://bot-hive.onrender.com` *(placeholder; the real `*.onrender.com` URL is assigned after Step 5; come back here and update if Render gives you a different name)*
   - **Authorization callback URL**: `https://bot-hive.onrender.com/api/auth/callback/github`
3. Click **Register application**.
4. On the App's page, **copy the Client ID** — that's `GITHUB_CLIENT_ID`. Save it somewhere safe (a 1Password note works).
5. Click **Generate a new client secret** → copy the secret immediately (it's only shown once) — that's `GITHUB_CLIENT_SECRET`. Save it.

> ⚠️ **The callback URL field accepts ONE URL only.** You can't list multiple. So a separate OAuth App is needed for any other environment (dev, staging, second prod, custom domain). See "Why two of every GitHub app" at the bottom.

---

## Step 2 — Create the GitHub App (repo access + webhooks)

The GitHub App handles repo-level reads/writes (cloning the `hive/` folder) and receives push webhooks from connected repos.

1. Go to https://github.com/settings/apps → **New GitHub App**.
2. Fill in:
   - **GitHub App name**: `Hive (Prod)` (suffix matters per Step 1's note)
   - **Homepage URL**: same as the OAuth App
   - **Callback URL**: `https://bot-hive.onrender.com/projects/install/callback` *(this is the post-install redirect, NOT the OAuth sign-in callback)*
   - **Setup URL**: leave empty (or same as Callback URL)
   - **Webhook URL**: `https://bot-hive.onrender.com/api/github/webhook`
   - **Webhook secret** (Step 2.4 below)
3. **Repository permissions** — set these BEFORE clicking Create:
   - **Contents**: Read & write (needed to read/write `hive/` folders)
   - **Metadata**: Read-only (auto-required by GitHub for any app)
   - **Pull requests**: Read & write (needed to create accept/reject PRs from the board UI)
   - All others: leave at "No access"

   > ⚠️ **GitHub App permissions default to "No access" for everything.** If you skip this section the App is an empty shell and Step 4's install page will show "No repositories" with no option to select any. Set permissions before saving.

   > ⚠️ **Adding a permission to an existing App** requires re-approving the install. After saving the updated permissions on github.com, each user/org that has the App installed will see a banner prompting them to review and approve the new permission. Until they approve, the App's token won't include the new scope and calls requiring it will fail.

4. **Webhook secret** — generate a random 32+ char string locally:
   ```bash
   openssl rand -hex 32
   ```
   Or in PowerShell:
   ```powershell
   [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes((New-Object byte[] 32)) -join '' | ForEach-Object {[Convert]::ToBase64String([byte[]][char[]]$_)}
   ```
   Or just type a long random string into the field. **Save the value** — that's `GITHUB_APP_WEBHOOK_SECRET`.

5. **Subscribe to events** — scroll down to "Subscribe to events":
   - **Push** (required — this is how the board live-updates on `hive/` commits)
   - All others: leave unchecked

6. Click **Create GitHub App**. On the App's page, **copy the App ID** at the top — that's `GITHUB_APP_ID`. Save it.

---

## Step 3 — Generate and save the GitHub App private key

1. On your new GitHub App's page, scroll to **Private keys** → **Generate a private key**.
2. A `.pem` file downloads. **Don't lose it** — GitHub doesn't keep a copy and re-generating invalidates the old key (which would log out anyone using it).
3. Save the file somewhere safe locally:
   ```
   ~/.github-app-keys/hive-prod.pem  (Linux/macOS)
   $env:USERPROFILE\.github-app-keys\hive-prod.pem  (Windows PowerShell)
   ```
4. You'll paste the **full PEM contents** (including `-----BEGIN RSA PRIVATE KEY-----` and `-----END RSA PRIVATE KEY-----` lines) into Render in Step 6.

---

## Step 4 — Install the GitHub App on the target repo

1. On your GitHub App's page (https://github.com/settings/apps/<app-name>), click **Install App** in the left sidebar.
2. Click **Install** next to your account/org.
3. Choose **Only select repositories** → pick the repo Bot Hive should manage (`bot-hive` itself, or any repo with a `hive/` folder).
4. Click **Install**.
5. The post-install redirect tries to hit your `Callback URL` — at this stage that URL doesn't exist yet, so you'll see an error page from your browser. **That's fine.** The install itself succeeded; the redirect just has nowhere to land yet.

> If the install page shows "No repositories" with no option to pick: the GitHub App has no permissions. Go back to Step 2.3 and fix.

---

## Step 5 — Provision Render via the `render.yaml` blueprint

The repo ships with a `render.yaml` Blueprint that provisions both the Postgres and the Web Service in one shot.

1. In Render: https://dashboard.render.com → **New +** → **Blueprint**.
2. Connect your GitHub account if not already connected. Select the `bot-hive` repo.
3. Render reads `render.yaml` and shows a preview: 1 database (`bot-hive-db`, basic-256mb plan, ~$7/mo), 1 web service (`bot-hive`, free plan).
4. Click **Apply**. Render starts provisioning.
5. **Watch for deploy errors.** The first deploy will likely fail because the secret env vars aren't filled in yet. That's expected — fill them in Step 6 and re-deploy.
6. Once provisioning completes, note the URL Render assigns: `https://<service-name>-XXXX.onrender.com`. Copy it. **This URL is the truth** — go back to your OAuth App (Step 1) and your GitHub App (Step 2) and update every URL field that has `bot-hive.onrender.com` to the actual URL Render gave you.

---

## Step 6 — Fill in the Render env vars

In the Render dashboard → bot-hive service → **Environment** tab, fill in every var marked `sync: false` in `render.yaml`. Use this checklist:

| Env var | Value source |
|---|---|
| `BETTER_AUTH_URL` | The full URL from Step 5, e.g., `https://bot-hive-XXXX.onrender.com` |
| `NEXT_PUBLIC_APP_URL` | **Same** value as `BETTER_AUTH_URL`. This one is critical — see "NEXT_PUBLIC_* gotcha" below. |
| `GITHUB_CLIENT_ID` | From Step 1 |
| `GITHUB_CLIENT_SECRET` | From Step 1 |
| `GITHUB_APP_ID` | From Step 2 |
| `GITHUB_APP_PRIVATE_KEY` | The **full PEM contents** from Step 3. Paste the whole thing including the `-----BEGIN/END-----` lines. Render's UI accepts multi-line. |
| `GITHUB_APP_WEBHOOK_SECRET` | From Step 2.4 |
| `SMTP_USER` | (optional — for the contact form) Gmail address |
| `SMTP_PASS` | (optional) Gmail App Password from https://myaccount.google.com/apppasswords (requires 2FA enabled) |
| `CONTACT_TO` | (optional) where contact-form messages land |

The variables marked auto-injected (`DATABASE_URL`, `BETTER_AUTH_SECRET`) are set by Render itself via the Blueprint — leave them alone.

After saving, click **Manual Deploy → Deploy latest commit** to re-run the build with the secrets in place.

> ⚠️ **NEXT_PUBLIC_\* gotcha.** `NEXT_PUBLIC_APP_URL` is read in client code (`auth-client.ts`), and Next.js inlines `process.env.NEXT_PUBLIC_*` values **into the JS bundle at build time**. Setting it after the build runs doesn't help — the bundle was already built with the old value (or no value) baked in. So the env var must (a) exist in `render.yaml` so Render knows to require it, and (b) be filled in **before** the build that ships to users. If you skip this, sign-in fails with a CORS error because the client tries to call `localhost:3000`.

---

## Step 7 — First deploy + migration verification

1. Watch the Render deploy log. You should see, in order:
   - `npm ci` succeeds
   - `npm run build` succeeds (Next builds the bundle with all `NEXT_PUBLIC_*` env vars baked in)
   - `npm run db:migrate` succeeds (Drizzle applies migrations to the new Postgres)
   - `npm run start` boots the Next server
2. Once Render reports the deploy as live, hit the URL in a browser. You should see the Bot Hive homepage with the "Sign in with GitHub" button.
3. If the home page errors with a 500: the server failed to read some env var. Check the Render logs — they'll tell you which one.

---

## Step 8 — Smoke test

1. **Sign in.** Click **Sign in with GitHub** → you should redirect to GitHub's OAuth consent page → approve → land back on `/dashboard`. If this fails: OAuth App callback URL is wrong, or `NEXT_PUBLIC_APP_URL` is missing/incorrect.
2. **Connect a repo.** From the dashboard, click **Connect another repo →** which sends you to install the GitHub App on a repo (Step 4 above; you may have done this for one repo already, but you can install on more). Pick a repo with a `hive/` folder.
3. **Open the project board.** After install, you land on `/projects/<id>`. The board should render with whatever tickets are in that repo's `hive/backlog/`, `in-progress/`, `in-review/`, `done/` folders.
4. **Live update.** Push a commit to that repo's `hive/` folder (e.g., move a ticket between folders). Within ~5–10 seconds, the open board should refresh via SSE to reflect the change.

If all four steps work, the deploy is good. If step 4 fails, see the troubleshooting appendix on SSE.

---

## Step 9 — Enable the GitHub merge queue (HV-080)

The merge queue batches multiple auto-mergeable PRs into a single CI run instead of running CI per PR. This is the primary defense against the merge-train problem when many agents are working in parallel.

### Enable via GitHub UI

1. Open the repo → **Settings** → **Rules** → **Rulesets** → **New branch ruleset**.
2. Name: `main-merge-queue`. Enforcement: **Active**.
3. Target branches → add **Default branch**.
4. Rules → check **Require merge queue**. Configure:
   - **Merge method**: Squash and merge
   - **Build concurrency**: 5
   - **Min entries to merge**: 1
   - **Max entries to merge**: 5
   - **Wait before merging**: 5 minutes
   - **Status check timeout**: 60 minutes
   - **Grouping strategy**: All Green
5. Save.

(Older versions of GitHub put this under Settings → Branches → branch protection rules instead. Either path works; rulesets is the modern home.)

### Canonical config (config-as-code)

The desired ruleset is committed at `infra/main-merge-queue-ruleset.json`. **Note**: GitHub's REST `POST /repos/{owner}/{repo}/rulesets` endpoint currently rejects the `merge_queue` rule type with a generic `Invalid rule 'merge_queue':` 422, even with the schema-canonical body — appears feature-flag-gated as of 2026-05-06. The JSON file documents intent; once the API gap closes, an adopter can enable in one command:

```bash
gh api -X POST "repos/<owner>/<repo>/rulesets" --input infra/main-merge-queue-ruleset.json
```

Until then, use the UI path above. The JSON stays current so the migration is a one-line operation when GitHub catches up.

### Verification

After enabling: open 3+ source PRs simultaneously, all auto-mergeable. GitHub will batch them into one merge-queue group, run CI once on the batch, merge atomically. The "all PRs serial each pay full CI" pattern goes away.

If a PR in a batch fails CI, GitHub bisects to find the offender, kicks it back to the queue, retries the rest. No manual intervention.

---

## Troubleshooting appendix

### CORS errors on sign-in
- Symptom: clicking "Sign in with GitHub" returns a CORS error in the browser console; OAuth never starts.
- Cause: `NEXT_PUBLIC_APP_URL` was missing from `render.yaml` or unset at build time. The bundle defaults to `localhost:3000`, which is wrong.
- Fix: ensure `NEXT_PUBLIC_APP_URL` is in `render.yaml` AND filled in the Render dashboard, then trigger a fresh deploy. The fresh build will inline the right URL.

### Sign-out or install redirect lands on `localhost`
- Symptom: any redirect from a server action / API route bounces you to `http://localhost:10000` (or :3000) instead of the prod URL.
- Cause: the route is constructing a redirect URL via `new URL(path, req.url)`. Behind Render's reverse proxy, `req.url` reports the upstream localhost, not the public origin.
- Fix: use a helper that prefers `process.env.BETTER_AUTH_URL`:
  ```ts
  const base = process.env.BETTER_AUTH_URL ?? new URL(req.url).origin;
  return new URL(path, base);
  ```
- Already fixed in `bot-hive` per HV-024 / commit `eb9f53f`. If you're forking and seeing this, check that the fix is present.

### GitHub App install page shows "No repositories"
- Cause: the GitHub App has no Repository permissions set (Step 2.3 was skipped).
- Fix: go to your App's settings, set Contents (Read/Write), Metadata (Read), and Pull requests (Read/Write), save. The install page will then show your repos. Existing installs will require re-approval after the permission change.

### "Authorization callback URL doesn't match"
- Cause: the URL on github.com (Step 1.2 or Step 2.2) doesn't match the URL the app actually hit.
- Fix: copy/paste the exact URL Render assigned (no trailing slashes, exact protocol). Often the issue is `http` vs `https` or a missing path component.

### Webhook isn't firing on push
- Symptom: pushing to a connected repo's `hive/` folder doesn't update the live board.
- Causes (in likelihood order):
  1. Push events aren't subscribed (Step 2.5 — re-check).
  2. The GitHub App isn't installed on that specific repo (or not given access to that repo). Check the App's installation page on github.com.
  3. The webhook URL is wrong (Step 2.2 — the URL field, not the OAuth callback URL).
  4. The webhook secret doesn't match between GitHub (Step 2.4) and Render (`GITHUB_APP_WEBHOOK_SECRET`).
- To debug: in your GitHub App's settings, click **Advanced** → **Recent Deliveries**. Each push attempt is logged with the full request and the server's response. A 401 means signature mismatch (secret); a 404 means wrong webhook URL; a 500 means the server got the webhook but errored processing it.

### `npm ci` fails with peer dep conflict
- Symptom: build fails with `ERESOLVE` errors related to drizzle-kit and better-auth.
- Cause: known peer dependency conflict between drizzle-kit and better-auth versions.
- Fix: the `render.yaml` build command should use `npm ci --legacy-peer-deps`. Already correct in `bot-hive`'s `render.yaml`; if forking, check.

### Migration step fails on first deploy
- Symptom: `npm run db:migrate` errors during deploy.
- Cause: usually the `DATABASE_URL` env var is set but Postgres isn't reachable yet (race condition with Render's database provisioning).
- Fix: just retry the deploy. The database is up by then.

### Sessions get logged out unexpectedly / "your GitHub access is stale"
- Symptom: dashboard shows no projects even though the user has access.
- Cause: in-memory cache of the user's GitHub repo list got wiped (Render free-tier sleep clears process memory) or the OAuth token in the DB was revoked at sign-out and not refreshed.
- Fix: sign out + sign back in. The "Don't see a repo you expected? Sign out and back in to refresh your GitHub access." hint on the dashboard exists for this case.

---

## Why two of every GitHub app

Bot Hive needs two GitHub products: an **OAuth App** for sign-in, and a **GitHub App** for repo access + webhooks. Each has a Callback URL field that holds **exactly one URL** — not a list. So if you want to deploy multiple environments (dev + prod, prod + staging, prod + custom domain), you need a **separate OAuth App and a separate GitHub App for each environment**.

The pattern is:

| Environment | OAuth App | GitHub App |
|---|---|---|
| Local dev | `Bot Hive (Dev)` — callback `http://localhost:3000/...` | `Hive (Dev)` — webhook → smee.io tunnel |
| Production | `Bot Hive (Prod)` — callback `https://bot-hive-XXXX.onrender.com/...` | `Hive (Prod)` — webhook → prod URL |
| Staging (HV-035, future) | `Bot Hive (Staging)` — callback `https://bot-hive-staging.onrender.com/...` | `Hive (Staging)` — webhook → staging URL |

Each environment has its own four secrets (Client ID, Client Secret, App ID, Private Key) plus its webhook secret. **Don't try to share apps across environments — the URLs collide.**

---

## What's NOT in this runbook

- **Custom domain configuration** — Render's docs cover this end-to-end; once your custom domain is wired up, update the OAuth App's callback URL to the new domain and you're done.
- **Render Pro plan / branch protection setup** — see `docs/BRANCH_PROTECTION.md`.
- **Staging environment** — see ticket HV-035 (deferred) for the staging plan.
- **Sentry / error monitoring** — see ticket HV-026.
- **Email verification setup** — Bot Hive uses GitHub OAuth for sign-in only; no email verification flow exists today.
- **Multi-region or HA deployment** — not in scope; single-region single-replica is sufficient pre-launch.

---

## When this runbook needs updating

- GitHub UI changes its labels or paths (rare but happens).
- Render changes the Blueprint flow.
- A new env var gets added to `render.yaml`.
- A new gotcha surfaces during a deploy — append to the Troubleshooting appendix.

The doc is a living artifact. The hive workflow itself catches most of these (`tasks/lessons.md` is where new gotchas go first; promote them here when they're reusable).
