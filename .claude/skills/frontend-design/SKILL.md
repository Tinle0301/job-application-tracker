---
name: frontend-design
description: Use when building, restyling, or reviewing any UI in this project — pages, components, layouts, animations.
---

# Frontend design for the Job Application Tracker

One set of rules for every UI change in this repo. Where the source repos disagreed, this file
already picked a side; follow it as written. The tokens live in [`DESIGN.md`](../../../DESIGN.md)
at the repo root. When the two differ, `DESIGN.md` wins on values and this file wins on behaviour.

## 0. Know what you are working on

- **Stack:** React 19 + TypeScript, Vite 8, Tailwind CSS v4 (via `@tailwindcss/vite`, configured
  in `frontend/src/index.css`, no `tailwind.config`). No component library, no icon set, no
  animation library. Plain `className` strings; small shared class constants inside a component
  (`const input = '...'`) are the house pattern.
- **What the app is:** a working tool, not a marketing site. One screen with two tabs
  (Applications, Resume), a stats strip, a toolbar, a dense table with expandable rows, a modal
  form, an AI auto-fill panel and an email-sync panel. People open it often and work in it.
- **Mode: Operate.** Success is "I updated my applications quickly and trust the numbers".
  Ambition shows as precision and restraint: aligned columns, honest states, fast feedback.
  Standard controls (buttons, tabs, selects, tables) stay standard. Expression lives in a few
  precise details, never in decoration.
- **Before editing:** read `DESIGN.md`, `frontend/src/index.css`, `frontend/src/lib/statuses.ts`
  and the neighbouring component. Reuse an existing class recipe before inventing one.
- **Refinement preserves.** A fix or a new feature keeps the current look, copy and behaviour
  outside its scope. A restyle that changes the visual system needs Tin's go-ahead first.

## 1. Taste: what makes UI look generated, and what to do instead

Every item here is a default that models fall into. Do not ship one unless the brief asks for it.

| Don't                                                                                 | Do instead                                                                                                                                |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Purple or blue-to-purple gradients, gradient text, glows, glass, blur as decoration   | Flat fills from the palette. Emphasis from weight and size.                                                                               |
| Violet or indigo as the general accent                                                | Near-black (`stone-900`) is the primary. Violet is reserved for AI features only (§3).                                                    |
| Emoji or unicode glyphs as icons (`✨ 🚀 ⚙️ ✓`)                                       | Words first. If an icon is truly needed, one SVG set, one stroke width (see references/libraries.md).                                     |
| A small tracked-caps "eyebrow" label above a heading                                  | Let the heading speak. Delete the label.                                                                                                  |
| Centred everything, hero headers, "Welcome back" greetings                            | Left-aligned, a noun title at `text-2xl`, the work starts right under it.                                                                 |
| Rows of identical icon-plus-heading cards; cards inside cards                         | One surface per level. A panel holds rows or a table, never another bordered card.                                                        |
| A coloured `border-left` stripe on cards, alerts or list items                        | A tint (`bg-rose-50`) plus text, or nothing.                                                                                              |
| Icons in tinted circles on stat tiles, sparklines, "+12%" pills                       | Label over value, `tabular-nums`, no decoration.                                                                                          |
| Uppercase tracked table heads and section labels                                      | Sentence case, `text-xs` or `text-sm`, `text-stone-500`, no tracking. (Existing uppercase heads are legacy: migrate when you touch them.) |
| Invented numbers, testimonials, logos, lorem ipsum, "Acme"                            | Real data, or sample data that reads as sample (`example.com`, round values).                                                             |
| `transition: all`, bouncy springs on UI state, scattered entrance animations          | One property per transition, short, ease-out (§6).                                                                                        |
| "Something went wrong", "Oops!", "No data"                                            | Say what happened, why if known, and what to do next (§5).                                                                                |
| Middle-dot meta strings everywhere, arrows glued to link text, decorative status dots | Separate fields, real labels. A dot only when it carries state.                                                                           |
| Pure `#000`/`#fff` improvised values, raw hex in `className`                          | Palette classes or tokens from `DESIGN.md` only.                                                                                          |

**Give it a face without decoration.** The product's identity is its own vocabulary and data: the
status names (Wishlist, Applied, Assessment, Interviewing, Offer), the company and role as the
row's identity, the timeline of stage dates, the fit score. Make those read clearly and
consistently; that is the "signature", not ornament.

## 2. Typography

- **One family.** `Inter` with the system stack fallback (`index.css`). It is declared but not
  loaded today, so most visitors see `system-ui`: see `DESIGN.md` for the proposal to self-host
  it. Never add a second family except a mono for code or IDs.
- **Scale (Tailwind):** page title `text-2xl font-semibold tracking-tight` · section/dialog title
  `text-lg font-semibold` · body and data `text-sm` (14px) · labels, meta, badges `text-xs`
  (12px) · stat values `text-2xl font-semibold`. Nothing under 12px. Five sizes on a screen at most.
- **Weights:** `font-medium` (500) for controls, labels and row identity; `font-semibold` (600)
  for titles and figures. Never `font-bold` or `font-light` next to them.
- **Figures:** `tabular-nums` on every number that is compared (stats, scores, dates, money,
  counts). Numeric table columns right-align.
- **Mobile inputs:** 16px (`text-base sm:text-sm`) on text inputs so iOS does not zoom on focus.
- **Text hygiene:** `text-balance` on headings that can wrap, `text-pretty` on paragraphs, body
  measure 45 to 75ch (`max-w-prose`), a true ellipsis `…`, curly quotes in UI copy. Truncate one
  line with `truncate` plus a `title` that shows the full value.
- **Copy:** sentence case everywhere ("Add application", not "Add Application"). Buttons name the
  action ("Save changes", "Get description", "Check inbox"). No em dashes in sentences; the em
  dash is reserved as the missing-value glyph in tables.

## 3. Colour

The app is light-only (`color-scheme: light`) on a warm neutral, **stone**. Colour goes on data
and state, not on chrome.

| Role                              | Classes                                                                                                       | Notes                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Page ground                       | `bg-stone-50`                                                                                                 | Set on `body`.                                                                           |
| Surface (panel, table, stat tile) | `bg-white border border-stone-200 rounded-xl`                                                                 | A border or a shadow, never both.                                                        |
| Ink                               | `text-stone-900`                                                                                              | Headings, row identity, values.                                                          |
| Secondary text                    | `text-stone-600` / `text-stone-700`                                                                           | Body inside panels, secondary actions.                                                   |
| Muted text                        | `text-stone-500`                                                                                              | Labels, meta, helper text. Only on `white` or `stone-50` (4.6:1).                        |
| Never as text                     | `text-stone-400`                                                                                              | 2.6:1, fails AA. Use `stone-500`.                                                        |
| Rules                             | `border-stone-200`, row dividers `divide-stone-100`                                                           |                                                                                          |
| Field edge                        | `border-stone-300`                                                                                            | See `DESIGN.md` for the proposed stronger edge.                                          |
| Primary action                    | `bg-stone-900 text-white hover:bg-stone-700`                                                                  | One per view (a dialog counts as its own view).                                          |
| AI features                       | `violet` family                                                                                               | Only on AI surfaces: auto-fill panel, AI buttons, resume match. Never on general chrome. |
| Status                            | `STATUS_STYLES` in `lib/statuses.ts`                                                                          | Pale tint + dark text of the same hue + `ring-1 ring-inset`.                             |
| Fit score                         | `fitTone()` in `lib/fit.ts`                                                                                   | emerald ≥ 80, amber ≥ 60, rose below.                                                    |
| Error / success / warning notice  | `bg-rose-50 text-rose-700` · `bg-emerald-50 text-emerald-800` · `bg-amber-50 border-amber-300 text-amber-900` | With `role="alert"` or `role="status"`.                                                  |

Rules:

- **Never colour alone.** Status has its label; errors have text; fit has the number.
- **Red is a signal, not a texture.** One red mark per row at most. Destructive text actions use
  `text-rose-700` (the current `rose-600` passes only just, at 4.5:1).
- **Contrast floor:** body and small text 4.5:1, large text, icons, focus rings and field edges
  3:1. Check the pair, not the colour (e.g. `stone-500` on `stone-100` is 4.4:1 and fails).
- **No raw values.** No hex, `rgb()` or arbitrary `[#...]` classes in components. A new colour
  role goes into `DESIGN.md` and `@theme` in `index.css` first.
- **Dark mode:** not supported. Do not add `dark:` classes piecemeal. If Tin asks for it, derive
  every token per `references/tokens-and-theming.md` §Dark mode, never invert.

## 4. Spacing and layout

- **Scale:** Tailwind's 4px steps only. Usual values: `gap-2`/`gap-3` inside controls and rows,
  `px-3 py-2` controls, `px-4 py-3` table cells and tiles, `p-4`–`p-6` panels, `space-y-6` between
  page sections. No arbitrary `[13px]` values.
- **Rhythm:** tight inside a group, clearly larger between groups; more space above a heading than
  below it.
- **Frame:** one centred column, `mx-auto max-w-6xl px-4 py-8`. At wide screens the gutters grow,
  the column does not.
- **Grids:** CSS grid for tile strips (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-6`), flex inside
  components. Flex children that must shrink get `min-w-0`; chips and badges get `shrink-0
whitespace-nowrap`. No orphan cell on the last row: change the column count instead.
- **Alignment:** one left edge for text inside a panel; right-aligned figures end on one right edge.
- **Surface ladder:** whitespace, then a hairline, then a tinted well (`bg-stone-50/60`), then a
  bordered panel. Climb only as far as needed. Never nest bordered boxes.
- **Overflow:** never let the page scroll sideways. A wide table scrolls inside its own frame
  (`overflow-x-auto`), and on phones should become a list (§8).

## 5. Components and interaction states

Every interactive element has all of these. Missing one means it is not finished.

| State    | Treatment in this project                                                                                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default  | The recipe in `DESIGN.md` → Components.                                                                                                                                                                 |
| Hover    | One signal: a colour step (`hover:bg-stone-700`, `hover:bg-stone-100`, `hover:text-stone-900`). Tailwind v4 already limits `hover:` to devices that hover.                                              |
| Focus    | `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900` (inputs: `-outline-offset-1`). Instant, never animated, never removed without a replacement.                   |
| Active   | `active:scale-98` on buttons, with the transform in the transition list. Never on table rows.                                                                                                           |
| Disabled | `disabled:opacity-50 disabled:cursor-not-allowed` plus the native `disabled` attribute. If the reason is not obvious, say why next to it.                                                               |
| Loading  | Label changes to the progress verb ("Analyzing…", "Saving…"), button keeps its width, `aria-busy`. Indicator only after ~300ms; skeletons in the shape of the real rows for lists.                      |
| Empty    | One line naming what is empty, one on why it matters, one action ("No applications yet. Add the first one or paste a job link." + button). Filtered-empty echoes the filter and offers "Clear filters". |
| Error    | Inside the block that failed, `role="alert"`, what failed and what to do, plus Retry where it makes sense. Keep the user's input.                                                                       |
| Success  | Show the result itself (the row updates). No toast when the change is visible.                                                                                                                          |

Specific rules:

- **Buttons** always have `type="button"` unless they submit. One filled primary per view;
  secondaries outlined (`border border-stone-300 bg-white`); tertiary as text actions. App
  controls are 32 to 40px tall with a 44px hit area on touch (pad or use `::before` to enlarge).
- **Forms:** a visible `<label>` for every field (placeholder shows a format, never the label);
  validate on blur after first touch; errors under the field with `aria-invalid` and
  `aria-describedby`; disable submit only while the request is in flight; on a failed submit,
  focus the first invalid field.
- **Dialogs:** prefer native `<dialog>` with `showModal()` (focus trap, Escape, backdrop). If a div
  is kept, it needs `role="dialog"`, `aria-modal`, `aria-labelledby`, focus moved in on open and
  returned to the trigger on close, Escape to close. Use a dialog only when the task needs focus.
- **Undo over confirm** for reversible actions (email sync already does this). Keep a confirm for
  delete until there is an undo.
- **Selects** stay native (`StatusSelect` is the model). Custom listboxes only if they keep full
  keyboard and screen-reader behaviour.
- **Tables:** sentence-case `th` with `scope="col"`, no zebra, horizontal rules only, identity
  column widest, numbers right-aligned, missing values as an em dash in `text-stone-500`, one
  status mark per row, row actions in one trailing column.
- **Live regions:** status messages use `role="status"`, errors `role="alert"`; the container must
  exist before the text is injected.

Full recipes: [references/components.md](references/components.md) and
[references/states-and-copy.md](references/states-and-copy.md).

## 6. Motion

Most of this app should not move. Motion confirms a change the user made or explains where
something went. If nothing would be lost with it instant, remove it.

**Decide first**

| How often it is seen                                                | Decision                                     |
| ------------------------------------------------------------------- | -------------------------------------------- |
| Many times a session (status change, typing, tab switch, row hover) | No animation, or a 120ms colour change only. |
| Occasionally (dialog, row expand, notice appearing)                 | A short, standard transition.                |
| Rarely (first run, a celebration on "Offer")                        | May carry one small moment of delight.       |
| Keyboard-triggered                                                  | Never animated.                              |

**Numbers**

- Durations: `120ms` press and colour, `200ms` hover, menus, notices, `250ms` dialog in. Exits run
  at about 70% of the enter. Nothing in the UI over 300ms.
- Easing: enter and move with ease-out (`cubic-bezier(0.23, 1, 0.32, 1)`, proposed as the
  `--ease-out` token); on-screen morphs with ease-in-out (`cubic-bezier(0.77, 0, 0.175, 1)`).
  Never `ease-in` for UI. `linear` only for progress.
- Properties: `transform` and `opacity` (plus `colors`). Never animate `width`, `height`, `top`,
  `left`, `margin`, `padding` or `border-width`. Expanding a row: `grid-template-rows: 0fr → 1fr`.
- Enter from something: `scale(0.96)` + `opacity: 0`, never `scale(0)`. Dialogs scale from centre;
  menus and popovers from their trigger.
- CSS transitions over keyframes for anything that can be interrupted. `@starting-style` for
  mount-in without JS.
- Loops: only loaders, and they stop when loading stops. No pulsing dots, no shimmer, no ambient
  motion. Anything over 5 seconds needs a pause control.

**Reduced motion is a state, not an afterthought.** Wrap movement in `motion-safe:` or a
`@media (prefers-reduced-motion: reduce)` override that keeps a short opacity or colour change so
the state still reads. Never rely on motion as the only signal.

**When a library or effect is worth it**

| Tool                                                | Use in this app?                                                                                                                                                                   |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CSS transitions + `@starting-style`                 | Default. Covers everything the app needs today.                                                                                                                                    |
| `motion` (Framer Motion)                            | Only if we need exit or layout animations CSS cannot do (e.g. reordering rows). Ask before installing.                                                                             |
| GSAP + `@gsap/react`                                | Overkill for the app. Fits only a future marketing or onboarding page with a real timeline or scroll story. Use `useGSAP` with a scope and `gsap.matchMedia()` for reduced motion. |
| React Bits                                          | Copy a single small micro-interaction only if it matches the rules above and respects reduced motion. Its text effects and backgrounds are off-limits in the app.                  |
| Canvas UI / WebGL / shaders / scroll-scrubbed video | Never in the app. A landing page only, with a static fallback, reduced-motion fallback and a weight budget.                                                                        |

Recipes and details: [references/motion.md](references/motion.md).

## 7. Accessibility

Target WCAG 2.2 AA everywhere.

- Semantic HTML first: `button` for actions, `a` for navigation, `table`/`th`/`td` for tabular
  data, `nav` with `aria-label`, one `h1`, heading levels in order, `dl` for label/value pairs.
- Every control has an accessible name: visible label, `aria-label` when there is no visible text,
  and `aria-expanded` / `aria-current` / `aria-pressed` where state applies.
- Visible keyboard focus on everything (§5), logical tab order, no keyboard traps, Escape closes
  overlays, focus returns to the trigger.
- Contrast per §3, including placeholder text, disabled-but-readable text, badges and focus rings.
- Targets at least 24×24 CSS px (AA) and 44×44 on touch layouts.
- Status and errors announced via live regions; errors tied to their field.
- Decorative SVG gets `aria-hidden="true"`; meaningful icons get a label.
- Respect `prefers-reduced-motion` (§6). No flashing more than 3 times a second.
- Text resizes to 200% without loss; nothing relies on hover alone.

## 8. Responsive

- Mobile first. Check **375**, **768**, **1280** and **1920** px widths.
- Tailwind breakpoints only: `sm` 640, `md` 768, `lg` 1024.
- The toolbar stacks below `md` (already does). Filters collapse before the list is pushed below
  the fold.
- The applications table (`min-w-[720px]` today) should become a list of two-line rows below
  `sm`: company and role on line 1, status and dates on line 2, one action at the right. Fields
  move, they are never dropped.
- Stat tiles: 2 columns on phones, never 4 squeezed ones; no orphan tile.
- Dialogs: full-width with `max-h-[92vh]` and internal scroll on phones (current pattern).
- No horizontal page scroll at any width. Long company names and URLs wrap or truncate
  (`break-words`, `truncate`, `min-w-0`).

## 9. Working method

1. Read the target component, its neighbours, `DESIGN.md` and the tokens it uses.
2. Write down the screen's one question and the most frequent job on it. The biggest thing on
   screen answers the question; the job is one click away.
3. Build with the existing recipes; add a token before adding a one-off value.
4. Build every state from §5 with real or realistic data, including long strings and zero.
5. Look at the result at 375 and 1280 (run `npm run dev`, or the `run` skill), keyboard only,
   then with reduced motion on. Fix what one look shows, then look once more.
6. Run `npm run lint`, `npm run typecheck` and `npm test`. Add or update a test for any behaviour
   change (focus, labels and states are testable with Testing Library).
7. Walk the checklist below before handing over, and say plainly what was not checked.

## 10. Pre-ship review checklist

Run this on every UI change. Severity: **P0** blocks a task or loses data, **P1** a WCAG AA
failure or a broken state, **P2** inconsistency with this system, **P3** polish. Fix P0 and P1
before shipping.

**Floor (any failure is P0/P1)**

- [ ] Every interactive element is reachable and usable by keyboard, with a visible focus ring.
- [ ] Every control and field has an accessible name; errors are announced and tied to fields.
- [ ] Text contrast ≥ 4.5:1 (3:1 for large text, icons, field edges, focus rings), checked per pair.
- [ ] Loading, empty, error and success states exist for every list, panel and form touched.
- [ ] User input survives a failed submit. Destructive actions confirm or offer undo.
- [ ] No horizontal page scroll at 375px; nothing overlaps or clips at 200% zoom.
- [ ] Movement respects `prefers-reduced-motion`; no animation on keyboard actions.

**System (P2)**

- [ ] Only palette classes and tokens from `DESIGN.md`; no raw hex, no arbitrary values without a reason.
- [ ] One filled primary per view; violet only on AI features; status colours from `STATUS_STYLES`.
- [ ] Type uses the scale in §2; figures use `tabular-nums`; numeric columns right-aligned.
- [ ] Radius per level (`lg` controls, `xl` panels, `2xl` dialogs, `full` pills); one surface per level.
- [ ] Transitions name their properties, stay ≤ 300ms, ease-out; no `transition-all`.
- [ ] Copy in sentence case, buttons name their action, errors say what to do.

**Taste (P2/P3)**

- [ ] None of the §1 tells: no gradients, glows, emoji icons, eyebrows, nested cards, stripe borders.
- [ ] Nothing decorative that a user would not miss; nothing invented (numbers, people, logos).
- [ ] The screen's main question is answered by its biggest element; its main job is one click away.
- [ ] Browser surfaces look intended: focus ring, text selection, scrollbars in overflow areas.

**Proof**

- [ ] Looked at 375 and 1280, keyboard-only and reduced motion; lint, typecheck and tests pass.
- [ ] Hand-over notes say what was not checked (e.g. "not tested on a real phone").

Scoring a larger review (audit of a whole screen): see
[references/review.md](references/review.md).

## References

- [references/components.md](references/components.md): class recipes for buttons, fields, panels, tables, badges, tabs, dialogs, notices.
- [references/states-and-copy.md](references/states-and-copy.md): loading thresholds, empty and error patterns, microcopy.
- [references/motion.md](references/motion.md): motion tokens, CSS recipes, reduced motion, library decision guide.
- [references/tokens-and-theming.md](references/tokens-and-theming.md): how tokens map to Tailwind `@theme`, proposed changes, dark mode recipe.
- [references/review.md](references/review.md): full audit procedure and scoring.
- [references/libraries.md](references/libraries.md): libraries worth adding later, and when.
- [references/sources.md](references/sources.md): which idea came from which repo, and their licenses.
