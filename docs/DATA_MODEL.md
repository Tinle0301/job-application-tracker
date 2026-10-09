# Data model

Migrations live in `backend/migrations` and run in order. Database columns are `snake_case`; services map them to the `camelCase` types in `backend/models/types.ts`.

```
auth.users ─┬─< applications ─┬─< status_history
            │                 └─< ai_analyses >── resumes
            ├─< resumes
            └─< ai_usage
```

## applications (0001)

| Column                     | Type                 | Notes                                                                   |
| -------------------------- | -------------------- | ----------------------------------------------------------------------- |
| `id`                       | uuid PK              | `gen_random_uuid()`                                                     |
| `user_id`                  | uuid → auth.users    | Defaults to `auth.uid()`; cascade delete                                |
| `company`, `role`          | text                 | Required, 1–200 chars after trim                                        |
| `location`                 | text                 | ≤ 200                                                                   |
| `url`                      | text                 | Empty or `http(s)://…`                                                  |
| `status`                   | `application_status` | wishlist, applied, assessment, interviewing, offer, rejected, withdrawn |
| `applied_on`               | date                 | Nullable                                                                |
| `salary`                   | text                 | Free text as posted, ≤ 100                                              |
| `notes`                    | text                 | ≤ 5,000                                                                 |
| `job_description`          | text                 | ≤ 30,000; input to Analyze fit                                          |
| `created_at`, `updated_at` | timestamptz          | `updated_at` maintained by trigger                                      |

## status_history (0001, written by 0003 trigger)

Append-only: `application_id`, `status`, `changed_at`. One row on insert, one more each time `status` actually changes. Users can read their own rows; nobody writes directly.

## resumes (0004)

`title`, `content` (50–20,000 chars), `is_default`. A partial unique index allows **one default resume per user**; that is the one Analyze fit uses.

## ai_analyses (0004)

`application_id`, `resume_id`, `kind = 'match'`, `score` 0–100, `matched_skills[]`, `missing_skills[]`, `summary`, `suggestions[]`, `model`, `created_at`. Insert is allowed only when the application belongs to the caller. The newest row per application is shown in the UI; older rows are kept as history.

## ai_usage (0004)

One row per model call (`kind` = `parse` | `match`). `ai_calls_today()` counts the caller's rows in the last 24 hours for the daily quota.

## app_limits, usage_counters (0005)

`app_limits` is a single row of tunable limits (read-only to users). `usage_counters` keeps one row per user with a 1-minute and a 1-day write window; users can't read or change it. See [LIMITS.md](LIMITS.md).

## Row-level security (0002, 0004)

Every table has RLS enabled. All policies are scoped to the `authenticated` role with `user_id = auth.uid()` (or, for `status_history`, ownership of the parent application). `backend/tests/rls_check.sql` proves cross-user reads, updates and inserts fail.

## Functions (0003, 0004)

| Function                      | Purpose                                                        |
| ----------------------------- | -------------------------------------------------------------- |
| `track_application_changes()` | Trigger: history on insert / status change, bumps `updated_at` |
| `pipeline_stats()`            | RPC: total, submitted, responded, interviewed, offers          |
| `ai_calls_today()`            | RPC: caller's AI calls in the last 24 hours                    |
| `touch_updated_at()`          | Trigger: bumps `resumes.updated_at`                            |
