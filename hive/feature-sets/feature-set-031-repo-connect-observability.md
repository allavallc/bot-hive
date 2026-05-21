# [feature-set-031] Repo connect observability

**Status**: active
**Owner**:

## Goal

Make the "Connect Repo" flow observable end-to-end so Bot Hive operators can quickly see where adopters get stuck: before GitHub install, during GitHub install, on redirect back to Bot Hive, or during post-install sync/scaffolding.

## Rationale

The current repo-connect flow can fail in multiple layers with weak visibility:

1. The `/projects/new` page depends on GitHub App credentials and can fail before the user ever leaves Bot Hive.
2. The GitHub App install screen can block progress because of missing permissions, repo-selection confusion, or owner-vs-collaborator mismatches.
3. The `/projects/install/callback` handler can fail while listing installation repositories, scaffolding `hive/`, inserting the project row, or running initial sync.
4. Today we only have sparse server-side logging for some callback failures. That makes support slow and reactive: the operator has to ask the user what they clicked, infer which layer failed, and often reproduce the issue manually.

This FS adds structured, privacy-conscious logging and a minimal success/failure trace so we can answer: "where exactly did this connect attempt fail, for which user/project/install, and what was the first failing step?" without guessing.

## Tickets

- **HV-147** — Add structured lifecycle logging for repo connect and install callback flow

## Ticket order

HV-147 first. Follow-up tickets can build on the emitted events once we know which failure modes are common.

## Out of scope

- Full product analytics pipeline or third-party event tooling.
- User-facing error redesign for collaborator/permission/install failures.
- Long-term audit-log storage or admin UI for browsing connect attempts.
- Logging OAuth sign-in internals beyond what is needed to correlate a repo-connect attempt.
