# States and copy

The most common failure of generated UI is shipping only the populated state. Every surface that
fetches, changes or accepts data in this app renders all of these.

## The five data states

| State     | When                                                        | Must contain                                                                                                                |
| --------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Loading   | Data in flight                                              | The final layout with placeholders at the real size (rows keep their height), labels and headers shown at once. No shimmer. |
| Empty     | Nothing yet, or a filter matched nothing                    | What is empty, why it matters, one action.                                                                                  |
| Error     | Fetch or save failed                                        | What failed, why if known, what to do, a Retry where it makes sense. Keep input.                                            |
| Populated | The normal case                                             | Real data at real size.                                                                                                     |
| Edge      | Long names, 200+ rows, missing optional fields, zero values | A layout that does not break.                                                                                               |

## Loading thresholds

| Expected wait | Show                                                                |
| ------------- | ------------------------------------------------------------------- |
| Under 300ms   | Nothing.                                                            |
| 300ms to 2s   | Button label changes ("Saving…") or a skeleton for lists.           |
| 2 to 10s      | Labelled progress ("Reading the job posting…"). AI calls live here. |
| Over 15s      | Add "This is taking longer than usual." Keep a Cancel or a way out. |
| Over 60s      | Stop the spinner. Show an error with Retry.                         |

Every request needs a timeout. A refresh of data already on screen keeps the old values visible.

## Empty states for this app

- **No applications yet:** "No applications yet." / "Add one by hand or paste a job link to fill it in." / [Add application]
- **Filter matched nothing:** "No applications match “{query}” in {status}." / [Clear filters]
- **No resume saved (Resume tab):** "Add your resume to score it against each job." / [focus the resume field]
- **No emails for this application:** "No emails linked to this application yet." (no action needed)
- **Email sync not connected:** one sentence on what it does, one on privacy (read-only), [Connect Gmail].

An empty section keeps its frame and header. Never a bare "No data".

## Error copy

Answer three things in order: what happened, why (if known), what the user can do.

| Bad                    | Good                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------- |
| Something went wrong.  | Couldn't save the application. Check your connection and try again.                 |
| Error 429              | You've reached the AI limit for now. You can still fill the form by hand.           |
| Invalid input          | Add a company name to save this application.                                        |
| Oops! Failed to fetch. | Couldn't read that page. Some job sites block this; paste the posting text instead. |

- No "Oops", no exclamation marks, no blame ("You entered…").
- Field errors go under the field; form-level errors at the top of the form with a link to the field.
- The error replaces the helper text in the same line so the layout does not jump.
- After three failed retries, stop offering Retry and say what else to do.

## Success

- When the change is visible (row updated, status changed), say nothing.
- When it is not visible (email sync ran in the background), one quiet `role="status"` line:
  "Checked 42 emails. 2 statuses updated." with Undo where it applies.
- Never a success message when no request was made.

## Microcopy rules

- Sentence case for everything: buttons, labels, headings, tabs, table heads.
- Buttons use the verb of the action: "Add application", "Save changes", "Get description",
  "Check inbox", "Re-analyze". "Continue" only as a second step in a flow.
- Use the app's own words: Wishlist, Applied, Assessment, Interviewing, Offer, Rejected,
  Withdrawn; "fit score" or "resume match", not "AI score"; "posting" for the job ad.
- Numbers: thousands separators, fixed decimals per kind (rates as whole percents today), a unit
  on every figure, a non-breaking space between number and unit.
- Dates: short month format already used (`Oct 3, 2026`); relative words only for recency
  ("Today", "Yesterday").
- AI output is labelled as AI and dated, with the caveat already used: "AI output can be wrong;
  review before acting on it."
- No em dashes in sentences (commas, colons or full stops instead). The em dash is the
  missing-value glyph only.
- Ellipsis is one character: `…`.

## Focus and announcements

| Change                            | ARIA                                                       | Focus                                                      |
| --------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| Inline error after submit         | `role="alert"` on the message, `aria-invalid` on the field | Move to the first invalid field                            |
| Quiet confirmation                | `role="status"`                                            | Do not move                                                |
| Loading starts                    | `role="status"` "Loading applications…"                    | Do not move                                                |
| Content loads after a user action | none                                                       | Move to the new content's heading if the user asked for it |
| Dialog opens / closes             | `role="dialog"` with label                                 | First field / back to the trigger                          |

Live region containers must already be in the DOM before text is put in them.
