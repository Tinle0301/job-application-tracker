# Job Application Tracker

[![CI](https://github.com/Tinle0301/job-application-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/Tinle0301/job-application-tracker/actions/workflows/ci.yml)

Track job applications from wishlist to offer, with two AI helpers: **paste a job posting to auto-fill the form**, and **score your resume against any job** to see matched skills, gaps and concrete edits.

![Screenshot of the tracker](docs/screenshot.png)

## Features

- **One-click status updates**: Wishlist → Applied → Assessment → Interviewing → Offer, plus Rejected and Withdrawn.
- **Automatic timeline**: a Postgres trigger records every status change, so history can't drift from the data.
- **Pipeline stats**: submitted, active, interviews, offers, response rate and interview rate.
- **Search, filter, sort, import/export JSON.**
- **AI auto-fill** _(Claude)_: paste posting text or a URL; company, role, location, salary, requirements and the full description are filled in. Only empty fields are touched.
- **AI resume match** _(Claude)_: a 0–100 fit score per application with matched and missing skills and up to five resume suggestions. The latest score shows in the list.
- **Two modes**: demo (localStorage, no setup) and Supabase (magic-link auth, row-level security, AI).

## Tech stack

| Layer    | Choice                                                                               |
| -------- | ------------------------------------------------------------------------------------ |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4                                          |
| Backend  | Supabase: PostgreSQL, Auth, Row-Level Security, Edge Functions (Deno)                |
| AI       | Claude API (`claude-sonnet-5-5` by default) with forced tool use for structured JSON |
| Testing  | Vitest, React Testing Library, SQL tests against Postgres 16 in CI                   |
| Tooling  | oxlint, Prettier, GitHub Actions (frontend, database, functions jobs)                |

## Project structure

```
frontend/                 React app (Vite root)
  src/components/         Tracker, ApplicationTable, ApplicationForm, AutoFill, FitPanel, ResumePanel, …
  src/hooks/              useApplications – state over a TrackerApi
  src/lib/                demoApi (localStorage), filters, stats, import/export
backend/
  models/types.ts         Domain types shared by UI, services and tests
  services/               TrackerApi contract, Supabase implementation, validation, Result helpers
  migrations/             0001 schema · 0002 RLS · 0003 triggers/RPC · 0004 AI tables
  seed/seed.sql           Two demo users with sample data
  tests/                  SQL checks (RLS, status history) + unit tests for services and AI helpers
supabase/functions/
  parse-job/              Posting text or URL → structured fields
  match-resume/           Resume × job description → fit analysis
  _shared/                Claude client, prompts + JSON schemas + validators, HTML/URL guards
docs/                     Architecture, data model, API contract, AI features, setup, ADRs
```

Read more: [Architecture](docs/ARCHITECTURE.md) · [Data model](docs/DATA_MODEL.md) · [API contract](docs/API_CONTRACT.md) · [AI features](docs/AI_FEATURES.md) · [Requirements](docs/REQUIREMENTS.md) · [Use cases](docs/USE_CASES.md) · [ADRs](docs/adr)

## Getting started

```bash
git clone https://github.com/Tinle0301/job-application-tracker.git
cd job-application-tracker
npm install
npm run dev     # http://localhost:5173 – demo mode
```

To use Supabase and turn on AI (migrations, `.env`, `supabase secrets set ANTHROPIC_API_KEY=…`, deploying the two functions), follow **[docs/SETUP.md](docs/SETUP.md)**.

## Scripts

| Command                   | Description                                                   |
| ------------------------- | ------------------------------------------------------------- |
| `npm run dev`             | Start the dev server                                          |
| `npm run build`           | Type-check and build to `dist/`                               |
| `npm test`                | Unit and component tests (Vitest)                             |
| `npm run db:test`         | Apply migrations + seed to `$DATABASE_URL` and run SQL checks |
| `npm run functions:check` | Type-check the Edge Functions (needs Deno)                    |
| `npm run lint`            | Lint with oxlint                                              |
| `npm run typecheck`       | Type-check without emitting                                   |
| `npm run format`          | Format with Prettier                                          |

## Security

- Every table has RLS scoped to `auth.uid()`; CI proves cross-user reads and writes fail.
- The Anthropic key lives only in Supabase function secrets. Functions run with the caller's JWT, so RLS applies to AI reads and writes too.
- URL fetching is guarded against SSRF; AI usage has a per-user daily limit. Details in [docs/AI_FEATURES.md](docs/AI_FEATURES.md).

## Import format

A JSON array; `company` and `role` are required, unknown statuses become `applied`.

```json
[
  {
    "company": "Example Co",
    "role": "Software Engineer",
    "status": "applied",
    "appliedOn": "2026-10-07",
    "jobDescription": "…"
  }
]
```

## Roadmap

- Kanban board with drag-and-drop between statuses
- Interview reminders and follow-up dates
- Tailored cover-letter draft from the fit analysis

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
