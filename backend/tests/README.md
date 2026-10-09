# Database tests

Plain SQL checks that run in CI against a fresh Postgres container:

1. `00_supabase_stubs.sql` — fakes the bits of Supabase the migrations need (`auth.users`, `auth.uid()`, roles). **Never run it on a real project.**
2. `../migrations/*.sql` — applied in order.
3. `../seed/seed.sql` — two users and sample data.
4. `rls_check.sql` — each user only sees and changes their own rows.
5. `status_history_check.sql` — the trigger logs each status change once; `pipeline_stats()` is correct.

Run locally (Docker):

```bash
docker run -d --name tracker-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
npm run db:test
```
