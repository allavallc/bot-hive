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
