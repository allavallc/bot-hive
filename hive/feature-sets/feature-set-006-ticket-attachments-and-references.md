# [feature-set-006] Ticket attachments and references

**Status**: active
**Owner**:

## Goal
Let tickets carry richer content than plain text — images, embedded designs, URLs to Figma / Notion / decks, and arbitrary file attachments — so UX-heavy and design-driven work can keep its primary references inside the ticket itself.

## Rationale
Today every Bot Hive ticket is pure markdown in `hive/`. Anything visual — a screenshot, a Figma frame, a wireframe, a presentation, a recorded walkthrough — has to live in another tool, with at most a hand-pasted link. For tickets where the *visual artifact is the spec* (UI changes, design reviews, copy decks, video bug repros), that's a real gap. This feature set covers the storage model, UI affordances, and rendering for attachments and structured external references on tickets. Concrete tickets and storage decisions to be drafted later.

## Implications (flagged at scaffolding time)
- **File structure in `hive/`** — attachments need a home. Options: per-ticket subfolders (`hive/attachments/HV-XXX/...`), a flat folder, or external blob storage with URLs only. Decision deferred.
- **Ticket markdown format and renderer** — needs an attachment/embed syntax (markdown image refs? a frontmatter `attachments:` array? a dedicated `## References` section?). The board renderer also needs to display them. Decision deferred.

## Tickets
_To be drafted._

## Status
Planned
