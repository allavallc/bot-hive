# Verifier — never-guess protocol for AI agents

A two-layer protocol that forces AI agents (Claude Code, Codex, Cursor, Gemini, etc.) operating in this repo to verify factual claims about repo / code / PR / file state before sending them to the human operator.

**Why this exists:** Agents pattern-match plausible-sounding answers from training and partial context, then state them as facts. Memory rules ("never guess") don't bind reliably — the same model that violates the rule decides whether to apply it. This protocol replaces self-discipline with structural enforcement.

## The two layers

**Layer 1 — pre-response verifier agent (every response).** Before sending any user-facing message, the agent spawns a separate verifier agent (no shared context) that fact-checks the claims by reading files and running tools. Only verified content gets sent. No carve-outs.

**Layer 2 — harness hooks (Claude Code, for now).**
- **Stop hook** catches messages that slip through Layer 1 (e.g. agent forgot to spawn).
- **PreToolUse hook on Bash** blocks destructive tool calls (`gh pr close`, `rm -rf`, `git reset --hard`, `DROP TABLE`, etc.) unless the target was inspected earlier in the transcript.

Hooks gate destructive **actions** at execution time. The verifier gates user-facing **claims** at response time. Neither covers the other's gap.

## Files

- `rule.md` — agent-neutral protocol. Every agent reads this on startup.
- `lessons.md` — incident catalog: the specific failures that motivated this.
- `hooks/claude-code/` — harness hooks for Claude Code (PowerShell). See its README for install.
- `hooks/<other-agent>/` — per-agent placeholders. Each agent's harness needs its own equivalent of Stop + PreToolUse.

## Install summary

- **Claude Code**: see `hooks/claude-code/README.md`.
- **Other agents**: read `rule.md`. The protocol works without harness backstops; it just becomes self-discipline at that point. Per-agent hook implementations are TODO — contribute under `hooks/<agent>/`.

## Sharing this protocol with another project

Copy the entire `verifier/` folder into the other repo. Read `hooks/claude-code/README.md` for the per-machine install. Update `rule.md` references if your repo conventions differ.
