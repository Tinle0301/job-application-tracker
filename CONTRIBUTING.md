# Contributing

## Workflow

1. Open an issue (bug report or user story) so the change has acceptance criteria.
2. Branch from `main`: `feat/<short-name>`, `fix/<short-name>` or `docs/<short-name>`.
3. Commit with [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `test:`, `ci:`, `chore:`, `refactor:`).
4. Open a pull request using the template. CI must be green: frontend, database and edge-function jobs.
5. Squash-merge once reviewed.

See [docs/WORKFLOW.md](docs/WORKFLOW.md) for the full process.

## Local checks

```bash
npm run lint && npm run typecheck && npm test && npm run build
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm run db:test   # needs Docker Postgres
npm run functions:check                                                            # needs Deno
```

## Rules of thumb

- **Services never throw.** Every `TrackerApi` method returns `{ data, error }` with a stable `UPPER_SNAKE` error code. Add new codes to `docs/API_CONTRACT.md`.
- **Never edit an applied migration.** Add `backend/migrations/000N_<name>.sql` and update `docs/DATA_MODEL.md`.
- **Every new table gets RLS** and a check in `backend/tests/rls_check.sql`.
- **Secrets stay server-side.** `ANTHROPIC_API_KEY` lives only in Supabase function secrets; nothing secret goes in `VITE_*` variables.
- Format with `npm run format` (Prettier: no semicolons, single quotes, 120 columns).
