# Bot Horde — historical build instructions (archived)

> **Note:** this is an archived build-instructions document from an earlier era of the project (when feature sets and the visual board were being added). Some of the directives here are stale — directory naming has been finalized as `bot-horde/feature-sets/` (hyphenated, not "feature sets"), the generated board is `bot-horde/board.html` (not `bot-horde-board.html`), the ticket prefix is `BH-` (not `CM-`), and the design has since been redone in a brutalist style per `plan/style-guide.md`. Refer to the current code and `bot-horde/BOTHORDE.md` for the live spec; this file is kept for historical context only.

## Overview

We are adding two things to Bot Horde:
1. Feature Set support — a way to group tickets under a named goal
2. A visual board — a single HTML file that shows all tickets in two views

---

## Step 1 — Update the folder structure

Ensure the following folders exist inside `bot-horde/`, each with a `.gitkeep`:

```
bot-horde/backlog/.gitkeep
bot-horde/in-progress/.gitkeep
bot-horde/done/.gitkeep
bot-horde/blocked/.gitkeep
bot-horde/feature sets/.gitkeep
```

---

## Step 2 — Create an example feature set file

Create `bot-horde/feature sets/feature set-001.md`:

```markdown
# Feature Set 1 — [your goal here]

- **Status**: active
- **Goal**: One sentence describing what this feature set achieves
- **Tickets**: CM-001, CM-002
```

Feature Set status options: `active` | `complete` | `planned`

---

## Step 3 — Create build.sh at the repo root

`build.sh` reads all ticket files and feature set files, then generates `bot-horde-board.html`.

The script should:

1. Read all `.md` files in `bot-horde/backlog/`, `in-progress/`, `done/`, `blocked/`
2. Parse each ticket file to extract: ID, title, status, priority, effort, assigned_to, started, completed
3. Read all `.md` files in `bot-horde/feature sets/`
4. Parse each feature set file to extract: name, goal, status, ticket IDs
5. Generate `bot-horde-board.html` with all data embedded as a JSON blob in a `<script>` tag
6. Print "bot-horde-board.html updated" when done

Make `build.sh` executable.

---

## Step 4 — Create bot-horde-board.html

A single self-contained HTML file. No external dependencies. All CSS and JS inline.

### Design requirements

- Clean, minimal, professional — aesthetic similar to Linear or Notion
- Works in any modern browser
- No framework, no build step, just HTML/CSS/JS
- Dark and light mode support via `prefers-color-scheme`
- Single file, fully self-contained — no external requests except one Google Fonts import for Inter

### Typography
- Font: Inter via Google Fonts — `https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap`
- Base size: 14px
- Line height: 1.6
- Headings: 500 weight, not bold

### Colors — light mode
- Background: #ffffff
- Surface (cards): #fafafa
- Border: #e5e5e5
- Text primary: #111111
- Text secondary: #666666
- Text muted: #999999
- Accent (active tab, links): #111111

### Colors — dark mode (prefers-color-scheme: dark)
- Background: #111111
- Surface (cards): #1a1a1a
- Border: #2a2a2a
- Text primary: #f5f5f5
- Text secondary: #888888
- Text muted: #555555
- Accent: #f5f5f5

### Priority badge colors (both modes)
- Critical: background #fee2e2, text #991b1b
- High: background #ffedd5, text #9a3412
- Medium: background #fef9c3, text #854d0e
- Low: background #f1f5f9, text #475569

### Layout
- Max width: 1280px, centered
- Header: project name left, "generated at" timestamp right, bottom border
- Tab switcher: two tabs "Board" and "Feature Sets", pill style, top of content area
- Bucket view: four equal columns in a horizontal grid, column header shows name + ticket count
- Feature Set view: stacked sections, each with feature set name, goal, status badge, progress bar, then ticket cards in a horizontal row

### Cards
- Background: surface color
- Border: 1px solid border color
- Border radius: 8px
- Padding: 12px 14px
- Gap between cards: 8px
- Show: ID (muted, monospace), title (primary, 500 weight), priority badge, effort badge, assigned to (muted, small)
- Hover: border color darkens slightly, cursor pointer
- Click to expand: smooth CSS transition reveals goal, why, done when checklist, notes beneath the card — no page jump, inline expand

### Progress bar (feature set view)
- Height: 4px
- Background: border color
- Fill: #111111 (light) / #f5f5f5 (dark)
- Border radius: 2px
- Show "X / Y tickets done" in muted text beside it

### Transitions
- Tab switch: opacity fade 150ms
- Card expand/collapse: max-height transition 200ms ease
- Card hover: border-color transition 100ms

### Empty states
- If a column or feature set has no tickets, show a muted centered message: "No tickets"

### Two views — toggled by a tab at the top

**View 1: Bucket view**
- Four columns: Backlog, In Progress, Done, Blocked
- Each ticket is a card showing: ID, title, priority badge, effort badge, assigned to
- Click a card to expand and see full details (goal, why, done when, notes)

**View 2: Feature Set view**
- One section per feature set, showing feature set name, goal, and status
- Tickets listed under their feature set as cards
- Tickets not assigned to any feature set shown in an "Unassigned" section at the bottom
- Each feature set shows a simple progress bar: done tickets / total tickets

### Data

All ticket and feature set data is embedded in the HTML as a JSON blob in a `<script>` tag at the bottom, injected by `build.sh`. The format is:

```json
{
  "tickets": [
    {
      "id": "CM-001",
      "title": "...",
      "status": "done",
      "priority": "High",
      "effort": "M",
      "assigned_to": "Alex",
      "started": "2025-01-14 09:30",
      "completed": "2025-01-14 14:00",
      "goal": "...",
      "why": "...",
      "done_when": ["criterion 1", "criterion 2"],
      "notes": "..."
    }
  ],
  "feature sets": [
    {
      "id": "feature set-001",
      "name": "Feature Set 1 — MVP Auth",
      "goal": "...",
      "status": "active",
      "tickets": ["CM-001", "CM-002"]
    }
  ],
  "generated": "2025-01-14T10:00:00Z"
}
```

---

## Step 5 — Update BOTHORDE.md

Add the following rules to the existing `BOTHORDE.md`:

### Feature Set rules

- A feature set is a named goal or milestone, not a time box
- Feature Set files live in `bot-horde/feature sets/`
- When the user asks "can you suggest a feature set?" — read the backlog, group tickets by theme, propose a `feature set-XXX.md` file, wait for human confirmation before creating it
- Use the next available feature set number

### Board rules

- After every ticket is completed, run `bash build.sh` to regenerate `bot-horde-board.html`
- After every feature set is created or updated, run `bash build.sh`
- Never edit `bot-horde-board.html` directly — it is always generated by `build.sh`

---

## Step 6 — Update README.md

Add a section explaining:
- The feature set concept (goal-based, not time-based)
- How to view the board (open `bot-horde-board.html` in a browser, or serve via GitHub Pages / Netlify / Vercel)
- How to regenerate the board manually: `bash build.sh`
- That `bot-horde-board.html` should be committed to the repo so teammates can always open the latest version

---

## Step 7 — Verify

1. Run `bash build.sh` — confirm `bot-horde-board.html` is generated
2. Open `bot-horde-board.html` in a browser — confirm both views load
3. Confirm the example feature set and any existing tickets appear correctly

---

## What NOT to do

- Do not add any npm packages, node modules, or build systems
- Do not use React, Vue, or any frontend framework
- Do not create any server or backend
- Do not modify any existing ticket files
- Do not put `bot-horde-board.html` in `.gitignore`
