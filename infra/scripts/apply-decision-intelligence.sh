#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATION="$ROOT/infra/sql/025-decision-intelligence.sql"
DB_URL="${FITCORE_DATABASE_URL:-${DATABASE_URL:-}}"

[[ -n "$DB_URL" ]] || { echo "ERRO: FITCORE_DATABASE_URL ausente para migration 025." >&2; exit 2; }
[[ -f "$MIGRATION" ]] || { echo "ERRO: migration 025 ausente." >&2; exit 3; }
command -v psql >/dev/null || { echo "ERRO: psql ausente." >&2; exit 4; }

SERVER_VERSION="$(psql "$DB_URL" -X -Atqc "SHOW server_version")"
[[ "$SERVER_VERSION" == 17.6* ]] || { echo "ERRO: PostgreSQL 17.6 obrigatório; encontrado $SERVER_VERSION." >&2; exit 5; }

psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null
VERIFY="$(psql "$DB_URL" -X -AtF "|" -v ON_ERROR_STOP=1 -c "
SELECT
  to_regclass('public.fitcore_execution_decision_events') IS NOT NULL,
  to_regprocedure('public.fitcore_decision_track_proposal(uuid,uuid,text)') IS NOT NULL,
  to_regprocedure('public.fitcore_decision_validate_accepted(uuid,uuid,text,text,uuid)') IS NOT NULL,
  to_regprocedure('public.fitcore_decision_transition(uuid,uuid,text,text,text,text,text)') IS NOT NULL,
  to_regprocedure('public.fitcore_decision_record_outcome(uuid,uuid,text,text,text,numeric,integer)') IS NOT NULL,
  to_regprocedure('public.fitcore_decision_intelligence(uuid,integer)') IS NOT NULL,
  COALESCE((SELECT status FROM fitcore_schema_migrations WHERE version='025-decision-intelligence'),'missing');
")"
[[ "$VERIFY" == "t|t|t|t|t|t|aplicada" ]] || { echo "ERRO: migration 025 não passou na verificação." >&2; exit 6; }

echo "decision_intelligence_migration=PASS PostgreSQL=$SERVER_VERSION"
