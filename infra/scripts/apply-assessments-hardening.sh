#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATION="$ROOT/infra/sql/029-assessments-hardening.sql"
DB_URL="${FITCORE_DATABASE_URL:-${DATABASE_URL:-}}"

[[ -n "$DB_URL" ]] || { echo "ERRO: FITCORE_DATABASE_URL ausente para migration 029." >&2; exit 2; }
[[ -f "$MIGRATION" ]] || { echo "ERRO: migration 029 ausente." >&2; exit 3; }
command -v psql >/dev/null || { echo "ERRO: psql ausente." >&2; exit 4; }

SERVER_VERSION="$(psql "$DB_URL" -X -Atqc "SHOW server_version")"
[[ "$SERVER_VERSION" == 17.6* ]] || { echo "ERRO: PostgreSQL 17.6 obrigatório; encontrado $SERVER_VERSION." >&2; exit 5; }

psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null
VERIFY="$(psql "$DB_URL" -X -AtF "|" -v ON_ERROR_STOP=1 -c "
SELECT
  to_regprocedure('public.fitcore_assessment_current_consent(uuid,uuid,text)') IS NOT NULL,
  to_regprocedure('public.fitcore_assessment_template_publish(uuid,uuid,text,text,text,text,jsonb)') IS NOT NULL,
  to_regprocedure('public.fitcore_assessment_summary(uuid,uuid,text,uuid)') IS NOT NULL,
  COALESCE((SELECT status FROM fitcore_schema_migrations WHERE version='029-assessments-hardening'),'missing');
")"
[[ "$VERIFY" == "t|t|t|aplicada" ]] || { echo "ERRO: migration 029 não passou na verificação." >&2; exit 6; }

echo "assessments_hardening_migration=PASS PostgreSQL=$SERVER_VERSION"
