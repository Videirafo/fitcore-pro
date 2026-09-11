#!/usr/bin/env bash
set -euo pipefail
cd /opt/fitcore-pro

if [[ ! -f storage/secrets/fitcore-postgres.env ]]; then
  echo "ERRO: storage/secrets/fitcore-postgres.env ausente" >&2
  exit 1
fi

set -a
. storage/secrets/fitcore-postgres.env
set +a
DB_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:55435/${POSTGRES_DB}?sslmode=disable"

psql "$DB_URL" -v ON_ERROR_STOP=1 -f infra/sql/019-mvp-46-mobile-release.sql
node --check services/api/security/workout-set-sync.mjs
node --check services/api/server.mjs

mkdir -p /etc/systemd/system/fitcore-api.service.d
cat > /etc/systemd/system/fitcore-api.service.d/60-fitcore-mvp46-mobile-release.conf <<'CONF'
[Service]
Environment=FITCORE_WORKOUT_SET_SYNC_ENABLED=true
CONF

systemctl daemon-reload
systemctl restart fitcore-api
systemctl is-active --quiet fitcore-api

BASE="${FITCORE_PUBLIC_URL:-https://fitcore.marcaia.app}"
curl -fsS "$BASE/api/mvp-46/status" | grep -q '"enabled":true\|"enabled": true'
echo "MVP-46 aplicado: sync de séries ativo; dados preservados e API saudável."
