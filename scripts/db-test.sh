#!/usr/bin/env bash
# Applies stubs → migrations → seed → SQL tests to an EMPTY Postgres database.
# Usage: DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm run db:test
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL to an empty Postgres database}"
cd "$(dirname "$0")/.."
run() { echo "→ $1"; psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$1"; }
run backend/tests/00_supabase_stubs.sql
for f in backend/migrations/*.sql; do run "$f"; done
run backend/seed/seed.sql
for f in backend/tests/*_check.sql; do run "$f"; done
echo "✓ database tests passed"
