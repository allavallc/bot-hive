# Bot tokens

Project-scoped HTTP tokens that let bots publish to the Bot Hive signal API without a logged-in browser session. Issued by humans, scoped to a single project, revocable.

## Why

The signal channel (HV-047) accepts requests authenticated via Better Auth session cookies. That works for the swarm-panel UI in a logged-in browser, but a Claude Code session in a terminal doesn't have that cookie. Bot tokens close the gap: a bot uses an `Authorization: Bearer bh_<token>` header to publish signals, the same way the human UI does via cookie.

## Issuing a token

There's no UI for token management yet (HV-065 will add one). For now, use the CLI helper:

```bash
# Grab your session cookie:
#   1. Open Bot Hive in your browser, sign in.
#   2. DevTools → Application → Cookies → copy `better-auth.session_token`.
#
# Then:
export BOT_HIVE_BASE_URL=https://bot-hive-j0ax.onrender.com
export BOT_HIVE_SESSION_COOKIE="better-auth.session_token=eyJ..."

./scripts/create-bot-token.sh \
  --project <project-id> \
  --name "kestrel-laptop"
```

The script prints the raw token **once** (it's never retrievable again — store it in your password manager / `.env` immediately) plus a sample curl command for publishing signals.

## Using a token

Pass it as `Authorization: Bearer bh_<token>`:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer bh_xxxx..." \
  -d '{"type": "claim", "message": "starting HV-XXX", "refs": ["HV-XXX"]}' \
  https://bot-hive-j0ax.onrender.com/api/projects/<project-id>/signals
```

The same Bearer auth works for SSE subscribe (`GET /api/projects/<id>/signals/stream`).

## Listing tokens

```bash
curl -H "Cookie: $BOT_HIVE_SESSION_COOKIE" \
  https://bot-hive-j0ax.onrender.com/api/projects/<project-id>/bot-tokens
```

Returns the list of active (non-revoked) tokens — name, id, createdAt, lastUsedAt. Raw tokens are never returned by GET.

## Revoking a token

```bash
curl -X DELETE \
  -H "Cookie: $BOT_HIVE_SESSION_COOKIE" \
  https://bot-hive-j0ax.onrender.com/api/projects/<project-id>/bot-tokens/<token-id>
```

Sets `revoked_at`. Subsequent requests with that token return 401.

## Security notes

- Raw tokens are 32 random bytes (256 bits). The DB stores only the SHA-256 hash, so a DB breach doesn't leak usable tokens.
- The `bh_` prefix lets you grep logs / repos / clipboards for accidentally-leaked tokens.
- If a token leaks: revoke it. Then create a new one.
- Tokens don't expire on their own. Revoke them when no longer needed.
- Tokens are project-scoped: a token for project A cannot publish signals to project B.
- Tokens never grant the ability to mint more tokens — bot bootstrap is human-only by design.

## Future work

- **UI for token management** (HV-065) — a small modal in the masthead for creating / listing / revoking tokens, instead of curl.
- **Token expiry** — defer until v2; revoke + create-new is the current rotation primitive.
- **Per-token scopes** — defer; v1 is "valid token = full project signal API."
