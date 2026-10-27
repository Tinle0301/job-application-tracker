# Component recipes

Class recipes for this project's Tailwind v4 setup. "Current" is what the code does today;
"Target" is the same recipe with the missing states added. When you touch a component, move it
to the target recipe. Token names refer to `DESIGN.md`.

## Buttons

App controls are 32 to 40px tall. Two sizes at most: default (`px-4 py-2`) and small (`px-3 py-1.5`).

```tsx
// Shared focus ring (target). Put it on every button, link-button, select and tab.
const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900'

// Primary: one per view.
const primary =
  `rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white ` +
  `transition-[background-color,transform] duration-150 ease-out hover:bg-stone-700 active:scale-98 ` +
  `disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`

// Secondary: outlined.
const secondary =
  `rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 ` +
  `transition-colors duration-150 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`

// Text action (Edit, View emails). Destructive uses rose-700.
const textAction = `font-medium text-stone-600 hover:text-stone-900 ${focusRing}`
const dangerAction = `font-medium text-rose-700 hover:text-rose-800 ${focusRing}`

// AI action: violet, only inside AI features (auto-fill, analyze, get description).
const aiPrimary =
  `rounded-lg bg-violet-700 px-3 py-2 text-sm font-medium text-white hover:bg-violet-600 ` +
  `disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700`
```

- Always set `type="button"` unless it submits a form.
- Loading: swap the label for the progress verb ("Saving…"), keep the width (`min-w-[…]` only if
  the label length changes a lot), set `aria-busy="true"` and `disabled`.
- Icon-only buttons need `aria-label` and a 44px hit area on touch layouts:
  `relative before:absolute before:-inset-2 before:content-['']`.
- `+ Add application`: the `+` is a glyph standing in for an icon. Keep it until an icon set
  exists; do not add more glyph icons.

## Text fields, textareas, selects

```tsx
// Current (ApplicationForm, AuthGate)
const input = 'mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm'

// Target
const input =
  'mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base sm:text-sm ' +
  'placeholder:text-stone-500 hover:border-stone-400 ' +
  'focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-stone-900 ' +
  'aria-[invalid=true]:border-rose-700 disabled:cursor-not-allowed disabled:opacity-50'
```

- The border width never changes between states; state moves to colour and outline.
- Label above (`block text-sm font-medium text-stone-700`), helper below (`mt-1 text-xs
text-stone-500`). The error replaces the helper in the same line: `mt-1 text-xs text-rose-700`
  with an `id` referenced by `aria-describedby`, and `aria-invalid="true"` on the field.
- Give fields `name`, `autoComplete`, the right `type` and `inputMode`. Never block paste.
- Required fields: `required` plus the word "(required)" or a legend that explains the marker.
- Textarea: `resize-y min-h-24`.
- Select: native `<select>` with the same recipe. `StatusSelect` (pill-shaped, status colours) is
  the one exception and keeps its own recipe.

## Panels and tiles

```tsx
const panel = 'rounded-xl border border-stone-200 bg-white p-4' // EmailSync, tables
const tile = 'rounded-xl border border-stone-200 bg-white px-4 py-3' // StatsBar
const well = 'rounded-lg bg-stone-50/60 p-3' // tinted area inside a panel, no border
const aiPanel = 'rounded-xl border border-violet-200 bg-violet-50/50 p-3' // AutoFill only
```

- Never put a bordered panel inside a bordered panel. Inside a panel, use a well, a hairline or space.
- No shadow on resting panels. Shadows are for things that float (dialog, menu, popover).

## Stat tiles (StatsBar)

- A `<dl>`: `dt` is `text-xs font-medium text-stone-500`, `dd` is `mt-1 text-2xl font-semibold tabular-nums`.
- No icons, no deltas without a baseline, no sparklines. A real zero prints as `0`; an undefined
  rate prints as an em dash, never `NaN%`.
- Grid `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6`. With a different count, pick columns that
  leave no orphan.

## Tables (ApplicationTable)

```tsx
// Current head (legacy): 'border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wide text-stone-500'
// Target head:
const thead = 'border-b border-stone-200 text-left text-xs font-medium text-stone-500'
const th = 'px-4 py-3 font-medium' // add scope="col"
const tbody = 'divide-y divide-stone-100'
const td = 'px-4 py-3 align-middle'
```

- Identity column (company, with location as a `text-xs text-stone-500` subline) gets the most width.
- Dates and scores: `tabular-nums`, and right-aligned when compared down a column.
- Missing value: `<span className="text-stone-500" aria-label="None">—</span>` (not `stone-400`).
- Expandable row: the toggle is a real `<button aria-expanded>`; the detail row sits directly under
  it in a well, not in a new card.
- Hover on rows: none, or `hover:bg-stone-50`. No zebra striping.
- Row actions: one trailing column, text actions, same order on every row.
- Phones (target): below `sm`, render rows as a list of two-line items instead of a scrolling table.

## Badges and pills

```tsx
// StatusBadge (current, keep)
'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ' + STATUS_STYLES[status]

// FitBadge (current, keep)
'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset ' + fitTone(score)
```

- Pale tint with dark text of the same hue. Never a saturated fill with white text.
- `shrink-0 whitespace-nowrap` so a chip is never squeezed.
- One status mark per row. Skill chips (matched / missing) use the same recipe with emerald / rose.
- Known contrast gap: `withdrawn` is `text-stone-500` on `bg-stone-100` (4.4:1). Target: `text-stone-600`.

## Tabs (Tracker sections)

```tsx
const tab = (active: boolean) =>
  `-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${focusRing} ` +
  (active ? 'border-stone-900 text-stone-900' : 'border-transparent text-stone-500 hover:text-stone-800')
```

- Today they are buttons with `aria-current="page"`, which is fine for section switching. If they
  become real tabs, use `role="tablist"`/`tab`/`tabpanel`, `aria-selected`, and arrow-key movement.
- Labels stay in sentence case; they wrap to a horizontal scroll row on narrow screens, never two lines.

## Dialog (ApplicationForm)

```tsx
// Current
backdrop: 'fixed inset-0 z-10 flex items-start justify-center overflow-y-auto bg-stone-900/40 p-4'
panel: 'max-h-[92vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl'
```

Target behaviour (whether native `<dialog>` or the current div):

- `aria-labelledby` pointing at the `h2`; focus moves to the first field on open and back to the
  trigger on close; Escape closes; Tab stays inside; the page behind is `inert`.
- Footer actions right-aligned: secondary "Cancel", then primary "Save" or "Add application".
- Motion: backdrop fades, panel goes from `scale(0.96) opacity 0` to rest in 250ms ease-out; closes
  faster. Reduced motion: opacity only. See motion.md.

## Notices

```tsx
const errorNotice = 'rounded-lg bg-rose-50 p-3 text-sm text-rose-700' // role="alert"
const successNotice = 'rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800' // role="status"
const warningNotice = 'rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900' // ConfigError
```

- Inside the block they are about, never as a page-wide banner unless the whole app is affected.
- No coloured left stripe. No icon unless the project gains an icon set.

## Progress / usage (UsageMeter)

- A bar at the true ratio with both ends labelled in text ("12 of 50 applications"), `role="progressbar"`
  with `aria-valuenow`, `aria-valuemin`, `aria-valuemax` and a label.
- Track `bg-stone-200`, fill `bg-stone-900` (or the state colour only when near the limit).
