# [feature-set-005] Production deploy

**Status**: active
**Owner**: allavallc

## Goal
Run Bot Hive on Render with managed Postgres, a public URL, and Sentry error monitoring — turning the local dev v1 into a deployed product anyone can sign into.

## Rationale
Bot Hive runs only on a local dev machine today. Demoing or letting a second person actually use it requires a real deploy — host setup, env wiring, managed Postgres, GitHub App webhook URL update, plus prod-grade observability. Render is the chosen host (long-lived SSE works natively, managed Postgres on the same platform, simple Node deploys). Bundling these into one feature set keeps deploy concerns from leaking into product tickets.

## Tickets
- HV-022 — Load GitHub App private key from env var contents (not file path)
- HV-023 — Provision Render Web Service + Render Postgres + first deploy
- HV-024 — Wire prod URLs into GitHub OAuth App + GitHub App (callback + webhook)
- HV-025 — Production smoke test (sign-in, connect repo, live board, HV-019 multi-account)
- HV-026 — Sentry error monitoring on prod

## Status
In progress
