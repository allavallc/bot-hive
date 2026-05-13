# Claude Code harness hooks

PowerShell hooks for `~/.claude/settings.json`. Provide the **backstop layer** of the verifier protocol — catch what slips through the per-response verifier agent (Layer 1) and gate destructive Bash before execution.

## Files

| File | Role |
|---|---|
| `never-guess-lib.ps1` | Shared helpers — transcript parsing, regex patterns, auto-verify, citation cross-check. Dot-sourced by the two hook scripts below. |
| `never-guess-stop.ps1` | **Stop hook.** Inspects the last assistant message; blocks the turn if it contains unverified factual claims about repo/PR/file state. |
| `never-guess-pretool.ps1` | **PreToolUse hook on Bash.** Blocks destructive commands (`gh pr close`, `gh pr merge`, `git push --force`, `git reset --hard`, `git branch -D`, `rm -rf`, `Remove-Item -Recurse -Force`, `DROP TABLE`, `TRUNCATE`, `DROP DATABASE`, `DELETE FROM`) unless a recent transcript tool call shows the target was inspected first. |
| `settings-fragment.json` | JSON fragment to merge into `~/.claude/settings.json`. |

## Install

1. **Copy the three `.ps1` files** to `~/.claude/hooks/`:

   ```powershell
   New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.claude\hooks" | Out-Null
   Copy-Item -Force never-guess-*.ps1 "$env:USERPROFILE\.claude\hooks\"
   ```

2. **Merge `settings-fragment.json`** into `~/.claude/settings.json`. Preserve any existing `hooks` entries. The fragment adds:
   - A `Stop` hook (alongside existing handlers, if any).
   - A `PreToolUse` hook with `matcher: "Bash"`.

   Easiest via the `update-config` skill: `/update-config "merge the contents of hive/verifier/hooks/claude-code/settings-fragment.json into my user settings.json, preserving existing hook entries"`.

3. **Add the rule summary** to `~/.claude/CLAUDE.md` so Claude Code reads it every session (this lives in user settings, not the repo). Recommended block:

   ```markdown
   ## ⛔ ABSOLUTE RULE — PRE-RESPONSE VERIFIER AGENT
   Before EVERY response, spawn a verifier agent that fact-checks the claims, then respond only with verified content. Full protocol: <repo>/hive/verifier/rule.md
   ```

## What's NOT included

Originally drafted but dropped:
- **UserPromptSubmit hook** — re-injected the rule before each operator prompt. Redundant with the per-response verifier (which primes implicitly).
- **SessionStart hook** — pulled lessons.md content into context at session start. Same redundancy.

Both are easy to re-add if data from `~/.claude/hooks/never-guess-violations.log` shows the regex-based detection is leaking.

## Honest limits

- **Heuristic detection.** The transcript cross-check for citation tags is heuristic — a fake `(verified: gh pr view 257)` tag with no actual matching tool call *might* slip through if the verifier's token-overlap match is loose. The Haiku judge layer in `never-guess-lib.ps1` (drafted but not enabled) would close this; it requires an `ANTHROPIC_API_KEY`.
- **Regex misses novel phrasings.** "There's no skills folder" matches; "I don't see skills anywhere" doesn't. Tune `$Script:RiskyClaimPatterns` based on what the violation log surfaces.
- **False positives.** Common verbs (`is`, `was`, `doesn't`) appear in non-claim contexts. The regex layer is intentionally conservative as a cheap negative filter; real detection is the risky-pattern + transcript-check stack.
- **Both hooks fail-open.** If a hook script crashes, it logs to `never-guess-errors.log` and exits 0 — does NOT block the turn. Defensive: better to let the agent through than break the user's session because the hook had a bug.

## Logs (after install)

- `~/.claude/hooks/never-guess-violations.log` — every blocked claim. Tune from this.
- `~/.claude/hooks/never-guess-errors.log` — hook crashes / parse failures. Should stay near-empty; if it grows, fix the hook.
