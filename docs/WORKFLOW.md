# Development workflow

1. **Plan:** every change starts as an issue (bug report or user story with acceptance criteria).
2. **Branch:** `feat/…`, `fix/…`, `docs/…` from `main`.
3. **Build:** keep the layers: UI → `TrackerApi` → Supabase / Edge Functions. Schema changes are new numbered migrations.
4. **Test:** add or update Vitest tests (`frontend/src/**`, `backend/tests/unit/**`) and SQL checks (`backend/tests/*_check.sql`).
5. **Commit:** Conventional Commits.
6. **PR:** fill in the template; CI must pass (frontend, database, functions).
7. **Release:** merge to `main`; the hosting provider rebuilds the frontend. Deploy changed functions with `supabase functions deploy <name>` and apply new migrations in the Supabase SQL editor.

## Definition of done

- Acceptance criteria met and demoed in the browser.
- Tests cover the new behavior, including at least one failure path.
- `docs/` updated when the API contract, data model or setup changed.
- No secrets, no console errors.
