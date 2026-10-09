# Usage limits

The app is built to stay inside the free tiers of Supabase (500 MB database, 50k monthly active users, 5 GB egress) and Vercel (100 GB bandwidth). Limits are enforced **in the database** (`backend/migrations/0005_usage_limits.sql`), so no client can get around them.

## Limits

| Limit                       | Default                         | Error code          | What the user sees                            |
| --------------------------- | ------------------------------- | ------------------- | --------------------------------------------- |
| Applications per user       | 500                             | `APPLICATION_LIMIT` | Delete old applications to add more           |
| Writes per minute, per user | 60                              | `RATE_LIMITED`      | Wait a minute and try again                   |
| Writes per day, per user    | 1,000                           | `DAILY_LIMIT`       | Resets in 24 hours                            |
| Total accounts              | 1,000                           | `SIGNUPS_CLOSED`    | Sign-ups are paused                           |
| Database size               | 400 MB (80%)                    | `STORAGE_FULL`      | New data can't be saved; deleting still works |
| Field sizes                 | see [DATA_MODEL](DATA_MODEL.md) | constraint errors   | Validation message in the form                |
| AI calls per user per day   | 50                              | `AI_DAILY_LIMIT`    | Only when AI is enabled                       |

A "write" is one insert/update/delete **statement**, so importing 300 applications counts as one write. Signed-out visitors can't write at all.

Users see a meter under the stats ("42 of 500 applications · 7 of 1,000 changes today"). It turns amber at 80%.

## Owner tools (Supabase SQL editor)

```sql
-- How close the project is to the limits
select * from usage_report();

-- Change a limit (takes effect immediately, no deploy)
update app_limits set max_users = 2000;
update app_limits set max_applications_per_user = 1000;
```

`usage_report()` and `app_limits` updates are owner-only; the app's roles can read the limits but not change them, and can't see other people's counters.

## Things Supabase already limits

- **Auth emails** (sign-up confirmation, reset): Supabase's built-in mailer sends only a few per hour. Add custom SMTP under **Authentication → Emails** if more people sign up.
- **Auth attempts**: Supabase rate-limits sign-in and sign-up per IP.

## What to watch

Check **Supabase → Project Settings → Usage** monthly. Egress is driven by how often people load their list; with typical data (50 applications × a few KB) each load is well under 1 MB.
