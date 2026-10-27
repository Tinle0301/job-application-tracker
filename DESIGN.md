---
version: alpha
name: Job Application Tracker
description: 'A calm, warm-neutral working tool for tracking job applications. Stone neutrals on a near-white ground, near-black primary actions, colour reserved for application status, fit scores and the violet AI features. Dense but readable: 14px data, tabular figures, bordered white panels, pill-shaped status badges. Values marked PROPOSED in comments are not in the code yet.'

colors:
  # Neutrals (Tailwind v4 stone; hex is the sRGB conversion of the OKLCH token)
  neutral: '#fafaf9' # stone-50, page ground
  surface: '#ffffff' # white, panels, tables, inputs, dialogs
  surface-muted: '#f5f5f4' # stone-100, hover fill, neutral badges
  primary: '#1c1917' # stone-900, ink and the primary action fill
  on-primary: '#ffffff'
  primary-hover: '#44403b' # stone-700
  on-surface: '#1c1917' # stone-900, headings, row identity, values
  on-surface-secondary: '#57534d' # stone-600, body text in panels, text actions
  on-surface-strong: '#44403b' # stone-700, labels, secondary button text
  on-surface-muted: '#79716b' # stone-500, meta, helper text, table heads (4.6:1 on neutral)
  on-surface-faint: '#a6a09b' # stone-400, used today for placeholder glyphs; fails AA as text, PROPOSED: retire for text
  outline: '#d6d3d1' # stone-300, field and secondary button borders (1.5:1), PROPOSED: stone-400 or stone-500 for fields
  outline-variant: '#e7e5e4' # stone-200, panel borders, rules
  divider: '#f5f5f4' # stone-100, row dividers
  scrim: '#1c1917' # stone-900 at 40% behind dialogs
  focus: '#1c1917' # PROPOSED: focus ring colour (stone-900)

  # AI features only (auto-fill, analyze, get description, resume match)
  tertiary: '#7008e7' # violet-700, AI action fill
  tertiary-hover: '#7f22fe' # violet-600
  tertiary-container: '#f5f3ff' # violet-50 (used at 50% opacity)
  tertiary-outline: '#ddd6ff' # violet-200
  on-tertiary-container: '#4d179a' # violet-900

  # Semantic notices
  error: '#c70036' # rose-700
  error-container: '#fff1f2' # rose-50
  error-action: '#ec003f' # rose-600, Delete text action today, PROPOSED: rose-700
  success: '#006045' # emerald-800
  success-container: '#ecfdf5' # emerald-50
  warning: '#7b3306' # amber-900
  warning-container: '#fffbeb' # amber-50
  warning-outline: '#ffd230' # amber-300

  # Application status pills: container / text / ring (lib/statuses.ts)
  status-wishlist-container: '#f5f5f4'
  status-wishlist: '#44403b'
  status-wishlist-ring: '#d6d3d1'
  status-applied-container: '#f0f9ff'
  status-applied: '#00598a'
  status-applied-ring: '#b8e6fe'
  status-assessment-container: '#f5f3ff'
  status-assessment: '#5d0ec0'
  status-assessment-ring: '#ddd6ff'
  status-interviewing-container: '#fffbeb'
  status-interviewing: '#973c00'
  status-interviewing-ring: '#fee685'
  status-offer-container: '#ecfdf5'
  status-offer: '#006045'
  status-offer-ring: '#a4f4cf'
  status-rejected-container: '#fff1f2'
  status-rejected: '#c70036'
  status-rejected-ring: '#ffccd3'
  status-withdrawn-container: '#f5f5f4'
  status-withdrawn: '#79716b' # 4.4:1, fails AA, PROPOSED: #57534d (stone-600)
  status-withdrawn-ring: '#e7e5e4'

  # Fit score (lib/fit.ts): >= 80 high, >= 60 mid, below low
  fit-high: '#006045'
  fit-high-container: '#ecfdf5'
  fit-mid: '#973c00'
  fit-mid-container: '#fffbeb'
  fit-low: '#c70036'
  fit-low-container: '#fff1f2'

typography:
  # Inter is declared in index.css but not loaded; visitors get system-ui unless Inter is installed.
  # PROPOSED: self-host Inter (variable) so the declared face is what renders.
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: 600
    lineHeight: 32px
    letterSpacing: -0.025em
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: 600
    lineHeight: 28px
  stat-value:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: 600
    lineHeight: 32px
    fontFeature: '"tnum"'
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
  body-md-strong:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
  body-mobile-input:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 500
    lineHeight: 16px
  caption:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
  table-head:
    # Today: uppercase with 0.025em tracking. PROPOSED: sentence case, no tracking (values below).
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 500
    lineHeight: 16px
  badge:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 500
    lineHeight: 16px
  figure:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 600
    lineHeight: 16px
    fontFeature: '"tnum"'

rounded:
  none: 0px
  md: 6px # rounded-md, compact inline inputs
  lg: 8px # rounded-lg, buttons, inputs, notices
  xl: 12px # rounded-xl, panels, stat tiles, table frame
  2xl: 16px # rounded-2xl, dialogs, auth card, config notice
  full: 9999px # pills, badges, status select

spacing:
  unit: 4px
  xs: 4px # gap-1
  sm: 8px # gap-2, py-2
  md: 12px # gap-3, px-3, py-3
  lg: 16px # px-4, p-4, page side padding
  xl: 24px # p-6, space-y-6 between page sections
  2xl: 32px # py-8 page top and bottom
  container-max: 1152px # max-w-6xl
  dialog-max: 672px # max-w-2xl
  auth-max: 384px # max-w-sm
  table-min: 720px # min-w-[720px], PROPOSED: list layout below 640px instead

components:
  page:
    backgroundColor: '{colors.neutral}'
    textColor: '{colors.on-surface}'
    typography: '{typography.body-md}'
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.on-primary}'
    typography: '{typography.label-md}'
    rounded: '{rounded.lg}'
    padding: 8px 16px
    height: 36px
  button-primary-hover:
    backgroundColor: '{colors.primary-hover}'
    textColor: '{colors.on-primary}'
  button-secondary:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.on-surface-strong}'
    typography: '{typography.label-md}'
    rounded: '{rounded.lg}'
    padding: 6px 12px
  button-secondary-hover:
    backgroundColor: '{colors.surface-muted}'
    textColor: '{colors.on-surface-strong}'
  button-text:
    textColor: '{colors.on-surface-secondary}'
    typography: '{typography.label-md}'
  button-text-hover:
    textColor: '{colors.on-surface}'
  button-danger-text:
    textColor: '{colors.error-action}'
    typography: '{typography.body-md}'
  button-ai:
    backgroundColor: '{colors.tertiary}'
    textColor: '{colors.on-primary}'
    typography: '{typography.label-md}'
    rounded: '{rounded.lg}'
    padding: 8px 12px
  button-ai-hover:
    backgroundColor: '{colors.tertiary-hover}'
    textColor: '{colors.on-primary}'
  input:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.on-surface}'
    typography: '{typography.body-md}'
    rounded: '{rounded.lg}'
    padding: 8px 12px
    height: 36px
  panel:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.on-surface}'
    rounded: '{rounded.xl}'
    padding: 16px
  panel-ai:
    backgroundColor: '{colors.tertiary-container}'
    textColor: '{colors.on-tertiary-container}'
    rounded: '{rounded.xl}'
    padding: 12px
  stat-tile:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.on-surface}'
    typography: '{typography.stat-value}'
    rounded: '{rounded.xl}'
    padding: 12px 16px
  table:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.on-surface}'
    typography: '{typography.body-md}'
    rounded: '{rounded.xl}'
  table-head:
    textColor: '{colors.on-surface-muted}'
    typography: '{typography.table-head}'
    padding: 12px 16px
  table-cell:
    textColor: '{colors.on-surface}'
    typography: '{typography.body-md}'
    padding: 12px 16px
  status-badge:
    typography: '{typography.badge}'
    rounded: '{rounded.full}'
    padding: 2px 10px
  status-select:
    typography: '{typography.badge}'
    rounded: '{rounded.full}'
    padding: 4px 32px 4px 12px
  fit-badge:
    typography: '{typography.figure}'
    rounded: '{rounded.full}'
    padding: 2px 8px
  tab:
    textColor: '{colors.on-surface-muted}'
    typography: '{typography.label-md}'
    padding: 8px 16px
  tab-active:
    textColor: '{colors.on-surface}'
  dialog:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.on-surface}'
    rounded: '{rounded.2xl}'
    padding: 24px
    width: 672px
  notice-error:
    backgroundColor: '{colors.error-container}'
    textColor: '{colors.error}'
    typography: '{typography.body-md}'
    rounded: '{rounded.lg}'
    padding: 12px
  notice-success:
    backgroundColor: '{colors.success-container}'
    textColor: '{colors.success}'
    typography: '{typography.body-md}'
    rounded: '{rounded.lg}'
    padding: 12px
  notice-warning:
    backgroundColor: '{colors.warning-container}'
    textColor: '{colors.warning}'
    typography: '{typography.body-md}'
    rounded: '{rounded.2xl}'
    padding: 20px
---

# Job Application Tracker design system

How the tracker looks and why. Tokens above are normative; the code implements them with
Tailwind v4 palette classes (`frontend/src/index.css`, `frontend/src/lib/statuses.ts`,
`frontend/src/lib/fit.ts`). Anything marked **PROPOSED** is a recommendation that is not in the
code yet. Build guidance lives in `.claude/skills/frontend-design/SKILL.md`.

## Overview

A personal working tool for someone in the middle of a job search: they open it several times a
day to log an application, move a status, check a fit score or read a recruiter email. It should
feel calm, trustworthy and quick, never like a marketing page. The look is warm-neutral and
quiet: stone greys on a near-white ground, white bordered panels, near-black primary actions.
Colour is spent on meaning only: where each application stands, how well the resume fits, and
which features use AI.

Mode: **Operate.** Standard controls, dense but readable data, honest states. Personality comes
from the product's own vocabulary (Wishlist to Offer), the timeline of stage dates and clear
numbers, not from decoration.

## Colors

- **Stone neutrals** carry the whole interface. The page ground is **Stone 50** (`#fafaf9`),
  panels are **white**, rules are **Stone 200**, and text steps down from **Stone 900** (ink) to
  **Stone 600** (body in panels) to **Stone 500** (labels and meta).
- **Primary (Stone 900, `#1c1917`)** is both the ink and the fill of the one primary action per
  view ("Add application", "Save"). Hover lightens to Stone 700.
- **Tertiary (Violet 700, `#7008e7`)** marks AI features only: the auto-fill panel, AI buttons and
  the resume match section. It is never used for general chrome, links or focus.
- **Status pills** use one hue each, as a pale container with dark text of the same hue and an
  inset ring: Wishlist stone, Applied sky, Assessment violet, Interviewing amber, Offer emerald,
  Rejected rose, Withdrawn muted stone.
- **Fit scores** use emerald (80+), amber (60 to 79) and rose (below 60) in the same pale pattern.
- **Notices**: errors rose, success emerald, configuration warnings amber; always with text.

Contrast notes from the current code (WCAG AA needs 4.5:1 for text, 3:1 for field edges and
focus rings):

- Stone 500 on white 4.8:1 and on Stone 50 4.6:1: fine for labels.
- Stone 400 text 2.6:1: fails. **PROPOSED:** use Stone 500 for every text, including the em dash
  placeholder.
- Withdrawn pill (Stone 500 on Stone 100) 4.4:1: fails. **PROPOSED:** Stone 600 text.
- Field border Stone 300 on white 1.5:1: too faint to find a field. **PROPOSED:** Stone 400
  (2.6:1) as a compromise, or Stone 500 (4.8:1) for full compliance.
- Delete in Rose 600 4.5:1: at the limit. **PROPOSED:** Rose 700 (6.0:1).

## Typography

One family, **Inter**, with `ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif` as
the fallback stack. **PROPOSED:** self-host the variable font with `font-display: swap`; today
it is declared but never loaded, so most visitors see their system font.

- **Headline large** (24/32, 600, -0.025em): the page title only.
- **Headline small** (18/28, 600): dialog and panel titles.
- **Body** (14/20, 400): table cells, form text, paragraphs. 16px on phone inputs.
- **Labels** (14/20 or 12/16, 500): form labels, buttons, stat labels.
- **Caption** (12/16, 400): meta, helper text, timestamps.
- **Figures** use tabular numerals (`tabular-nums`) wherever numbers are compared.
- Table heads and section labels are uppercase with wide tracking today. **PROPOSED:** sentence
  case, no tracking, Stone 500.

Two weights (500 and 600) plus regular. Nothing under 12px.

## Layout

A single centred column, `max-w-6xl` (1152px), 16px side padding, 32px top and bottom padding.
Sections stack with 24px between them. Inside components, spacing comes from Tailwind's 4px
scale: 8 and 12px gaps in controls and rows, 12/16px table cell padding, 16 to 24px panel padding.

- Stat tiles: a grid of 2 columns on phones, 3 from 640px, 6 from 1024px.
- Toolbar: stacked on phones, one row from 768px with the primary action pushed right.
- Applications table: full width inside a bordered frame, horizontal scroll under 720px today.
  **PROPOSED:** below 640px, each application becomes a two-line list item (company and role,
  then status and dates) with its actions at the right.
- Dialogs: up to 672px wide, 92% of the viewport tall at most, scrolling inside.

## Elevation & Depth

Flat. Hierarchy comes from the ground/panel tone step (Stone 50 to white) and 1px Stone 200
borders, not shadows. Resting panels have no shadow. Shadows appear only on things that float
above the page: the dialog (`shadow-xl` over a Stone 900 / 40% scrim) and the auth card
(`shadow-sm`). Never a border and a large shadow together on a resting surface; never a coloured
glow.

## Shapes

Soft, consistent corners by level:

- 6px for compact inline inputs.
- 8px for buttons, inputs and notices.
- 12px for panels, stat tiles and the table frame.
- 16px for dialogs and the sign-in card.
- Full pills for status badges, fit badges and the status select.

Inner corners never exceed their container's.

## Components

- **Primary button:** Stone 900 fill, white 14px medium label, 8px radius, 8×16px padding,
  hover Stone 700. One per view.
- **Secondary button:** white with a Stone 300 border, Stone 700 label, hover Stone 100 fill.
- **Text actions:** Stone 600, hover Stone 900 (Edit); Rose for Delete.
- **AI button:** Violet 700 fill, white label, hover Violet 600. Only inside AI features.
- **Input:** white, Stone 300 border, 8px radius, 8×12px padding, 14px text. **PROPOSED:**
  visible focus outline (2px Stone 900), error state with a Rose 700 border plus message, 16px
  text on phones.
- **Panel:** white, Stone 200 border, 12px radius, 16px padding. The AI panel uses Violet 50 at
  half opacity with a Violet 200 border.
- **Stat tile:** panel recipe with 12×16px padding, 12px Stone 500 label over a 24px semibold
  tabular value.
- **Table:** white frame with Stone 200 border and 12px radius, Stone 100 row dividers, no zebra.
  Expanded rows open into a Stone 50 well under the row.
- **Status badge / select:** full pill, 12px medium text, pale container, dark text, inset ring.
- **Fit badge:** full pill, 12px semibold tabular score.
- **Tabs:** text tabs with a 2px Stone 900 underline on the active one.
- **Dialog:** white, 16px radius, 24px padding, `shadow-xl`, Stone 900 / 40% scrim.
- **Notices:** pale container with matching dark text, 8px radius (16px for the configuration
  warning), with `role="alert"` or `role="status"`.

**PROPOSED for every interactive component:** a shared focus-visible outline (2px Stone 900,
2px offset, inset on inputs), `active:scale-98` on buttons, disabled at 50% opacity with
`cursor: not-allowed`, and transitions limited to colour and transform at 150 to 250ms with a
strong ease-out (`cubic-bezier(0.23, 1, 0.32, 1)`).

## Do's and Don'ts

- Do keep colour for status, fit scores, AI features and notices; everything else is stone.
- Do use one filled primary action per view; secondaries are outlined or text.
- Do use tabular numerals and right alignment for numbers that are compared.
- Do show every state: loading, empty, error, success, disabled, focus.
- Do write in sentence case with buttons that name their action.
- Don't use violet outside AI features, and don't introduce new accent hues.
- Don't use gradients, glows, glass, emoji icons, eyebrow labels or coloured side stripes.
- Don't nest bordered panels; use a tinted well or a hairline inside a panel.
- Don't use Stone 400 for text, or raw hex values in components.
- Don't animate layout properties or exceed 300ms for UI transitions; respect reduced motion.
