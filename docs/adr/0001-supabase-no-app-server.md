# ADR 0001: Supabase as the whole backend (no app server)

- Status: Accepted
- Date: 2026-10-08

## Context

The app is a personal CRUD tracker with auth. A custom API server (Express, FastAPI) would add hosting, deployment and auth code to maintain, for very little logic.

## Decision

Use Supabase: Postgres for data, Auth for magic-link sign-in, PostgREST for the API, and RLS policies for authorization. Business rules are database constraints and triggers. The frontend calls Supabase directly through a thin `TrackerApi` service layer.

## Consequences

- No server to deploy; the frontend is a static build.
- Authorization is enforced in one place (RLS) and tested in CI (`backend/tests/rls_check.sql`).
- Logic that needs secrets cannot run in the browser, so it goes in Edge Functions (see ADR 0002).
- Complex server-side workflows would be awkward in SQL; revisit if those appear.
