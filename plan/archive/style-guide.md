# SimplifyOps Style Guide

The design system extracted from the live site. Source of truth: `index.html`, `blog/index.html`, `_layouts/post.html`. When in doubt, match the homepage.

CSS lives inline in each template (no shared stylesheet). When changing a token, update **all three files** to keep them in sync.

---

## 1. Design Principles

- **Editorial brutalism.** Heavy display type, hairline rules, generous space, asymmetric grids. Industrial, not corporate.
- **Dark by default.** Near-black background, warm off-white ink, single rust accent. No gradients, no shadows on chrome, no rounded cards.
- **Mono for metadata.** Anything that's not a headline or body paragraph — labels, kickers, numbers, dates, nav, buttons — uses JetBrains Mono in uppercase with wide tracking.
- **Lines do the work.** 1px hairline borders separate every section, grid cell, and form field. No filled cards.
- **Movement is ambient.** Floating SVG circuit shapes drift behind everything at low opacity. Disabled when `prefers-reduced-motion`.

---

## 2. Color Tokens

| Token | Hex / value | Use |
|---|---|---|
| `--bg` | `#0a0a0a` | Page background |
| `--bg-2` | `#111111` | Hover background, alt section, code blocks |
| `--ink` | `#f2f1ee` | Primary text, headlines |
| `--ink-soft` | `#d5d3cf` | Long-form body copy (post-content only) |
| `--ink-dim` | `#8a8680` | Body copy, nav, dim labels |
| `--ink-dimmer` | `#55514c` | Numerals, footer, faintest text, floaters |
| `--line` | `#1f1d1b` | All hairline rules and borders |
| `--accent` | `#c4724a` | Single accent — links, hovers, rules, highlights |
| `--accent-dim` | `rgba(196, 114, 74, 0.35)` | Reserved (homepage only) |

**Rules**

- One accent. Don't introduce greens, blues, or status colors. Errors and success states should still use `--accent` plus copy.
- `::selection` is always `--accent` background, `--bg` text.
- Backdrop-blurred chrome: `rgba(10, 10, 10, 0.75)` (homepage) or `0.8` (blog/post) with `backdrop-filter: blur(14px)`.

---

## 3. Typography

### Families

| Token | Stack | Role |
|---|---|---|
| `--display` | `'Big Shoulders Display', 'Inter', sans-serif` | Headlines, logo, blockquotes, eyebrows of weight |
| `--sans` | `'Inter', -apple-system, BlinkMacSystemFont, sans-serif` | Body, form inputs |
| `--mono` | `'JetBrains Mono', ui-monospace, monospace` | Labels, nav, numerals, dates, buttons, footer |

Loaded via Google Fonts in each `<head>`. Weights:
- Big Shoulders Display: **500, 700, 900**
- Inter: **300, 400, 500, 600** (post layout also loads 700)
- JetBrains Mono: **400, 500**

### Type scale

| Element | Size | Weight | Tracking | Case |
|---|---|---|---|---|
| Hero title (homepage) | `clamp(4.5rem, 14vw, 11rem)` | 900 | `-0.02em` | UPPER |
| Page title (blog index) | `clamp(3rem, 8vw, 5.5rem)` | 900 | `-0.01em` | UPPER |
| Post title | `clamp(2.5rem, 6vw, 4rem)` | 900 | `-0.01em` | UPPER |
| Section title (h2) | `clamp(2rem, 5vw, 3.5rem)` | 700 | `-0.01em` | UPPER |
| Pillar h3 | `2rem` | 700 | `0.02em` | UPPER |
| Post-content h2 | `1.75rem` | 700 | `0.01em` | UPPER |
| Post-list h2, philosophy quote | `1.75rem` / `1.75rem` | 700 / 500 | `0.01em` / `0` | UPPER |
| Post-content h3 | `1.375rem` | 700 | `0.01em` | UPPER |
| Blog link h3, expertise h3 | `1.5rem` | 500–700 | `0.01em` | UPPER |
| Logo | `1.25rem` | 900 | `0.05em` | UPPER |
| Body | `1rem` (16px) | 400 | normal | sentence |
| Body large (philosophy, contact) | `1.0625rem` | 400 | normal | sentence |
| Post body | `1.0625rem` | 400 | normal | sentence |
| Hero tagline | `1.125rem` | 400 | normal | sentence |
| Section label / mono UI | `0.7rem`–`0.8rem` | 500 | `0.15em`–`0.3em` | UPPER |
| Footer / fine print | `0.7rem` | 400 | `0.15em` | UPPER |

**Line-height conventions**

- Display headlines: `0.85`–`0.95` (tight, brutalist)
- Body: `1.6`
- Long-form post body: `1.8`
- Mono labels, footer, hero meta: `1.6`–`1.8`

### Type rules

- Display headlines and all mono UI text are **UPPERCASE**. Sentence case is reserved for body, taglines, post body, and form inputs.
- Tracking on mono UI runs **wide**: `0.15em` minimum, `0.25em`–`0.3em` for kickers and section labels.
- Display headlines have negative tracking (`-0.01em` / `-0.02em`); body has none.
- The hero uses a stroked second row (`row-2`): `color: transparent; -webkit-text-stroke: 2px var(--ink);` with a `0.6em` left indent. Reserve this treatment for the hero only.

---

## 4. Layout & Spacing

### Containers (different per template)

| Template | `max-width` |
|---|---|
| Homepage (`index.html`) | `1280px` |
| Blog index (`blog/index.html`) | `960px` |
| Post layout (`_layouts/post.html`) | `720px` |

All containers use `margin: 0 auto; padding: 0 2rem;`.

### Vertical rhythm

- Section padding: `7rem 0` desktop, `4rem 0` mobile (≤600px).
- Hero: `min-height: 100vh`, `padding: 8rem 0 6rem`.
- Contact: `padding: 10rem 0 8rem`.
- Article: `padding: 6rem 0 4rem`.
- Post-content `h2`: `margin-top: 3rem`. `h3`: `margin-top: 2.5rem`. Paragraphs: `margin-bottom: 1.5rem`.

### Grids

| Pattern | Columns |
|---|---|
| Pillars | `repeat(3, 1fr)` with `1px solid var(--line)` borders on every side |
| Expertise | `repeat(2, 1fr)`, alternating `padding-left` via `:nth-child(even)` |
| Philosophy | `1fr 1fr` with `gap: 6rem` |
| Contact | `1fr 1fr` with `gap: 6rem` |
| Hero sub | `1fr auto` (tagline + meta) |
| Blog/post link rows | `60px 1fr auto` (number / title / date) |

All multi-column grids collapse to `1fr` at `≤900px`.

### Breakpoints

- `≤900px`: grids collapse, `expertise-item` borders reset, blog link drops the date column.
- `≤600px`: nav becomes a slide-in drawer triggered by `.menu-toggle`, sections compress to `4rem 0`, post body drops to `1rem`.

---

## 5. Components

### Header

- Fixed on homepage (`position: fixed`), static on blog/post. Both use `backdrop-filter: blur(14px)`.
- Logo: `Simplify<span>Ops</span>` — the `Ops` half is `--accent`.
- Nav: mono, uppercase, `0.75rem`, `0.1em`–`0.15em` tracking. Hover → `--ink` (homepage) or `--accent` (blog/post).
- Homepage adds a `.scrolled` class past 50px scroll that draws a `--line` bottom border.
- Mobile (`≤600px`): hamburger toggle (`.menu-toggle`) animates into an X; nav slides in from the right at 70% width.

### Hero (homepage only)

- `.hero-kicker` — mono, `0.3em` tracking, prefixed with a 40px `--accent` rule.
- `.hero-title` with `.row` and `.row-2` (stroked).
- `.tick` — single `--accent` period after "Simplify".
- `.hero-sub` — grid splitting tagline (`--ink-dim`, max-width `520px`) from `.hero-meta` (mono, right-aligned, `--ink-dimmer` with `--ink` strongs), separated from the title by a top `--line` border.

### Section label (`.section-label`, `.page-label`, `.post-meta`)

The recurring eyebrow. Mono, uppercase, `0.7rem`, `0.25em` tracking, `--accent`, prefixed with a 24px `--accent` rule via `::before`. Use above every `section-title`.

### CTA link (`.cta-link`)

Inline-flex, mono, uppercase, `0.15em` tracking, `1px solid --ink` bottom border. Hover swaps to `--accent` and translates the inline arrow `6px` right. Width is `fit-content`. Use for primary inline CTAs.

### Submit button (`.submit-btn`)

Outlined: transparent fill, `1px solid --ink`, mono, uppercase, `0.2em` tracking, `1rem 2rem` padding. Hover fills `--accent` with `--bg` text. Reserved for form submit.

### Pillars

3-column grid with full hairline borders on all sides — borders form a tic-tac-toe lattice. Each `.pillar` is `3rem 2rem`, hover → `--bg-2` background and `--accent` on the number. Numeral block (`.pillar-number`) is mono, `0.75rem`, `2.5rem` margin-bottom.

### Expertise items

Two-column grid where every item is `60px | 1fr` (number | content). Even items push padding-left and pick up a `--line` left border for the alternating-rule effect.

### Philosophy

Two columns: prose left (`--ink-dim`, `1.0625rem`, `line-height: 1.8`), pull quote right (display, `1.75rem`, weight 500, UPPERCASE, `2px` `--accent` left border, `2rem` left padding). Section sits on `--bg-2`.

### Blog link rows (`.blog-link`, `.post-link`)

Three-column grid `60px 1fr auto` with hairline bottom border. Hover slides content right by `1rem` (`padding-left: 1rem`) and turns the title `--accent`. Number is mono `--ink-dimmer`. Date is mono `0.7rem`, right-aligned, hidden ≤900px.

### Form fields

Bare inputs with `border-bottom: 1px solid --line` only — no boxes, no fills. Labels above (mono, `0.7rem`, `0.2em` tracking, `--ink-dim`). Focus → `border-bottom-color: --accent`. Honeypot field is `.hp-field { position: absolute; left: -9999px }`.

### Post content (`.post-content`)

Long-form prose styling. Body is `--ink-soft` (slightly dimmer than `--ink`). Strong → `--ink`. Links → `--accent` with `1px` `--accent` underline; hover drops to `opacity: 0.7`. List markers are `--accent`. Blockquotes use the philosophy-quote treatment. Inline `<code>` is mono with `--bg-2` background and `--accent` text; `<pre>` is `--bg-2` with a `--line` border.

### Floaters (background motion)

Decorative SVG circuit shapes (`#chip-wide`, `#chip-square`, `#connector`, `#dots`) drift across the viewport. Inlined as `<symbol>` defs in each template.

- Homepage: `FLOATER_COUNT = 9`, opacity `0.18`–`0.43`, speed `0.08`–`0.26`.
- Post layout: `FLOATER_COUNT = 4`, opacity `0.10`–`0.25`, speed `0.05`–`0.17`.
- Color is always `--ink-dimmer`.
- Disabled entirely when `prefers-reduced-motion: reduce`.

---

## 6. Iconography

- All icons are inline SVG, `stroke="currentColor"`, `stroke-width: 1.2`, `stroke-linecap="square"`. No filled glyphs, no icon font.
- Arrow: `M1 5h17M14 1l4 4-4 4` at `20×10` (CTA) or `16×8` (small).
- Background symbols are decorative only (`aria-hidden="true"`) and live in a hidden `<svg>` defs block.

---

## 7. Motion

- Default transition: `0.2s`–`0.25s ease` on `color`, `border-color`, `background`, `transform`.
- CTA arrow: `transform: translateX(6px)` on hover.
- Blog rows: `padding-left: 1rem` on hover (slides content right).
- Header border-bottom fades in at `0.3s ease` once scrolled.
- Mobile menu drawer: `right` transition `0.3s ease`.
- Floaters: `requestAnimationFrame` loop, wraps at viewport edges, rotates slowly.
- Respect `prefers-reduced-motion`: all transitions clamp to `0.01ms`, floaters hide, smooth scroll disables.

---

## 8. Voice & Microcopy

- Sentence case for prose. UPPERCASE for headings, eyebrows, mono UI.
- Numerals zero-padded: `01 / PEOPLE`, `001`, `002`. Pad to 3 digits in lists, 2 in pillar headers.
- Slashes and middots as separators in mono UI: `Operations · Hiring · Systems`, `01 / PEOPLE`.
- Smart quotes and en/em dashes in body copy: `&rsquo;`, `&ldquo;…&rdquo;`, `&mdash;`.
- Kickers read like archive labels: `Operations Consulting / Est. 2026`.
- CTAs are conversational, not transactional: "Start a conversation," "Let's talk," "Get in touch."

---

## 9. Accessibility

- Color contrast: `--ink` on `--bg` is the primary pair (WCAG AAA). `--ink-dim` on `--bg` passes AA for body. Avoid using `--ink-dimmer` for anything users need to read — it's for decorative numerals and floaters.
- All decorative SVG carries `aria-hidden="true"`.
- Honeypot inputs use off-screen positioning and `tabindex="-1"`, never `display: none`.
- Mobile menu toggle has `aria-label="Toggle menu"`. (TODO: add `aria-expanded` toggling — currently missing.)
- Respect `prefers-reduced-motion` for all animation.
- Focus states: form inputs swap underline to `--accent`. Other interactive elements rely on browser default focus rings — do not strip them without a replacement.

---

## 10. When You're Adding Something New

1. **Check the tokens first.** If the color, font, or spacing exists, use it. Don't introduce a new shade of grey.
2. **Match the eyebrow + title + grid pattern.** Every section is: `.section-label` → `.section-title` → grid of items separated by `--line` borders.
3. **Mono for metadata, display for headlines, sans for prose.** No exceptions.
4. **Hairlines, not cards.** Borders separate; backgrounds rarely fill (only `.philosophy`, hover states, and `<pre>`/`<code>`).
5. **Sync all three templates** when changing tokens. There is no shared stylesheet — `index.html`, `blog/index.html`, and `_layouts/post.html` each carry their own copy of `:root`. Drift between them is the most likely regression.
6. **Test reduced-motion.** Floaters and transitions both must shut off cleanly.

---

## 11. Known Inconsistencies

Worth fixing on the next pass — flagged here so we don't paper over them by accident:

- The homepage defines `--accent-dim` but neither blog nor post layout does.
- Post layout adds `--ink-soft` (`#d5d3cf`); homepage and blog don't have it. Long-form body color isn't centralized.
- `nav a:hover` is `--ink` on the homepage but `--accent` on blog/post.
- Header is `position: fixed` on the homepage but static on blog/post — by design, but worth noting.
- Inter weight 700 is loaded on the post layout only.
