# Tokens and theming

`DESIGN.md` (repo root) is the source of truth for values. Tailwind v4 is configured in CSS, so
tokens live in `frontend/src/index.css` under `@theme`. Today the app uses Tailwind's built-in
palette directly (`stone`, `sky`, `violet`, `amber`, `emerald`, `rose`) and has no custom tokens.

## How to add or change a token

1. Add or change it in `DESIGN.md` (YAML block and prose), with the reason.
2. Mirror it in `index.css`:

   ```css
   @import 'tailwindcss';

   @theme {
     /* motion (PROPOSED) */
     --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
     --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);

     /* semantic aliases (PROPOSED, optional) */
     --color-ink: var(--color-stone-900);
     --color-muted: var(--color-stone-500);
     --color-rule: var(--color-stone-200);
     --color-ai: var(--color-violet-700);
   }
   ```

   Each `--color-*` entry becomes utilities (`text-ink`, `border-rule`, `bg-ai`).

3. Replace usages in the components you touch. Do not mass-rename in an unrelated change.

## Rules

- No raw hex, `rgb()` or arbitrary colour classes (`bg-[#…]`) in components.
- Arbitrary length values (`min-w-[720px]`, `max-h-[92vh]`) are allowed for layout constraints
  that have no token; never for spacing that the 4px scale covers.
- Status colours live in `lib/statuses.ts` and fit colours in `lib/fit.ts`. Change them there, and
  keep the pale tint + dark text + inset ring pattern.
- Tailwind v4's colours are OKLCH. Hex values in `DESIGN.md` are sRGB conversions for tools and
  contrast checks; the CSS stays on the Tailwind tokens.

## Proposed changes (not applied)

| Change                                                                         | Why                                                                                                                                                                               |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Load Inter (self-host with `@fontsource-variable/inter`, `font-display: swap`) | It is declared in `body` but never loaded, so the app renders in each OS's system font.                                                                                           |
| `--ease-out` / `--ease-in-out` overrides                                       | Stronger curves than Tailwind's defaults; see motion.md.                                                                                                                          |
| Field edge `stone-300` → `stone-400`                                           | `stone-300` on white is 1.5:1; a field boundary needs 3:1 to be found (WCAG 1.4.11). `stone-400` is 2.6:1; `stone-500` (4.8:1) is the strictly compliant option. Decide with Tin. |
| Muted glyphs `stone-400` → `stone-500`                                         | `stone-400` text is 2.6:1 and fails AA.                                                                                                                                           |
| Withdrawn badge text `stone-500` → `stone-600`                                 | 4.4:1 on `stone-100` fails AA.                                                                                                                                                    |
| Destructive text `rose-600` → `rose-700`                                       | 4.5:1 is at the limit; 6.0:1 is safe.                                                                                                                                             |
| Table heads: drop `uppercase tracking-wide`                                    | Sentence-case heads read as data, not as decoration (Taste, Hallmark).                                                                                                            |
| Replace the default Vite favicon                                               | It is the Vite logo in purple; the app has no mark of its own yet.                                                                                                                |
| Global `::selection` and `accent-color` from the palette                       | Browser defaults are the cheapest tell that a page was assembled.                                                                                                                 |

## Dark mode (only when asked)

Not supported today (`color-scheme: light`). If Tin asks for it:

- Derive every token, never invert. Ground: stone at L 12 to 18% (never `#000`); ink at L 92 to
  96% (never `#fff`); elevation gets lighter per level, not darker.
- No shadows on dark; use a lighter surface or an inset hairline.
- Accents lose 0.02 to 0.04 chroma and gain 5 to 10% lightness so they do not glare.
- Re-check every contrast pair in both modes; status pills need their own dark pairs.
- Implement with Tailwind's `dark:` variant driven by a `data-theme` attribute plus the OS
  preference, `color-scheme: light dark`, and a tiny inline script that sets the mode before first
  paint so it never flashes.
