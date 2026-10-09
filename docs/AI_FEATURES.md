# AI features

Two features, both powered by Claude through Supabase Edge Functions.

## 1. Paste a job posting → auto-fill

In **Add application**, paste the posting text (or its URL) into **Auto-fill with AI**. The `parse-job` function returns company, role, location, salary, employment type, key requirements, a summary and the full description. The form only fills **empty** fields, so nothing you typed is overwritten. The description is saved with the application for later matching.

URL mode fetches the page server-side. Many job boards render with JavaScript or require login; in that case you get `FETCH_FAILED` and should paste the text instead.

## 2. Resume–job match score

Save your resume once in the **Resume** tab (plain text). Expand any application with a job description and click **Analyze fit**. `match-resume` returns a 0–100 score, matched and missing skills, a short summary and up to five concrete resume edits. The newest score appears in the **Fit** column.

Scoring guide given to the model: 90+ meets nearly everything, 70–89 strong with small gaps, 50–69 partial, below 50 weak. It's a quick signal, not a hiring prediction.

## How it works

- **Structured output.** Each call forces a single tool (`record_job_posting` / `record_fit_analysis`) whose `input_schema` defines the JSON shape. Validators in `supabase/functions/_shared/prompts.ts` then trim strings, cap list lengths and reject out-of-range scores.
- **Model.** `claude-sonnet-5-5` by default; override with the `ANTHROPIC_MODEL` secret (e.g. `claude-haiku-5-5` for lower cost, `claude-opus-5-5` for the most careful analysis).
- **Prompts** treat the posting and resume as untrusted input and tell the model to ignore instructions inside them, to only count skills the resume shows evidence of, and never to suggest inventing experience.

## Safety and cost controls

| Risk                      | Control                                                                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| API key exposure          | Key exists only in Supabase function secrets; never in `VITE_*` vars or the bundle                                                                 |
| Reading other users' data | Functions use the caller's JWT, so Postgres RLS applies to every read and write                                                                    |
| SSRF via URL fetch        | `isSafePublicUrl` blocks non-http(s), credentials, localhost, private/link-local/CGNAT IPs, IPv6 literals; redirects are not followed; 8 s timeout |
| Runaway cost              | Per-user daily quota (`AI_DAILY_LIMIT`, default 50) via `ai_usage`; inputs capped at 30k chars                                                     |
| Prompt injection          | Inputs wrapped in tags and labelled untrusted; output must match a schema and pass validation                                                      |
| Bad output                | Validation failure returns `AI_BAD_OUTPUT` / `PARSE_FAILED`; nothing is stored                                                                     |

Known limits: the quota is checked before the call, so a burst of parallel requests can exceed it by a few; DNS names that resolve to private IPs are not re-checked after resolution (the function itself has no private network access).
