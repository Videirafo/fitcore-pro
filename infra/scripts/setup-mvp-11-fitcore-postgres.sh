#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$ROOT/infra/docker/fitcore-postgres.compose.yml"
SECRETS_DIR="$ROOT/storage/secrets"
ENV_FILE="$SECRETS_DIR/fitcore-postgres.env"
SQL_001="$ROOT/infra/sql/001-mvp-07-core.sql"
SQL_002="$ROOT/infra/sql/002-mvp-10-postgres-store.sql"
STATUS_DIR="$ROOT/storage/mvp-11"
STATUS_FILE="$STATUS_DIR/postgres-activation-status.json"

DB_HOST="127.0.0.1"
DB_PORT="55435"
DB_NAME="fitcore"
DB_USER="fitcore_app"

mkdir -p "$SECRETS_DIR" "$STATUS_DIR"
chmod 700 "$SECRETS_DIR"

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "ERRO: compose dedicado ausente: $COMPOSE_FILE" >&2
  exit 1
fi

if [ ! -f "$SQL_001" ] || [ ! -f "$SQL_002" ]; then
  echo "ERRO: migrations MVP-07/MVP-10 ausentes." >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  if command -v openssl >/dev/null 2>&1; then
    DB_PASS="$(openssl rand -hex 32)"
  else
    DB_PASS="$(date +%s%N | sha256sum | awk '{print $1}')"
  fi

  cat > "$ENV_FILE" <<EOF
POSTGRES_DB=$DB_NAME
POSTGRES_USER=$DB_USER
POSTGRES_PASSWORD=$DB_PASS
EOF
  chmod 600 "$ENV_FILE"
  echo "Segredo criado em $ENV_FILE"
else
  echo "Segredo existente preservado em $ENV_FILE"
fi

set -a
. "$ENV_FILE"
set +a

DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${DB_HOST}:${DB_PORT}/${POSTGRES_DB}?sslmode=disable"

echo "Subindo PostgreSQL dedicado do FitCore..."
docker compose -f "$COMPOSE_FILE" up -d

echo "Aguardando healthcheck do fitcore_postgres..."
for i in $(seq 1 40); do
  STATUS="$(docker inspect -f '{{.State.Health.Status}}' fitcore_postgres 2>/dev/null || true)"
  if [ "$STATUS" = "healthy" ]; then
    break
  fi
  sleep 3
done

STATUS="$(docker inspect -f '{{.State.Health.Status}}' fitcore_postgres 2>/dev/null || true)"
if [ "$STATUS" != "healthy" ]; then
  echo "ERRO: fitcore_postgres não ficou healthy. Status: ${STATUS:-indisponivel}" >&2
  docker logs --tail=80 fitcore_postgres >&2 || true
  exit 1
fi

echo "Aplicando migration MVP-07..."
PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -f "$SQL_001" >/dev/null

echo "Aplicando migration MVP-10..."
PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -f "$SQL_002" >/dev/null

TABLE_COUNT="$(PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -X -A -t -q -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'fitcore_%';")"
TENANT_ID="$(PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -X -A -t -q -c "SELECT id FROM fitcore_tenants WHERE slug='demo' LIMIT 1;")"

cat > "$STATUS_FILE" <<EOF
{
  "ok": true,
  "mvp": "MVP-11 Ativação controlada PostgreSQL",
  "database": "fitcore",
  "host": "127.0.0.1",
  "port": 55435,
  "container": "fitcore_postgres",
  "tables_detected": $TABLE_COUNT,
  "tenant_demo_id": "$TENANT_ID",
  "database_url_file": "$ENV_FILE",
  "status": "postgres_dedicado_pronto_migrations_aplicadas"
}
EOF
chmod 600 "$STATUS_FILE"

echo
echo "PostgreSQL dedicado pronto. Migrations MVP-07 + MVP-10 aplicadas."
echo "Container: fitcore_postgres"
echo "Porta local: 127.0.0.1:55435"
echo "Tabelas FitCore detectadas: $TABLE_COUNT"
echo "Tenant demo: $TENANT_ID"
echo "Status: $STATUS_FILE"
echo
echo "DATABASE_URL pronta para systemd:"
echo "$DATABASE_URL" | sed -E 's#://([^:]+):[^@]+@#://\1:***@#'
