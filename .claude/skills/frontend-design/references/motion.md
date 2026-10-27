# Motion

The app is a tool used many times a day. Its motion character is **brisk**: fast, decisive, no
bounce. Most interactions are better instant. This file has the numbers, CSS recipes and the
library decision guide.

## Should it animate?

Ask in order:

1. **How often is it seen?** Many times a session → no animation (or a 120ms colour change).
   Occasionally → a standard transition. Rarely → may carry a small moment.
2. **Was it triggered by the keyboard?** Then no animation.
3. **What is its job?** Confirming a press, showing where something came from or went, preventing
   a jarring jump. "It looks nice" is not a job on a working screen.
4. **Would anything be lost if it were instant?** If not, cut it.

## Tokens

| Token (proposed in `@theme`)    | Value                             | Use                                                                              |
| ------------------------------- | --------------------------------- | -------------------------------------------------------------------------------- |
| `--ease-out`                    | `cubic-bezier(0.23, 1, 0.32, 1)`  | Anything entering, hover, press. Overrides Tailwind's weaker default `ease-out`. |
| `--ease-in-out`                 | `cubic-bezier(0.77, 0, 0.175, 1)` | Something moving or morphing on screen (a tab indicator).                        |
| `duration-100` / `duration-150` | 100 to 150ms                      | Press, colour change, checkbox tick.                                             |
| `duration-200`                  | 200ms                             | Hover backgrounds, menus, notices, row expand.                                   |
| `duration-250`                  | 250ms                             | Dialog enter.                                                                    |
| Exit                            | ~70% of the enter                 | Dialog out ~180ms.                                                               |

Ceiling: 300ms for any UI transition. Never `ease-in` on UI (it feels slow at the moment the user
is watching). `linear` only for progress bars. Stagger, if ever used, is 30 to 50ms per item and
never blocks input.

## Recipes (Tailwind v4)

**Button press**

```tsx
'transition-[background-color,transform] duration-150 ease-out hover:bg-stone-700 active:scale-98'
```

**Colour-only hover (links, text actions, tabs)**

```tsx
'transition-colors duration-150 hover:text-stone-900'
```

**Row expand without animating height**

```tsx
<div
  className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
    open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
  }`}
>
  <div className="overflow-hidden">{/* detail */}</div>
</div>
```

**Dialog in and out with `@starting-style` (no JS)**, added to `index.css`:

```css
@layer components {
  .dialog-panel {
    transition:
      opacity 250ms var(--ease-out),
      transform 250ms var(--ease-out);
    @starting-style {
      opacity: 0;
      transform: scale(0.96);
    }
  }
  .dialog-backdrop {
    transition: opacity 200ms var(--ease-out);
    @starting-style {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .dialog-panel {
      transition: opacity 150ms linear;
      transform: none;
    }
  }
}
```

**Notice appearing**

```tsx
'transition-opacity duration-200 starting:opacity-0'
```

**Rules that always apply**

- Name the properties: never `transition-all` / `transition: all`.
- Animate only `transform`, `opacity` and colours. Not `width`, `height`, `top`, `left`,
  `margin`, `padding` or `border-width`.
- Start from `scale(0.95–0.97)` with opacity 0, never from `scale(0)`.
- Dialogs scale from the centre; menus and popovers from their trigger (`transform-origin`).
- Prefer CSS transitions (interruptible) over keyframes for anything that can be retriggered.
- `will-change` only on an element while it animates, never on a whole class.
- Focus rings never animate.

## Reduced motion

`prefers-reduced-motion: reduce` means fewer and gentler, not none:

- Remove movement: translate, scale, rotate, parallax, scroll-linked motion.
- Keep short opacity or colour changes when they carry a state change.
- Tailwind: `motion-safe:` to opt movement in, or `motion-reduce:transition-none` /
  `motion-reduce:transform-none` to opt it out.
- In React: `window.matchMedia('(prefers-reduced-motion: reduce)')` (or `useReducedMotion()` if
  `motion` is ever added). With GSAP, use `gsap.matchMedia()` with a `reduceMotion` condition so
  the animation is reverted automatically.
- Motion is never the only signal: the state also changes in text, colour or position.
- No flashing more than three times per second. Anything moving for over 5 seconds needs a pause.

## Library decision guide

Start with CSS. Reach for a library only when CSS cannot do the job, and ask Tin before installing.

| Need                                                                   | Use                          | Notes                                                                                                                                                                                                    |
| ---------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hover, press, fade, dialog, row expand                                 | CSS / Tailwind               | Everything the app does today.                                                                                                                                                                           |
| Exit animations of React-removed nodes, list reordering, shared layout | `motion` (`motion/react`)    | Use full `transform` strings for hardware acceleration under load.                                                                                                                                       |
| Animating a changing number (fit score, stats)                         | `@number-flow/react`         | Only if the number change itself is the point; announce the final value only.                                                                                                                            |
| A multi-step timeline or scroll story on a future landing page         | `gsap` + `@gsap/react`       | `useGSAP(() => …, { scope: ref })`, never selectors without scope; `gsap.matchMedia()` for reduced motion; transforms only; cleanup is automatic with `useGSAP`. GSAP is free to use, including plugins. |
| A single micro-interaction (a check, a toggle)                         | React Bits component, copied | Read the source first: many depend on `motion`, some on canvas or WebGL. Keep only ones that respect reduced motion and the durations above. License forbids redistributing the components themselves.   |
| Fluid, glass, shader and particle effects                              | Canvas UI, WebGL             | Not in the app. Landing page only, with a static fallback, reduced-motion fallback, a size budget and a check on low-end phones. Same license limits as React Bits.                                      |
| Scroll-scrubbed "fly-through" video worlds                             | Scroll World pipeline        | Not for this project: needs paid AI video generation and suits a brand landing page, not a tool.                                                                                                         |

**Signs it is overkill:** the effect runs on a screen people work in; it is seen dozens of times a
session; it delays reading or input; it needs a library for something one CSS transition does;
it has no reduced-motion fallback.
