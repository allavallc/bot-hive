# Bot Hive — project rules for Claude sessions

This file is read by every Claude session that opens the bot-hive repo. It encodes the rules specific to *this* project — how we develop bot-hive, not how users use bot-hive in their own repos. Format-neutral guidance for the hive workflow itself lives in `hive/HIVE.md`.

---

## Identity (read first)

Every bot session in this repo must declare a unique handle.

```
git config bot-hive.handle CC1
```

Pick a short, memorable handle (`CC1`, `CC2`, `scout`, `forager-3`). Read it on session start:

```
git config --get bot-hive.handle
```

If unset, **stop and ask the user to set it before claiming any ticket**. Anonymous bots aren't allowed in the swarm — every commit and ticket move needs to be attributable.

The handle goes in:
- `Assigned to:` ticket field
- `Bot:` commit trailer (alongside `Model:` and `Trigger:`)
- The live board UI

Full convention: see `hive/HIVE.md` "Bot identity" section.

---

## Where work goes

The repo splits commits into two lanes:

| Kind of work | Where |
|---|---|
| Coordination metadata: `hive/` ticket files, `hive/HIVE.md`, this `CLAUDE.md`, the `README.md` | Direct to `main`. Tiny atomic commits, ordered by the git push lock. |
| Source code: anything in `src/`, `tests/`, `migrations/`, configs, `package.json` | Feature branch named `hv-XXX-<slug>`, opened as a PR, merged after CI passes. |

The reason for the split: source code can collide between bots (same file, different changes), and CI gates the merge. Coordination metadata is small, atomic, and the push lock handles ordering.

When branch protection lands (HV-033), this split is enforced by GitHub. Until then, follow it by convention.

---

## Always pull before claiming or committing to main

Stale local main = guaranteed push conflict + collision risk. The `git pull` is the subscribe step in our pub/sub model — it's how you find out what other bots have done.

If a push is rejected non-fast-forward, do NOT show raw git output. `git pull --rebase`, retry once. If it conflicts on rebase, see the conflict-response policy in `hive/HIVE.md`.

---

## Conflict response

| Failure | Action |
|---|---|
| Push to main rejected (non-fast-forward) | `git pull --rebase` and retry. |
| Branch rebase against main produces no conflict markers | `git push --force-with-lease`, let CI re-run. |
| Branch rebase produces real conflict markers | **Stop. Never guess code merges.** Move ticket to `hive/blocked/`, set `Failure mode: merge-conflict`, comment the PR, surface to the user. |
| CI fails on PR | Read CI output, attempt fix, push fix, wait. Two attempts max — then `Failure mode: failed-tests`. |
| In-progress ticket with `Last touched:` older than 2 hours (when convention lands) | May reclaim — move back to backlog with `**Reclaim reason:**`. |

The hard rule: **bots auto-resolve trivial git mechanics, but escalate substantive conflicts to humans.**

---

## Local dev

- Postgres 16 native on port 5432 (no Docker — see global rules).
- `npm run dev` starts the Next.js dev server.
- `npm run typecheck && npm run lint && npm run test` before any PR.
- Migrations: `npm run db:migrate` against local DB.
- See `README.md` for full setup.

---

## Deploy

- Prod runs on Render at `https://bot-hive-j0ax.onrender.com`. Auto-deploys from `main`.
- Staging environment is being designed in HV-035 (FS-007). Until it lands, prod is the only deploy target.
- Deploy lessons captured in `tasks/lessons.md` — read before any deploy work.

---

## Pointers

- `hive/HIVE.md` — the format spec. Read this if you're touching the hive workflow itself.
- `hive/feature-sets/` — current feature sets and their goals.
- `tasks/lessons.md` — self-correction log. Read at session start; append after corrections.
- `README.md` — project overview, quickstart for humans.
