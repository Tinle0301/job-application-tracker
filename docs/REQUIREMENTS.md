# Requirements

## Functional

| ID    | Requirement                                                                                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| FR-1  | A user signs in with an email magic link and only ever sees their own data.                                                                      |
| FR-2  | A user can add, edit and delete applications (company and role required).                                                                        |
| FR-3  | A user can change an application's status in one click from the list.                                                                            |
| FR-4  | Every status change is recorded with a timestamp and shown as a timeline.                                                                        |
| FR-5  | The dashboard shows submitted, active, interviews, offers, response rate and interview rate.                                                     |
| FR-6  | A user can search, filter by status and sort the list.                                                                                           |
| FR-7  | A user can export all applications to JSON and import them back.                                                                                 |
| FR-8  | A user can paste a job posting (text or URL) and have the form filled automatically.                                                             |
| FR-9  | A user can save a resume and get a 0–100 match score with matched/missing skills and suggestions for any application that has a job description. |
| FR-10 | The latest match score is shown in the list.                                                                                                     |
| FR-11 | The app works without a backend in demo mode (localStorage), with AI disabled.                                                                   |

## Non-functional

| ID    | Requirement                                                                                    |
| ----- | ---------------------------------------------------------------------------------------------- |
| NFR-1 | Authorization is enforced by Postgres RLS and covered by automated tests.                      |
| NFR-2 | Secrets (Anthropic API key) never reach the browser or the repository.                         |
| NFR-3 | AI usage is limited per user per day; inputs are size-capped.                                  |
| NFR-4 | All service calls return `{ data, error }` with stable error codes; raw DB errors are hidden.  |
| NFR-5 | CI runs lint, format check, typecheck, unit/component tests, build, DB tests and `deno check`. |
| NFR-6 | Usable on a phone (responsive layout) and keyboard accessible (labelled controls, dialogs).    |
