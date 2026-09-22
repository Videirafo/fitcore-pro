#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATION="$ROOT/infra/sql/028-assessments-anamnesis.sql"
DB_URL="${FITCORE_DATABASE_URL:-${DATABASE_URL:-}}"

[[ -n "$DB_URL" ]] || { echo "ERRO: FITCORE_DATABASE_URL ausente para migration 028." >&2; exit 2; }
[[ -f "$MIGRATION" ]] || { echo "ERRO: migration 028 ausente." >&2; exit 3; }
command -v psql >/dev/null || { echo "ERRO: psql ausente." >&2; exit 4; }

SERVER_VERSION="$(psql "$DB_URL" -X -Atqc "SHOW server_version")"
[[ "$SERVER_VERSION" == 17.6* ]] || { echo "ERRO: PostgreSQL 17.6 obrigatório; encontrado $SERVER_VERSION." >&2; exit 5; }

psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null
VERIFY="$(psql "$DB_URL" -X -AtF "|" -v ON_ERROR_STOP=1 -c "
SELECT
  to_regclass('public.fitcore_assessment_templates') IS NOT NULL,
  to_regclass('public.fitcore_assessment_consents') IS NOT NULL,
  to_regclass('public.fitcore_assessments') IS NOT NULL,
  to_regclass('public.fitcore_assessment_measurements') IS NOT NULL,
  to_regclass('public.fitcore_assessment_attachments') IS NOT NULL,
  to_regprocedure('public.fitcore_assessment_summary(uuid,uuid,text,uuid)') IS NOT NULL,
  COALESCE((SELECT status FROM fitcore_schema_migrations WHERE version='028-assessments-anamnesis'),'missing');
")"
[[ "$VERIFY" == "t|t|t|t|t|t|aplicada" ]] || { echo "ERRO: migration 028 não passou na verificação." >&2; exit 6; }

echo "assessments_anamnesis_migration=PASS PostgreSQL=$SERVER_VERSION"
