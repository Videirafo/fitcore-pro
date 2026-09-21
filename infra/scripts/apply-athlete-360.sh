#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATION="$ROOT/infra/sql/027-athlete-360.sql"
DB_URL="${FITCORE_DATABASE_URL:-${DATABASE_URL:-}}"
[[ -n "$DB_URL" ]] || { echo "ERRO: FITCORE_DATABASE_URL ausente para migration 027." >&2; exit 2; }
[[ -f "$MIGRATION" ]] || { echo "ERRO: migration 027 ausente." >&2; exit 3; }
command -v psql >/dev/null || { echo "ERRO: psql ausente." >&2; exit 4; }
SERVER_VERSION="$(psql "$DB_URL" -X -Atqc "SHOW server_version")"
[[ "$SERVER_VERSION" == 17.6* ]] || { echo "ERRO: PostgreSQL 17.6 obrigatório; encontrado $SERVER_VERSION." >&2; exit 5; }
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null
VERIFY="$(psql "$DB_URL" -X -AtF "|" -v ON_ERROR_STOP=1 -c "
SELECT
  to_regclass('public.fitcore_athlete_goals') IS NOT NULL,
  to_regclass('public.fitcore_athlete_goal_events') IS NOT NULL,
  to_regprocedure('public.fitcore_athlete_360_snapshot(uuid,uuid,text,uuid)') IS NOT NULL,
  to_regprocedure('public.fitcore_athlete_goal_create(uuid,uuid,text,uuid,text,text,numeric,text,date,text)') IS NOT NULL,
  to_regprocedure('public.fitcore_athlete_goal_update(uuid,uuid,text,uuid,numeric,text,text)') IS NOT NULL,
  COALESCE((SELECT status FROM fitcore_schema_migrations WHERE version='027-athlete-360'),'missing');
")"
[[ "$VERIFY" == "t|t|t|t|t|aplicada" ]] || { echo "ERRO: migration 027 não passou na verificação." >&2; exit 6; }
echo "athlete_360_migration=PASS PostgreSQL=$SERVER_VERSION"
