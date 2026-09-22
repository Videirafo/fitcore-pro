#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATION="$ROOT/infra/sql/031-workout-builder-vnext.sql"
DB_URL="${FITCORE_DATABASE_URL:-${DATABASE_URL:-}}"

[[ -n "$DB_URL" ]] || { echo "ERRO: FITCORE_DATABASE_URL ausente para migration 031." >&2; exit 2; }
[[ -f "$MIGRATION" ]] || { echo "ERRO: migration 031 ausente." >&2; exit 3; }
command -v psql >/dev/null || { echo "ERRO: psql ausente." >&2; exit 4; }

SERVER_VERSION="$(psql "$DB_URL" -X -Atqc "SHOW server_version")"
[[ "$SERVER_VERSION" == 17.6* ]] || { echo "ERRO: PostgreSQL 17.6 obrigatório; encontrado $SERVER_VERSION." >&2; exit 5; }

psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null
VERIFY="$(psql "$DB_URL" -X -AtF "|" -v ON_ERROR_STOP=1 -c "
SELECT
  to_regclass('public.fitcore_workout_templates') IS NOT NULL,
  to_regclass('public.fitcore_workout_blocks') IS NOT NULL,
  to_regclass('public.fitcore_workout_set_targets') IS NOT NULL,
  to_regrole('fitcore_runtime') IS NOT NULL,
  COALESCE((SELECT status FROM fitcore_schema_migrations WHERE version='031-workout-builder-vnext'),'missing');
")"
[[ "$VERIFY" == "t|t|t|t|aplicada" ]] || { echo "ERRO: migration 031 não passou na verificação." >&2; exit 6; }

echo "workout_builder_vnext_migration=PASS PostgreSQL=$SERVER_VERSION"
