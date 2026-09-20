#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATION="$ROOT/infra/sql/024-execution-analytics-nba.sql"
DB_URL="${FITCORE_DATABASE_URL:-${DATABASE_URL:-}}"

[[ -n "$DB_URL" ]] || { echo "ERRO: FITCORE_DATABASE_URL ausente para migration 024." >&2; exit 2; }
[[ -f "$MIGRATION" ]] || { echo "ERRO: migration 024 ausente." >&2; exit 3; }
command -v psql >/dev/null || { echo "ERRO: psql ausente." >&2; exit 4; }

SERVER_VERSION="$(psql "$DB_URL" -X -Atqc "SHOW server_version")"
[[ "$SERVER_VERSION" == 17.6* ]] || { echo "ERRO: PostgreSQL 17.6 obrigatório; encontrado $SERVER_VERSION." >&2; exit 5; }

psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null
VERIFY="$(psql "$DB_URL" -X -AtF "|" -v ON_ERROR_STOP=1 -c "
SELECT
  to_regclass('public.fitcore_execution_decisions') IS NOT NULL,
  to_regprocedure('public.fitcore_execution_analytics(uuid,integer)') IS NOT NULL,
  to_regprocedure('public.fitcore_execution_record_decision(uuid,uuid,text,integer,text,text,text,uuid)') IS NOT NULL,
  to_regprocedure('public.fitcore_execution_validate_decision(uuid,uuid,text,text,uuid)') IS NOT NULL,
  to_regprocedure('public.fitcore_execution_transition_decision(uuid,text,text,text,text)') IS NOT NULL,
  COALESCE((SELECT status FROM fitcore_schema_migrations WHERE version='024-execution-analytics-nba'),'missing');
")"
[[ "$VERIFY" == "t|t|t|t|t|aplicada" ]] || { echo "ERRO: migration 024 não passou na verificação." >&2; exit 6; }

echo "execution_analytics_migration=PASS PostgreSQL=$SERVER_VERSION"
