#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB_URL="${FITCORE_DATABASE_URL:-${DATABASE_URL:-${SUPABASE_DB_URL:-${POSTGRES_URL:-}}}}"
STATUS_FILE="$ROOT_DIR/storage/mvp-07/db-status.json"

EXPECTED_TABLES=(
  fitcore_tenants
  fitcore_users
  fitcore_students
  fitcore_workouts
  fitcore_workout_days
  fitcore_workout_exercises
  fitcore_professor_reviews
  fitcore_workout_executions
  fitcore_exercise_execution_items
  fitcore_audit_events
)

if [[ -z "$DB_URL" ]]; then
  echo "MVP-07: banco não configurado."
  echo "Modo atual: fallback_json_local"
  [[ -f "$STATUS_FILE" ]] && cat "$STATUS_FILE"
  exit 0
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "ERRO: psql não encontrado." >&2
  exit 1
fi

missing=0
for table in "${EXPECTED_TABLES[@]}"; do
  exists="$(psql "$DB_URL" -tAc "select to_regclass('public.${table}') is not null")"
  rls="$(psql "$DB_URL" -tAc "select coalesce((select relrowsecurity from pg_class where oid = 'public.${table}'::regclass), false)")"
  if [[ "$exists" != "t" ]]; then
    echo "CRITICAL: tabela ausente: $table"
    missing=1
  elif [[ "$rls" != "t" ]]; then
    echo "WARNING: tabela sem RLS habilitado: $table"
  else
    echo "PASS: $table existe com RLS habilitado"
  fi
done

if [[ "$missing" -ne 0 ]]; then
  echo "MVP-07 incompleto: rode infra/scripts/apply-mvp-07-db.sh"
  exit 1
fi

psql "$DB_URL" -tAc "select 'tenant_demo=' || id from fitcore_tenants where slug = 'demo' limit 1"

echo "MVP-07 OK: schema mínimo validado."