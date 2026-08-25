#!/usr/bin/env bash
# Apply the auth shim + every migration to a local Postgres database.
#
#   DATABASE_URL=postgresql://... ./supabase/local-dev/apply.sh
#
# Against a real Supabase project use the Supabase CLI instead:
#   supabase db push
set -euo pipefail

DB_URL="${DATABASE_URL:?set DATABASE_URL to your local Postgres connection string}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "==> auth shim (local only)"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/local-dev/00_auth_shim.sql"

for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "==> $(basename "$f")"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done

echo "==> grants (local only)"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/local-dev/99_grants.sql"

echo "==> done"
