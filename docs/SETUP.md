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
   `backend/migrations/0001_schema.sql` → `0002_rls_policies.sql` → `0003_functions.sql` → `0004_ai.sql` → `0005_usage_limits.sql`.
   Do **not** run `backend/tests/00_supabase_stubs.sql` on Supabase; it only fakes `auth` for CI.
3. **Authentication → Sign In / Providers → Email:** make sure Email is enabled, **Confirm email** is on, and set the minimum password length to **8**.
4. **Authentication → URL Configuration:** add `http://localhost:5173` and your deployed URL as redirect URLs.
5. Copy `.env.example` to `.env`:

   ```bash
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon public key>
   ```

6. Restart `npm run dev`, create an account, confirm the email, and sign in.

## 3. Enable AI (optional, Edge Functions)

Install the [Supabase CLI](https://supabase.com/docs/guides/cli) and get an API key from the [Anthropic Console](https://console.anthropic.com).

```bash
supabase login
supabase link --project-ref <project-ref>
supabase secrets set ANTHROPIC_API_KEY=sk-ant-... ANTHROPIC_MODEL=<model-id>
# optional
supabase secrets set AI_DAILY_LIMIT=50
supabase functions deploy parse-job
supabase functions deploy match-resume
```

Then set `VITE_ENABLE_AI=true` in `.env` (and in Vercel) and redeploy; until then the AI controls stay hidden.

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are provided to functions automatically. The Anthropic key never goes in `.env` or any `VITE_*` variable.

## 4. Test the database locally (optional)

```bash
docker run --rm -d --name jat-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm run db:test
docker stop jat-pg
```

## 5. Deploy the frontend (Vercel)

1. Sign in at [vercel.com](https://vercel.com) with GitHub → **Add New… → Project** → import `job-application-tracker`. `vercel.json` already sets the build (`npm run build`, output `dist`).
2. Under **Environment Variables** add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (leave `VITE_ENABLE_AI` unset for now) → **Deploy**.
3. Copy the production URL (e.g. `https://job-application-tracker-xyz.vercel.app`) into Supabase **Authentication → URL Configuration**: set it as **Site URL** and add it to **Redirect URLs**.
4. Open the URL, create an account, click the confirmation email, sign in, and add a test application. Sign out and try **Forgot password?** once to check the reset email.

Every push to `main` redeploys automatically; pull requests get preview URLs.

**Using the Vercel ↔ Supabase integration?** It creates `SUPABASE_URL` and `SUPABASE_ANON_KEY` (plus secrets). The build accepts those names too (`config/publicEnv.ts`) and exposes only the URL and the anon/publishable key to the browser; the service-role key, JWT secret and Postgres password are never read.

**Troubleshooting:** if the site says _"This deployment isn't connected to its database yet"_, the `VITE_SUPABASE_*` variables were missing at build time. Vite bakes them in during the build, so after adding or fixing them you must **redeploy** (Deployments → ⋯ → Redeploy). Check the names start with `VITE_` and that **Production** is ticked.

## Launch checklist

- [ ] Migrations 0001–0005 applied (not the seed, not the test stubs)
- [ ] RLS enabled on every table (Supabase **Table Editor** shows no "RLS disabled" warnings)
- [ ] Vercel env vars set; only the **anon** key is used in the browser, never the service-role key
- [ ] Site URL and redirect URLs point to the Vercel domain
- [ ] Magic-link email arrives (the built-in Supabase mailer is rate-limited; add custom SMTP for heavier use)
- [ ] `select * from usage_report();` runs in the SQL editor ([LIMITS.md](LIMITS.md))
- [ ] CI green on `main`
