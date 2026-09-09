#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$ROOT/infra/docker/fitcore-postgres.compose.yml"
ENV_FILE="$ROOT/storage/secrets/fitcore-postgres.env"
DROPIN_FILE="/etc/systemd/system/fitcore-api.service.d/10-fitcore-persistence.conf"

echo "MVP-11 — verificando ativação controlada PostgreSQL"

require_file() {
  local file="$1"
  if [ ! -f "$file" ]; then
    echo "ERRO: arquivo ausente: $file" >&2
    exit 1
  fi
  echo "OK: $file"
}

require_file "$COMPOSE_FILE"
require_file "$ENV_FILE"
require_file "$DROPIN_FILE"

set -a
. "$ENV_FILE"
set +a

STATUS="$(docker inspect -f '{{.State.Health.Status}}' fitcore_postgres 2>/dev/null || true)"
if [ "$STATUS" != "healthy" ]; then
  echo "ERRO: fitcore_postgres não está healthy. Status: ${STATUS:-indisponivel}" >&2
  exit 1
fi
echo "OK: fitcore_postgres healthy"

PGPASSWORD="$POSTGRES_PASSWORD" psql -h 127.0.0.1 -p 55435 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -X -A -t -q -c "SELECT 1;" >/dev/null
echo "OK: conexão psql"

PGPASSWORD="$POSTGRES_PASSWORD" psql -h 127.0.0.1 -p 55435 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -X -A -t -q -c "SELECT 1 FROM fitcore_tenants WHERE slug='demo' LIMIT 1;" >/dev/null
echo "OK: tenant demo existe"

for table in fitcore_tenants fitcore_students fitcore_workouts fitcore_professor_reviews fitcore_workout_executions fitcore_audit_events fitcore_schema_migrations; do
  PGPASSWORD="$POSTGRES_PASSWORD" psql -h 127.0.0.1 -p 55435 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -X -A -t -q -c "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='$table';" | grep -q 1
  echo "OK: tabela $table"
done

systemctl is-active --quiet fitcore-api
echo "OK: fitcore-api ativa"

curl -fsS http://127.0.0.1:8091/api/mvp-10/postgres-store >/tmp/fitcore-mvp11-postgres.json
grep -q '"active_store"[[:space:]]*:[[:space:]]*"PostgresStore"' /tmp/fitcore-mvp11-postgres.json
grep -q '"fallback_seguro"[[:space:]]*:[[:space:]]*false' /tmp/fitcore-mvp11-postgres.json
echo "OK: API local usa PostgresStore"

if command -v curl >/dev/null 2>&1; then
  curl -fsS https://fitcore.marcaia.app/api/mvp-10/postgres-store >/tmp/fitcore-mvp11-public.json
  grep -q '"active_store"[[:space:]]*:[[:space:]]*"PostgresStore"' /tmp/fitcore-mvp11-public.json
  echo "OK: endpoint público confirma PostgresStore"
fi

echo "MVP-11 verificado: PostgresStore ativo com rollback disponível para JsonFileStore."
