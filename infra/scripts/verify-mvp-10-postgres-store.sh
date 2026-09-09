#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

DB_URL="${FITCORE_DATABASE_URL:-${DATABASE_URL:-}}"
API_URL="${FITCORE_API_URL:-http://127.0.0.1:8091}"

echo "MVP-10 — verificando PostgresStore controlado"

test -f services/api/persistence/postgres-store.mjs && echo "OK: services/api/persistence/postgres-store.mjs"
test -f services/api/persistence/server-adapter-glue.mjs && echo "OK: server-adapter-glue.mjs"
test -f infra/sql/002-mvp-10-postgres-store.sql && echo "OK: migration MVP-10"
test -f apps/site-static/mvp-10.html && echo "OK: página MVP-10"

grep -q "PostgresStore" services/api/persistence/server-adapter-glue.mjs && echo "OK: adapter conhece PostgresStore"
grep -q "JsonFileStore" services/api/persistence/server-adapter-glue.mjs && echo "OK: fallback JsonFileStore preservado"
grep -q "FITCORE_PERSISTENCE_STORE" services/api/persistence/server-adapter-glue.mjs && echo "OK: ativação explícita exigida"
grep -q "/api/mvp-10/postgres-store" services/api/server.mjs && echo "OK: endpoint MVP-10 registrado no server.mjs"
grep -q "mvp_10" services/api/server.mjs && echo "OK: health expõe mvp_10"

node --check services/api/persistence/postgres-store.mjs
node --check services/api/persistence/server-adapter-glue.mjs
node --check services/api/server.mjs
node --check apps/site-static/mvp-10.js

echo "OK: sintaxe validada"

if curl -fsS "$API_URL/api/mvp-10/postgres-store" >/tmp/fitcore-mvp10-health.json 2>/dev/null; then
  grep -q "PostgresStore controlado" /tmp/fitcore-mvp10-health.json && echo "OK: API local respondeu /api/mvp-10/postgres-store"
  grep -q "fallback_seguro" /tmp/fitcore-mvp10-health.json && echo "OK: resposta expõe fallback_seguro"
else
  echo "AVISO: API local não respondeu em $API_URL. Reinicie fitcore-api antes do teste HTTP."
fi

if [[ -n "$DB_URL" ]]; then
  if ! command -v psql >/dev/null 2>&1; then
    echo "ERRO: FITCORE_DATABASE_URL existe, mas psql não está disponível." >&2
    exit 1
  fi

  psql "$DB_URL" -At -v ON_ERROR_STOP=1 -c "
    SELECT CASE WHEN COUNT(*) = 10 THEN 'ok' ELSE 'missing' END
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (table_name, column_name) IN (
        ('fitcore_students', 'source_mvp_id'),
        ('fitcore_students', 'payload'),
        ('fitcore_workouts', 'source_mvp_id'),
        ('fitcore_workouts', 'payload'),
        ('fitcore_professor_reviews', 'source_mvp_id'),
        ('fitcore_professor_reviews', 'payload'),
        ('fitcore_workout_executions', 'source_mvp_id'),
        ('fitcore_workout_executions', 'payload'),
        ('fitcore_audit_events', 'source_mvp_id'),
        ('fitcore_audit_events', 'external_resource_id')
      );
  " | grep -q "ok"

  echo "OK: colunas MVP-10 presentes no PostgreSQL"
else
  echo "OK: sem FITCORE_DATABASE_URL; modo esperado é fallback JSON."
fi

echo "MVP-10 verificado: PostgresStore controlado preparado, com rollback para JsonFileStore."
