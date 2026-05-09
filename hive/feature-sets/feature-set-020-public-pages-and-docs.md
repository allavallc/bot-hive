# [feature-set-020] Public pages & docs — explain Bot Hive to users

**Status**: active
**Owner**:

## Goal
Build the public-facing pages that explain what Bot Hive is, who it's for, how it works, and how to get started. Pure HTML/CSS info pages (no app interactivity needed beyond standard navigation). Lives at the same domain as the live board, but accessible without sign-in for the marketing/docs surface.

The user's first impression of Bot Hive today is `/login` and an empty board. There's no "what is this?" surface anywhere, on any page.

## Rationale
A user who lands on bot-hive-j0ax.onrender.com cold has no context for what they're looking at. They see "Sign in with GitHub" and have to either trust the name or leave. For a swarm-coordination product where the value-add is novel ("a kanban over GitHub-hosted ticket files coordinating multiple AI agents in parallel"), explaining the concept in plain language is critical to getting to first sign-in.

This FS covers the explainer surface: homepage, about, how-it-works, docs (concepts + API + FAQ), pricing (when applicable). All static-ish content; no app state needed beyond the existing routes.

## Scope (likely tickets, not yet broken into work)

- **Homepage rewrite (`/`)** — replace whatever's there with a real landing experience. Hero section explaining what Bot Hive is in one sentence. Three-section explainer: the problem, the model (kanban + bots + git), what makes Bot Hive different from existing tools (Jira, Linear, Conductor). CTA to sign in.
- **About page (`/about`)** — already exists as a stub; flesh out with the product story, the swarm-coordination thesis, who it's for.
- **How it works (`/how-it-works`)** — visual or step-by-step walkthrough: install GitHub App on a repo with `hive/`, see board, click Add a bot, swarm coordinates.
- **Docs hub (`/docs`)** — index page linking to per-topic docs.
- **Concepts docs (`/docs/concepts/*`)** — explain tickets, FSs, roles, focus, swarm panel, bots, worktrees. The "what's this thing called?" reference.
- **Quickstart (`/docs/quickstart`)** — the 5-minute path: connect repo, file a ticket, spawn a bot, watch it work.
- **FAQ (`/docs/faq`)** — common questions: how does this differ from Jira / Linear / Conductor / GitHub Projects, what auth model, what does it cost, is my code private, etc.
- **Pricing page (`/pricing`)** — already exists as a stub; flesh out when pricing is decided.
- **Footer** — link from every page back to docs / about / pricing / GitHub repo / contact.

## Design constraints

- **Pure HTML/CSS info pages.** No app state, no interactive components beyond navigation. The brutalist editorial design system already in place applies.
- **Server-rendered (Next.js).** Use the existing PageShell primitive from `src/components/page-shell.tsx`. Don't re-invent the layout.
- **Reuse the existing CSS module patterns** — no Tailwind, no new styling system. Match the masthead and footer to the existing dashboard pages.
- **Mobile-friendly enough.** Most users will land on desktop, but pages must not break at narrow widths. No fancy responsive framework needed.

## Out of scope (v1 of this FS)

- Blog / changelog (separate concern; can come later)
- Search across docs (overkill for the doc volume we'll have)
- I18n / translations (English only)
- A/B testing copy variants (premature)
- Marketing analytics beyond basic Render logs

## What "done" looks like

Someone arrives at `/` cold, scrolls the page, understands what Bot Hive is in under 60 seconds. Clicks "Get started" or "How it works." Within 5 minutes of reading they know whether the product fits their need. If they sign in, the existing onboarding takes over.

## Notes

- The user explicitly wants this filed as an FS now so it doesn't get lost. The work itself isn't urgent (pre-launch); the placeholder is what matters.
- Will likely involve copywriting decisions the user wants to make. Bots can scaffold structure but the marketing copy needs the human's voice.
