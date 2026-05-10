# Ideas to consider

Parking lot for ideas, half-formed product thoughts, and "we should discuss this" items.

**Bots do not pick work from this folder.** `my-work.{sh,ps1}` only scans `hive/backlog/`. Anything in `ideas-to-consider/` is invisible to the bot DAG-walk by design.

## When to file something here vs as a backlog ticket

- **Backlog ticket**: when the work is well-enough specified that another agent could pick it up and start. The "Done when" list is concrete; the goal is unambiguous.
- **Ideas-to-consider**: when the idea is a question more than a task. ("What should `<thing>` look like?", "We should think about X.", "Maybe we want a way to Y.") When you and the human still need to discuss the shape before any work is real.

The path from ideas → backlog is: humans + orchestrator discuss the idea, agree on shape, file a backlog ticket (or a feature set + tickets), then delete the idea file.

## Format

**One file: `ideas.md`.** All live ideas live there as sections so you can scan them at once.

Each section follows this shape:

```markdown
## [YYYY-MM-DD] @<github-handle> — <one-line title>

1-3 short paragraphs of context.

**Open questions**
- ...
- ...

**Status:** parking | discussing | ready-to-file
```

The date and handle attribute the idea so it persists across humans (e.g. another colony owner can see it was `@allavallc` who suggested it on a specific date).

When an idea is promoted to a backlog ticket or feature-set, **delete its whole section from `ideas.md`**. The ticket / FS is the source of truth from that point on; the idea file holds only what's still in parking-lot state.

## Future direction

The DB-backed suggestions inbox (FS-025) will eventually absorb the formal-track ideas — see the entry in `ideas.md` for the proposal. When that lands, this folder stays as the casual parking lot for orchestrator-conversation captures, and the DB inbox becomes the addressable "idea #X" path.
