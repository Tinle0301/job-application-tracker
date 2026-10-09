# Setup

## 1. Run locally in demo mode (no accounts needed)

```bash
git clone https://github.com/Tinle0301/job-application-tracker.git
cd job-application-tracker
npm install
npm run dev          # http://localhost:5173
```

With no `VITE_SUPABASE_*` variables the app stores data in `localStorage`. AI features need step 2 and 3.

## 2. Connect Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Apply the migrations **in order** with the SQL editor (or `psql "$DATABASE_URL" -f …`):
   `backend/migrations/0001_schema.sql` → `0002_rls_policies.sql` → `0003_functions.sql` → `0004_ai.sql`.
   Do **not** run `backend/tests/00_supabase_stubs.sql` on Supabase; it only fakes `auth` for CI.
3. **Authentication → URL Configuration:** add `http://localhost:5173` and your deployed URL as redirect URLs.
4. Copy `.env.example` to `.env`:

   ```bash
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon public key>
   ```

5. Restart `npm run dev` and sign in with a magic link.

## 3. Enable AI (Edge Functions)

Install the [Supabase CLI](https://supabase.com/docs/guides/cli) and get an API key from the [Claude Console](https://platform.claude.com).

```bash
supabase login
supabase link --project-ref <project-ref>
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
# optional
supabase secrets set ANTHROPIC_MODEL=claude-sonnet-5-5 AI_DAILY_LIMIT=50
supabase functions deploy parse-job
supabase functions deploy match-resume
```

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are provided to functions automatically. The Anthropic key never goes in `.env` or any `VITE_*` variable.

## 4. Test the database locally (optional)

```bash
docker run --rm -d --name jat-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm run db:test
docker stop jat-pg
```

## 5. Deploy the frontend

`npm run build` outputs a static site in `dist/`. On Vercel or Netlify use build command `npm run build`, output directory `dist`, and set the two `VITE_SUPABASE_*` variables.
