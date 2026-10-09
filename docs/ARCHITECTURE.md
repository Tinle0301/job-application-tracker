# Architecture

## Overview

```
┌──────────────────────────┐         ┌───────────────────────────── Supabase ─────────────────────────────┐
│  Browser (React + Vite)  │         │                                                                    │
│                          │  REST   │  PostgREST ──► Postgres                                            │
│  components ─► TrackerApi├────────►│               ├─ applications, status_history  (RLS: auth.uid())   │
│                (services)│         │               ├─ resumes, ai_analyses, ai_usage (RLS: auth.uid())  │
│                          │         │               └─ triggers + RPC: status history, pipeline_stats    │
│                          │  HTTPS  │                                                                    │
│                          ├────────►│  Edge Functions (Deno) ── parse-job, match-resume ──► LLM API      │
│                          │  JWT    │     run as the caller (their JWT), so RLS still applies            │
└──────────────────────────┘         └────────────────────────────────────────────────────────────────────┘
```

Supabase is the whole backend: there is no app server to deploy or keep running ([ADR 0001](adr/0001-supabase-no-app-server.md)). The only server-side code is two small Edge Functions that hold the Anthropic API key ([ADR 0002](adr/0002-ai-via-edge-functions.md)).

## Layers

| Layer    | Location                  | Responsibility                                                                 |
| -------- | ------------------------- | ------------------------------------------------------------------------------ |
| UI       | `frontend/src/components` | Rendering and user input only. Talks to a `TrackerApi`, never to Supabase.     |
| State    | `frontend/src/hooks`      | `useApplications` keeps the list in sync with the API and surfaces errors.     |
| Services | `backend/services`        | `TrackerApi` contract, Supabase implementation, shared validation, `Result`.   |
| Models   | `backend/models/types.ts` | Domain types shared by UI, services and tests.                                 |
| Database | `backend/migrations`      | Schema, constraints, RLS policies, triggers and RPC functions.                 |
| AI       | `supabase/functions`      | `parse-job` and `match-resume`; prompts, schemas and validators in `_shared/`. |

## Key decisions

- **One interface, two implementations.** `createSupabaseApi()` for production and `createDemoApi()` (localStorage) when no Supabase env vars are set. Both use the same validation, so they return the same error codes for bad input.
- **Services never throw.** Every call returns `{ data, error }`; UI code checks `error` and shows `error.message`. Raw database messages are never shown to users.
- **Rules live in the database.** Length and URL checks are `CHECK` constraints; ownership is RLS; the status timeline is written by a trigger, so it cannot drift from `applications.status`.
- **AI output is validated twice.** The model is forced to answer through a tool with a JSON schema, then `validateParsedJob` / `validateFit` clamp and trim the result before anything is stored or returned.

## Request flows

**Update a status.** `StatusSelect` → `updateStatus(id, status)` → `PATCH applications` → `BEFORE UPDATE` trigger sets `updated_at` and appends to `status_history` if the status changed → the row comes back with history and is replaced in state.

**Auto-fill from a posting.** Form → `parseJobPosting({ text | url })` → `parse-job` checks the JWT, quota and (for URLs) the SSRF guard, fetches and strips the page, calls the LLM with `record_job_posting` forced → validated fields merged into empty form fields only.

**Analyze fit.** Row detail → `analyzeFit(applicationId)` → `match-resume` reads the application and default resume **as the user** (RLS), calls the LLM with `record_fit_analysis` forced → validated result inserted into `ai_analyses` → shown in the panel and as the Fit column badge.
