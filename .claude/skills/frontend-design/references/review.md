# Reviewing a screen

Use this for a full review or audit of a screen or feature. For a single change, the checklist in
SKILL.md §10 is enough.

## 1. Gather evidence

- Run the app (`npm run dev`, demo mode needs no setup) and use the feature yourself at 375, 768
  and 1280px, mouse and keyboard only, then with reduced motion on.
- Exercise the states: no data, one row, 50 rows, a 120-character company name, a failed request
  (offline in devtools), a slow request (network throttling), AI disabled.
- Read the components and the classes they use against `DESIGN.md`.

## 2. Score five dimensions (0 to 4)

| #   | Dimension       | 0                                                   | 2                                                        | 4                                                                         |
| --- | --------------- | --------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1   | Accessibility   | Fails WCAG A (no keyboard path, unlabeled controls) | Some effort, real gaps (no focus rings, contrast misses) | AA met: names, focus, contrast, announcements                             |
| 2   | States          | Populated only                                      | Loading and error exist, empty or edge cases break       | All five states, input preserved, honest data                             |
| 3   | System fit      | Raw values everywhere, mixed styles                 | Tokens mostly used, drift in places                      | Only tokens and recipes, consistent across the screen                     |
| 4   | Responsive      | Breaks on phones                                    | Works with rough edges (sideways scroll, squeezed chips) | Fluid at every width, touch targets, no page scroll                       |
| 5   | Craft and taste | Template look, AI tells, decoration                 | Clean but generic                                        | Clear hierarchy, honest data, nothing decorative, feels like this product |

Bands: 18 to 20 excellent, 14 to 17 good, 10 to 13 needs work, under 10 major rework.

## 3. Write findings

For each issue:

- **[P0–P3] Name**: file:line
- What the user experiences, and which rule or WCAG criterion it breaks.
- The fix, specific to this code (class names, element, attribute).

Severity: **P0** blocks the task or loses data. **P1** WCAG AA failure or a missing state that
misleads. **P2** inconsistency with this system. **P3** polish. Keep P3s few; a long tail buries
what matters.

Also list what works well, so it is kept.

## 4. Before / after format for code review

| Before                        | After                                                                                     | Why                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------- |
| `transition-all duration-300` | `transition-colors duration-150`                                                          | Name the property; UI stays under 300ms. |
| `text-stone-400` on a date    | `text-stone-500`                                                                          | 2.6:1 fails AA; 4.6:1 passes.            |
| `outline-none` on an input    | `focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-stone-900` | Keyboard users need to see focus.        |

## 5. Fix order

1. Broken tasks, data loss, misleading state, inaccessible paths.
2. Missing loading, empty, error, success and disabled states.
3. Layout, hierarchy, responsive and system drift.
4. Visual and motion inconsistencies.
5. Code cleanup.

Polish is refinement, never a hidden redesign. If the concept is wrong, say so and propose a
redesign for Tin to approve.

## Known gaps in the current UI (October 2026)

Found while writing this skill; none are fixed by it.

- No visible focus style on most buttons, links and inputs (browser default only; `EmailSync`
  removes the outline on one input and replaces it with a border change).
- `text-stone-400` used for text (em dash placeholders and others): 2.6:1.
- Withdrawn badge 4.4:1; field borders 1.5:1.
- Uppercase tracked table heads and section labels ("TIMELINE", "RESUME MATCH (AI)").
- Applications table scrolls sideways on phones (`min-w-[720px]`) instead of becoming a list.
- The modal is a div with `role="dialog"`; check focus trap, Escape and focus return.
- `animate-pulse` decorative dot in the "waiting for confirmation" message: no reduced-motion handling.
- `Inter` is declared but not loaded; default Vite favicon.
