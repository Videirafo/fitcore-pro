#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATION="$ROOT/infra/sql/026-execution-remediation.sql"
DB_URL="${FITCORE_DATABASE_URL:-${DATABASE_URL:-}}"

[[ -n "$DB_URL" ]] || { echo "ERRO: FITCORE_DATABASE_URL ausente para migration 026." >&2; exit 2; }
[[ -f "$MIGRATION" ]] || { echo "ERRO: migration 026 ausente." >&2; exit 3; }
command -v psql >/dev/null || { echo "ERRO: psql ausente." >&2; exit 4; }

SERVER_VERSION="$(psql "$DB_URL" -X -Atqc "SHOW server_version")"
[[ "$SERVER_VERSION" == 17.6* ]] || { echo "ERRO: PostgreSQL 17.6 obrigatório; encontrado $SERVER_VERSION." >&2; exit 5; }

psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null
VERIFY="$(psql "$DB_URL" -X -AtF "|" -v ON_ERROR_STOP=1 -c "
SELECT
  to_regclass('public.fitcore_execution_remediations') IS NOT NULL,
  to_regclass('public.fitcore_execution_remediation_events') IS NOT NULL,
  to_regprocedure('public.fitcore_execution_remediation_preview(uuid,uuid,text,text)') IS NOT NULL,
  to_regprocedure('public.fitcore_execution_prepare_remediation_retry(uuid,uuid,text,text)') IS NOT NULL,
  to_regprocedure('public.fitcore_execution_remediation_action(uuid,uuid,text,text,text)') IS NOT NULL,
  to_regprocedure('public.fitcore_execution_remediation_dashboard(uuid,integer)') IS NOT NULL,
  COALESCE((SELECT status FROM fitcore_schema_migrations WHERE version='026-execution-remediation'),'missing');
")"
[[ "$VERIFY" == "t|t|t|t|t|t|aplicada" ]] || { echo "ERRO: migration 026 não passou na verificação." >&2; exit 6; }

echo "execution_remediation_migration=PASS PostgreSQL=$SERVER_VERSION"
