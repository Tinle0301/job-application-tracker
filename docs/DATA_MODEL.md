# Data model

Migrations live in `backend/migrations` and run in order. Database columns are `snake_case`; services map them to the `camelCase` types in `backend/models/types.ts`.

```
auth.users ─┬─< applications ─┬─< status_history
            │                 └─< ai_analyses >── resumes
            ├─< resumes
            ├─< ai_usage
            ├── email_connections
            └─< email_status_updates >── applications
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

Append-only: `application_id`, `status`, `changed_at`, `source` (`manual` | `email`, 0007) and `email_update_id` (the email that made the change). One row on insert, one more each time `status` actually changes. Users can read their own rows; nobody writes directly. The one exception to append-only: undoing an email update deletes that email's row (0007).

## resumes (0004)

`title`, `content` (50–20,000 chars), `is_default`. A partial unique index allows **one default resume per user**; that is the one Analyze fit uses.

## ai_analyses (0004)

`application_id`, `resume_id`, `kind = 'match'`, `score` 0–100, `matched_skills[]`, `missing_skills[]`, `summary`, `suggestions[]`, `model`, `created_at`. Insert is allowed only when the application belongs to the caller. The newest row per application is shown in the UI; older rows are kept as history.

## ai_usage (0004)

One row per model call (`kind` = `parse` | `match` | `email`). `ai_calls_today()` counts the caller's rows in the last 24 hours for the daily quota.

## app_limits, usage_counters (0005)

`app_limits` is a single row of tunable limits (read-only to users). `usage_counters` keeps one row per user with a 1-minute and a 1-day write window; users can't read or change it. See [LIMITS.md](LIMITS.md).

## email_connections, email_status_updates (0007)

`email_connections`: one row per user with a connected Gmail: `email`, the AES-GCM encrypted `refresh_token_enc`, `status` (`connected` | `needs_reconnect`), `last_scan_at`. Users have **no** grants; they read the non-secret columns through `my_email_connection()`.

`email_status_updates`: one row per email that changed or could change a status: `application_id`, Gmail `message_id` (unique per user), `from_address`, `subject`, `received_at`, `detected_status`, `previous_status`, `confidence`, `reason`, `state` (`applied` | `suggested` | `undone` | `dismissed`). Read-only to users; written by the `email-scan` function and changed only through the functions below. See [EMAIL_SYNC.md](EMAIL_SYNC.md).

## email_new_applications (0008)

One row per confirmation-looking email the scan read: Gmail `message_id` (unique per user), `from_address`, `subject`, `received_at`, `applied_on` (the email's date in the user's time zone), `link` (opens it in Gmail), the `company`, `role` and `location` the model read, `confidence`, `reason`, `state` (`created` | `suggested` | `undone` | `dismissed` | `duplicate` | `ignored`) and `application_id` (the application it added, or the tracked one it duplicates). `ignored` rows keep only the message id. Read-only to users. `email_connections.confirmations_scanned_at` is the confirmation search's own cursor. See [EMAIL_SYNC.md](EMAIL_SYNC.md).

## application_emails (0009)

One row per inbox email the scan matched to an application, whether or not it changed the status: `application_id`, Gmail `message_id` (unique per user), `from_name`, `from_address`, `subject`, `received_at` and `link` (opens it in Gmail). Shown, newest first, in the application's expanded row. Read-only to users; deleted with the application. `email_connections.emails_scanned_at` is the look-back cursor: while it is null the scan lists matched emails from the last 30 days, and a trigger on `applications` clears it whenever an application is added. See [EMAIL_SYNC.md](EMAIL_SYNC.md).

## Row-level security (0002, 0004)

Every table has RLS enabled. All policies are scoped to the `authenticated` role with `user_id = auth.uid()` (or, for `status_history`, ownership of the parent application). `backend/tests/rls_check.sql` proves cross-user reads, updates and inserts fail.

## Functions (0003, 0004)

| Function                                     | Purpose                                                         |
| -------------------------------------------- | --------------------------------------------------------------- |
| `track_application_changes()`                | Trigger: history on insert / status change, bumps `updated_at`  |
| `pipeline_stats()`                           | RPC: total, submitted, responded, interviewed, offers           |
| `ai_calls_today()`                           | RPC: caller's AI calls in the last 24 hours                     |
| `touch_updated_at()`                         | Trigger: bumps `resumes.updated_at`                             |
| `my_email_connection()`                      | RPC: the caller's Gmail address, status and last check (0007)   |
| `apply_email_update(id)`                     | RPC: moves the application to the email's status (0007)         |
| `undo_email_update(id)`                      | RPC: restores the previous status, drops the timeline row       |
| `dismiss_email_update(id)`                   | RPC: hides a suggestion                                         |
| `add_email_application(id, company?, role?)` | RPC: adds the application a confirmation email describes (0008) |
| `undo_email_application(id)`                 | RPC: deletes it again while it is still at Applied              |
| `dismiss_email_application(id)`              | RPC: hides a suggested application                              |
| `reset_email_lookback()`                     | Trigger: a new application reopens the email look back (0009)   |

0010 dates email-driven `status_history` rows by the email's `received_at`, and adds `email_new_applications.job_url` (the posting link found in the confirmation) and `described_at` (when the scan looked it up).
