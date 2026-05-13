# Lessons that motivated the verifier protocol

Recorded failures by agents operating in bot-hive. Each is an instance of "stated as fact what was actually a guess."

## L-NG-1 — PR superseded by another PR (PR #255 vs #256, 2026-05-13)

Agent claimed PR #255's work had landed via PR #256 because both PR titles mentioned accepting HV-130. Agent had not diffed either PR.

Truth: PR #255 had **two** changes — (a) move HV-130 ticket from `in-review/` to `done/`, and (b) append an `accept` event to `hive/events/allavallc.log`. PR #256 had only done (a) — for HV-130 *and* six other tickets — and had silently skipped (b) for all seven. Seven missing event-log entries went undetected until the user pressed "100% sure?".

**Rule extracted:** title / description ≠ behavior. Before saying "X is superseded by Y" or "X is equivalent to Y", diff both.

## L-NG-2 — Folder existence inferred from absence in recent reads (skills/, 2026-05-13)

Agent said "Bot Hive doesn't have an explicit skills file yet" because it had read AGENTS.md, HIVE.md, and bot-startup.md and seen no mention. Did not run `Glob skills/**`.

Truth: folders existed at both `skills/` (Claude Code skill packages) and `hive/skills/` (Bot Hive role rubrics — read by every bot at kickoff). Eleven files between them.

**Rule extracted:** absence from recent reads ≠ absence from repo. When the user names a noun, check if it maps to a literal path before claiming it doesn't exist.

## L-NG-3 — Memory rule violated in the next turn (2026-05-13)

Agent wrote `feedback_never_guess.md` strengthening the never-guess rule, then guessed in the next two turns (L-NG-1, then L-NG-2). Pattern: writing the rule didn't bind the same model whose claim was suspect.

**User diagnosis:** "memory rules I record don't reliably bind me. Stop relying on self-discipline."

**Rule extracted:** externalize the check. A separate verifier agent (no shared context, reads files fresh) catches what the originating agent rationalizes away. The Stop hook and PreToolUse hook are belt-and-suspenders for cases where the agent forgets to spawn the verifier.

## L-NG-4 — Hook contract guessed instead of verified (Stop hook semantics, 2026-05-13)

Agent drafted Claude Code hook scripts and claimed certainty about the JSON contracts (e.g. `Stop` returning `{"decision": "block", "reason": "..."}` to re-prompt Claude). Did not consult docs. A `claude-code-guide` subagent later flagged that `reason` shows to the user, not back to Claude — semantically different.

**Rule extracted:** harness contracts must be verified against docs or examples, not guessed from training-data memory. Spawn a domain-specific agent (`claude-code-guide`) to confirm shapes before building against them.
