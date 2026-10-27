# Libraries

The app currently ships with React, ReactDOM and the Supabase client only. Keep it that way unless
a library removes real work or fixes a real accessibility gap. Check `package.json` first, and
ask Tin before installing anything.

## Worth adding when the need appears

| Need                                                    | Library                                                   | When it earns its place                                                                                                                                   |
| ------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Self-hosted font                                        | `@fontsource-variable/inter`                              | Now, to actually load the declared font (one import in `main.tsx`).                                                                                       |
| Icons                                                   | `lucide-react`                                            | When the first real icon is needed (sort arrow, external link, close). One set, one stroke width (1.5 or 2), 16 or 20px, `aria-hidden` when next to text. |
| Accessible primitives (menu, popover, combobox, dialog) | Base UI (base-ui.com; check its current npm package name) | When a custom dropdown, menu or combobox is needed. Unstyled, so it fits the Tailwind recipes.                                                            |
| Toasts                                                  | `sonner`                                                  | Only for failures and effects the page cannot show. Not for visible changes.                                                                              |
| Conditional classes / variants                          | `clsx`, then `class-variance-authority`                   | When a component's class string has three or more conditions, or real variants (size, intent).                                                            |
| Animation beyond CSS                                    | `motion`                                                  | Exit and layout animations only (see motion.md).                                                                                                          |
| Number transitions                                      | `@number-flow/react`                                      | Only if animating the fit score or stats is a deliberate moment.                                                                                          |
| Charts                                                  | `recharts`                                                | If a pipeline chart is added. One hue per chart, no 3D, no gradients.                                                                                     |
| Long lists                                              | `react-virtuoso`                                          | Past a few hundred rows.                                                                                                                                  |
| Drag and drop                                           | `@dnd-kit/core`                                           | If a kanban board by status is ever built. Needs keyboard support.                                                                                        |
| Design-token lint                                       | `@google/design.md` (CLI)                                 | To lint `DESIGN.md` and export tokens. Run with Tin's approval.                                                                                           |

## Not for this app

| Library                                 | Why not                                                                           |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| GSAP + ScrollTrigger                    | No timelines or scroll stories in a working tool. Fine for a future landing page. |
| React Bits backgrounds and text effects | Decorative motion on a work screen.                                               |
| Canvas UI, three.js, shaders            | Heavy GPU effects with no task value here.                                        |
| A full component kit (MUI, Chakra, Ant) | Would replace the visual system and add weight; base-ui covers behaviour.         |

## Licenses to remember

- React Bits and Canvas UI: MIT + Commons Clause. Free to use inside the app (even commercially);
  not allowed to sell or redistribute the components themselves.
- GSAP: free for everyone including all plugins (GreenSock's own license, not MIT). The
  `gsap-skills` guidance repo is MIT.
- `motion`, `sonner`, `clsx`, `cva`, `recharts`, Base UI: MIT. `lucide-react`: ISC. Inter: OFL.
- Verify each license on the package page before installing; these notes are from October 2026 and were not re-verified per package.
