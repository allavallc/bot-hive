# Ideas to consider

Parking lot for ideas, half-formed product thoughts, and "we should discuss this" items.

**Bots do not pick work from this folder.** `my-work.{sh,ps1}` only scans `hive/backlog/`. Anything in `ideas-to-consider/` is invisible to the bot DAG-walk by design.

## When to file something here vs as a backlog ticket

- **Backlog ticket**: when the work is well-enough specified that another agent could pick it up and start. The "Done when" list is concrete; the goal is unambiguous.
- **Ideas-to-consider**: when the idea is a question more than a task. ("What should `<thing>` look like?", "We should think about X.", "Maybe we want a way to Y.") When you and the human still need to discuss the shape before any work is real.

The path from ideas → backlog is: humans + orchestrator discuss the idea, agree on shape, file a backlog ticket (or a feature set + tickets), then delete the idea file.

## Format

Plain markdown, no frontmatter required. Filename describes the topic (e.g. `swarm-kickoff.md`, `cross-colony-templates.md`). Keep each file short — one idea per file. If an idea grows multiple sub-questions, split into multiple files.

If an idea matures into actual work, link from the new ticket / FS back to the originating idea file in the body, then delete the idea file. The ticket is the source of truth from then on.
