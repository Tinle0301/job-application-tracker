# ADR 0002: AI calls through Supabase Edge Functions

- Status: Accepted
- Date: 2026-10-08

## Context

Auto-fill and resume matching need the Anthropic API key. Calling Claude from the browser would expose the key. Fetching job URLs from the browser is blocked by CORS anyway.

## Decision

Two Deno Edge Functions, `parse-job` and `match-resume`, hold `ANTHROPIC_API_KEY` as a secret. They run as the calling user (their JWT), so RLS still protects data. They use forced tool use for structured JSON, validate the result, enforce a per-user daily quota, and return the same `{ data, error }` envelope as the rest of the API. Pure helpers (prompts, validators, HTML stripping, URL guard) live in `_shared/` and are unit-tested with Vitest.

## Alternatives considered

- **Browser → Claude directly:** leaks the key. Rejected.
- **Separate API server:** contradicts ADR 0001 for two endpoints.
- **Postgres `http` extension:** keeps logic in SQL but makes prompts, validation and testing much harder.

## Consequences

- AI is unavailable in demo mode (`AI_UNAVAILABLE_IN_DEMO`).
- Deploying functions and setting secrets is an extra setup step (docs/SETUP.md).
- Fit results are stored, so the UI shows them later without another model call.
