#!/usr/bin/env bash
# Apply Supabase migrations + seed to a remote Supabase project.
#
# Two ways to use this:
#
#  A) With direct Postgres connection string (fastest, no CLI):
#       export SUPABASE_DB_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres"
#       ./scripts/apply-supabase-schema.sh
#
#  B) With Supabase CLI linked to the project:
#       supabase link --project-ref <project-ref>
#       supabase db push
#       psql "$(supabase db url)" < supabase/seed.sql
#
# Get the connection string from: Supabase Dashboard → Project → Project Settings → Database → Connection string
# Use the "Transaction mode" pooler URL (port 6543).

set -euo pipefail

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "ERROR: set SUPABASE_DB_URL first."
  echo ""
  echo "Get it from: Supabase Dashboard → Project Settings → Database → Connection string → Transaction (Session pool, port 6543)"
  echo "Replace [YOUR-PASSWORD] with your DB password from Project Settings → Database."
  echo ""
  echo "Then re-run:  SUPABASE_DB_URL='postgresql://...' ./scripts/apply-supabase-schema.sh"
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: psql not installed. Install Postgres client tools first."
  echo "  macOS:  brew install libpq && brew link --force libpq"
  echo "  Ubuntu: sudo apt-get install -y postgresql-client"
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Applying migrations from $REPO_ROOT/supabase/migrations/"
for f in "$REPO_ROOT"/supabase/migrations/*.sql; do
  echo "  - $(basename "$f")"
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$f" >/dev/null
done

echo ""
echo "==> Applying seed from $REPO_ROOT/supabase/seed.sql"
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/seed.sql" >/dev/null

echo ""
echo "==> Verifying"
psql "$SUPABASE_DB_URL" -c "select count(*) as buildings from public.buildings;"
psql "$SUPABASE_DB_URL" -c "select count(*) as managers from public.managers_allowlist;"

echo ""
echo "✅ Done. Set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY in Vercel + Cloudflare."
