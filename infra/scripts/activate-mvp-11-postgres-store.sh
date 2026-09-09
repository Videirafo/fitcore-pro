#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$ROOT/storage/secrets/fitcore-postgres.env"
DROPIN_DIR="/etc/systemd/system/fitcore-api.service.d"
DROPIN_FILE="$DROPIN_DIR/10-fitcore-persistence.conf"
STATUS_FILE="$ROOT/storage/mvp-11/postgres-activation-status.json"
DB_HOST="127.0.0.1"
DB_PORT="55435"

if [ "$(id -u)" -ne 0 ]; then
  echo "ERRO: rode como root para alterar systemd." >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "ERRO: segredo do banco não existe: $ENV_FILE" >&2
  echo "Rode antes: bash infra/scripts/setup-mvp-11-fitcore-postgres.sh" >&2
  exit 1
fi

set -a
. "$ENV_FILE"
set +a

DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${DB_HOST}:${DB_PORT}/${POSTGRES_DB}?sslmode=disable"

if ! PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -X -A -t -q -v ON_ERROR_STOP=1 -c "SELECT 1 FROM fitcore_tenants WHERE slug='demo' LIMIT 1;" >/dev/null; then
  echo "ERRO: banco FitCore não validou tenant demo. Rode setup/migrations antes." >&2
  exit 1
fi

mkdir -p "$DROPIN_DIR"
cat > "$DROPIN_FILE" <<EOF
[Service]
Environment="FITCORE_DATABASE_URL=$DATABASE_URL"
Environment="FITCORE_PERSISTENCE_STORE=postgres"
Environment="FITCORE_TENANT_SLUG=demo"
Environment="FITCORE_DB_CONNECT_TIMEOUT_SECONDS=5"
EOF
chmod 600 "$DROPIN_FILE"

systemctl daemon-reload
systemctl restart fitcore-api
sleep 3

if ! systemctl is-active --quiet fitcore-api; then
  echo "ERRO: fitcore-api não ficou ativo. Fazendo rollback para JsonFileStore." >&2
  rm -f "$DROPIN_FILE"
  systemctl daemon-reload
  systemctl restart fitcore-api || true
  exit 1
fi

if ! curl -fsS http://127.0.0.1:8091/api/mvp-10/postgres-store >/tmp/fitcore-mvp11-health.json; then
  echo "ERRO: API local não respondeu. Fazendo rollback para JsonFileStore." >&2
  rm -f "$DROPIN_FILE"
  systemctl daemon-reload
  systemctl restart fitcore-api || true
  exit 1
fi

if ! grep -q '"active_store"[[:space:]]*:[[:space:]]*"PostgresStore"' /tmp/fitcore-mvp11-health.json; then
  echo "ERRO: API não ativou PostgresStore. Resposta:" >&2
  cat /tmp/fitcore-mvp11-health.json >&2
  echo >&2
  echo "Fazendo rollback para JsonFileStore." >&2
  rm -f "$DROPIN_FILE"
  systemctl daemon-reload
  systemctl restart fitcore-api || true
  exit 1
fi

mkdir -p "$(dirname "$STATUS_FILE")"
cat > "$STATUS_FILE" <<EOF
{
  "ok": true,
  "mvp": "MVP-11 Ativação controlada PostgreSQL",
  "active_store": "PostgresStore",
  "rollback": "remover $DROPIN_FILE e reiniciar fitcore-api",
  "dropin": "$DROPIN_FILE",
  "database": "$POSTGRES_DB",
  "host": "$DB_HOST",
  "port": $DB_PORT,
  "tenant_slug": "demo"
}
EOF
chmod 600 "$STATUS_FILE"

echo "MVP-11 ativo: fitcore-api usando PostgresStore."
echo "Drop-in: $DROPIN_FILE"
echo "Status: $STATUS_FILE"
