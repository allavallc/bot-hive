# Local dev setup state

Per-machine snapshot of local dev setup progress. Update as you go. Owner: whichever bot/human is doing the setup. Goes stale fast — treat as a working scratchpad, not a spec.

For the canonical setup procedure, see `README.md`.

---

## CC2 (waggle) — 2026-05-05 — `C:\Users\anthony\projects\bot-hive`

### Done
- Git, Node.js v24, GitHub CLI installed and up to date
- Repo cloned
- PostgreSQL 17 installed and running (service: `postgresql-x64-17`)
- Database `bot_hive` created
- `.env` file created — `DATABASE_URL` and `BETTER_AUTH_SECRET` filled in

### Still needed (start here)
1. **`npm install --legacy-peer-deps`** — there's a drizzle-kit/better-auth peer dep conflict that requires the flag
2. **Register a GitHub OAuth App** and fill in `.env`:
   - `GITHUB_CLIENT_ID`
   - `GITHUB_CLIENT_SECRET`
   - Callback URL: `http://localhost:3000/api/auth/callback/github`
3. **Register a GitHub App** and fill in `.env`:
   - `GITHUB_APP_ID`
   - `GITHUB_APP_PRIVATE_KEY_PATH` or `GITHUB_APP_PRIVATE_KEY`
   - `GITHUB_APP_WEBHOOK_SECRET`
4. **Run DB migration**: `npm run db:migrate`
5. **Start dev server**: `npm run dev` → http://localhost:3000
