# AI features

Two features, both powered by an LLM (Google Gemini API, free tier) through Supabase Edge Functions.

## 1. Paste a job link → auto-fill

In **Add application**, paste the job's link into **Paste a job link** (it starts reading as soon as you paste), or choose **Paste the text instead**. The `parse-job` function returns company, role, location, salary, employment type, key requirements, a summary and the full description. The form only fills **empty** fields, so nothing you typed is overwritten. The description is saved with the application for later matching.

Each user gets **3 auto-fills in total** (successful ones, by link or text). The box shows how many are left; once they're used, it's replaced by a short note and applications are added by hand. The cap lives in `app_limits.max_autofills_per_user` (`backend/migrations/0006_autofill_limit.sql`) and is enforced by the database, so it can be changed from the SQL editor without a deploy.

Links are read server-side (`supabase/functions/_shared/jobSources.ts`). Most job boards render with JavaScript, so known boards are read through their public posting data instead of the page:

| Link                                                          | Read from                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------ |
| `boards.greenhouse.io/…/jobs/…`, `job-boards.greenhouse.io/…` | Greenhouse Job Board API                                     |
| `jobs.lever.co/…`                                             | Lever Postings API                                           |
| `jobs.ashbyhq.com/…`                                          | Ashby Job Board API                                          |
| `*.myworkdayjobs.com/…/job/…`                                 | Workday's public job JSON                                    |
| `linkedin.com/jobs/view/…`, any `?currentJobId=…`             | LinkedIn's logged-out job page (may be rate-limited)         |
| anything else                                                 | the page itself, preferring its schema.org `JobPosting` data |

If a page still can't be read (login walls, bot checks such as Indeed's), the function returns `FETCH_FAILED` and the form switches to **Paste the text instead**, keeping the link in the URL field.

## 2. Resume–job match score

Save your resume once in the **Resume** tab (plain text). Expand any application with a job description and click **Analyze fit**. `match-resume` returns a 0–100 score, matched and missing skills, a short summary and up to five concrete resume edits. The newest score appears in the **Fit** column.

Scoring guide given to the model: 90+ meets nearly everything, 70–89 strong with small gaps, 50–69 partial, below 50 weak. It's a quick signal, not a hiring prediction.

## How it works

- **Structured output.** Each call forces a single tool (`record_job_posting` / `record_fit_analysis`) whose `input_schema` defines the JSON shape. Validators in `supabase/functions/_shared/prompts.ts` then trim strings, cap list lengths and reject out-of-range scores.
- **Model.** `GEMINI_MODEL` secret, default `gemini-2.5-flash` (any id from Google's model list). Without `GEMINI_API_KEY` the functions return `AI_NOT_CONFIGURED`. The free tier has per-minute and per-day request limits; when Google rate-limits, users see `AI_REQUEST_FAILED` and can try again.
- **Prompts** treat the posting and resume as untrusted input and tell the model to ignore instructions inside them, to only count skills the resume shows evidence of, and never to suggest inventing experience.

## Safety and cost controls

| Risk                      | Control                                                                                                                                                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API key exposure          | Key exists only in Supabase function secrets; never in `VITE_*` vars or the bundle                                                                                                                                               |
| Reading other users' data | Functions use the caller's JWT, so Postgres RLS applies to every read and write                                                                                                                                                  |
| SSRF via URL fetch        | `isSafePublicUrl` blocks non-http(s), credentials, localhost, private/link-local/CGNAT IPs, IPv6 literals; redirects (max 4) are re-checked hop by hop; 8 s timeout                                                              |
| Runaway cost              | Lifetime cap of 3 auto-fills per user (`AUTOFILL_LIMIT`, `app_limits.max_autofills_per_user`, enforced on the `ai_usage` insert); per-user daily quota (`AI_DAILY_LIMIT`, default 50) via `ai_usage`; inputs capped at 30k chars |
| Prompt injection          | Inputs wrapped in tags and labelled untrusted; output must match a schema and pass validation                                                                                                                                    |
| Bad output                | Validation failure returns `AI_BAD_OUTPUT` / `PARSE_FAILED`; nothing is stored                                                                                                                                                   |

Known limits: the quota is checked before the call, so a burst of parallel requests can exceed it by a few; DNS names that resolve to private IPs are not re-checked after resolution (the function itself has no private network access).
