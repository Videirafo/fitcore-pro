#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATION="$ROOT/infra/sql/023-execution-kernel-v2.sql"
DB_URL="${FITCORE_DATABASE_URL:-${DATABASE_URL:-}}"

[[ -n "$DB_URL" ]] || { echo "ERRO: FITCORE_DATABASE_URL ausente para migration 023." >&2; exit 2; }
[[ -f "$MIGRATION" ]] || { echo "ERRO: migration 023 ausente." >&2; exit 3; }
command -v psql >/dev/null || { echo "ERRO: psql ausente." >&2; exit 4; }

SERVER_VERSION="$(psql "$DB_URL" -X -Atqc "SHOW server_version")"
[[ "$SERVER_VERSION" == 17.6* ]] || { echo "ERRO: PostgreSQL 17.6 obrigatório; encontrado $SERVER_VERSION." >&2; exit 5; }

psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null
VERIFY="$(psql "$DB_URL" -X -AtF "|" -v ON_ERROR_STOP=1 -c "
SELECT
  to_regclass('public.fitcore_execution_runs') IS NOT NULL,
  to_regprocedure('public.fitcore_execution_admit(uuid,uuid,text,text,text,text,text,text,integer,text,text,text)') IS NOT NULL,
  to_regprocedure('public.fitcore_execution_transition(uuid,text,text,text,text,text,uuid,jsonb)') IS NOT NULL,
  to_regprocedure('public.fitcore_execution_recover(uuid,text,text,text,text,timestamp with time zone)') IS NOT NULL,
  COALESCE((SELECT status FROM fitcore_schema_migrations WHERE version='023-execution-kernel-v2'),'missing');
")"
[[ "$VERIFY" == "t|t|t|t|aplicada" ]] || { echo "ERRO: migration 023 não passou na verificação." >&2; exit 6; }

echo "execution_kernel_migration=PASS PostgreSQL=$SERVER_VERSION"