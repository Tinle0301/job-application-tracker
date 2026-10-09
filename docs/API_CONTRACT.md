# API contract

The frontend talks to one interface, `TrackerApi` (`backend/services/api.ts`). Every method resolves to:

```ts
type Result<T> = { data: T; error: null } | { data: null; error: { code: string; message: string } }
```

Methods **never throw**. `code` is a stable `UPPER_SNAKE` identifier for programs; `message` is safe to show to users.

## Auth (`backend/services/authService.ts`)

`signIn`, `signUp` (returns `{ needsConfirmation }`), `sendPasswordReset`, `updatePassword`, `sendMagicLink` (existing accounts only), `signOut`. Password reset and magic link reply the same whether or not the email has an account.

| Code                  | When                                    |
| --------------------- | --------------------------------------- |
| `INVALID_EMAIL`       | Not an email address                    |
| `PASSWORD_REQUIRED`   | Sign-in without a password              |
| `WEAK_PASSWORD`       | Under 8 characters                      |
| `INVALID_CREDENTIALS` | Wrong email or password                 |
| `EMAIL_NOT_CONFIRMED` | Account not confirmed yet               |
| `EMAIL_IN_USE`        | Sign-up with an existing email          |
| `SAME_PASSWORD`       | New password equals the old one         |
| `RATE_LIMITED`        | Too many attempts or emails             |
| `AUTH_FAILED`         | Anything else (raw message never shown) |

## Applications

| Method                         | Returns         | Error codes                                                                                                                    |
| ------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `listApplications()`           | `Application[]` | `LOAD_FAILED`                                                                                                                  |
| `createApplication(input)`     | `Application`   | `COMPANY_REQUIRED`, `ROLE_REQUIRED`, `INVALID_STATUS`, `INVALID_URL`, `INVALID_DATE`, `DESCRIPTION_TOO_LONG`, `DATABASE_ERROR` |
| `updateApplication(id, input)` | `Application`   | same as create, plus `APPLICATION_NOT_FOUND` (demo)                                                                            |
| `updateStatus(id, status)`     | `Application`   | `APPLICATION_NOT_FOUND` (demo), `DATABASE_ERROR`                                                                               |
| `deleteApplication(id)`        | `null`          | `DELETE_FAILED`                                                                                                                |
| `importApplications(inputs)`   | `Application[]` | validation codes with `Row N:` prefix in the message, `IMPORT_FAILED`                                                          |

## Resume

| Method                        | Returns          | Error codes                                             |
| ----------------------------- | ---------------- | ------------------------------------------------------- |
| `getResume()`                 | `Resume \| null` | `LOAD_FAILED` (no resume is `data: null`, not an error) |
| `saveResume(content, title?)` | `Resume`         | `RESUME_TOO_SHORT`, `RESUME_TOO_LONG`, `SAVE_FAILED`    |

## AI (Edge Functions)

Both functions take `POST` JSON with the user's `Authorization: Bearer <jwt>` (added by `supabase.functions.invoke`) and reply with the same `{ data, error }` body.

### `parseJobPosting({ text } | { url })` → `parse-job`

Returns `ParsedJob`: `company`, `role`, `location`, `salary`, `employmentType`, `requirements[]` (≤ 12), `summary`, `description` (the text that was read).

### `analyzeFit(applicationId)` → `match-resume`

Returns `FitAnalysis`: `id`, `score` (0–100), `matchedSkills[]`, `missingSkills[]`, `summary`, `suggestions[]` (≤ 5), `model`, `createdAt`. The result is also stored in `ai_analyses`.

### AI error codes

| Code                     | HTTP    | When                                                      |
| ------------------------ | ------- | --------------------------------------------------------- |
| `NOTHING_TO_PARSE`       | 400     | No text/URL, or under 50 characters                       |
| `INVALID_URL`            | 400     | Not a public `http(s)` URL (SSRF guard)                   |
| `FETCH_FAILED`           | 422     | Page unreachable, not HTML, or too little text (login/JS) |
| `PARSE_FAILED`           | 422     | Model found no company or role                            |
| `INVALID_ID`             | 400     | `applicationId` is not a UUID                             |
| `APPLICATION_NOT_FOUND`  | 404     | Not found or not owned by the caller                      |
| `NO_RESUME`              | 400     | No default resume saved                                   |
| `NO_JOB_DESCRIPTION`     | 400     | Job description under 100 characters                      |
| `AI_DAILY_LIMIT`         | 429     | `AI_DAILY_LIMIT` calls in 24 h (default 50)               |
| `AI_BAD_OUTPUT`          | 502     | Model output failed validation                            |
| `AI_REQUEST_FAILED`      | 502/429 | Claude API error or network failure                       |
| `AI_NOT_CONFIGURED`      | 503     | `ANTHROPIC_API_KEY` secret missing                        |
| `NOT_SIGNED_IN`          | 401     | Missing or invalid JWT                                    |
| `AI_UNAVAILABLE_IN_DEMO` | —       | Demo mode (no backend to hold the key)                    |
