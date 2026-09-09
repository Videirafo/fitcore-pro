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

psql "$DB_URL" -v ON_ERROR_STOP=1 -f infra/sql/011-mvp-25-workout-execution.sql
node --check services/api/security/workout-execution.mjs
node --check services/api/server.mjs
node --check apps/site-static/mvp-25.js
node tools/check-front-assets.mjs
node tools/check-next-app.mjs
mkdir -p /etc/systemd/system/fitcore-api.service.d
cat > /etc/systemd/system/fitcore-api.service.d/50-fitcore-workout-execution.conf <<'CONF'
[Service]
Environment=FITCORE_WORKOUT_EXECUTION_ENABLED=true
CONF
systemctl daemon-reload
systemctl restart fitcore-api
systemctl status --no-pager fitcore-api
bash infra/scripts/switch-fitcore-to-own-ui.sh >/tmp/fitcore-mvp25-publish.log
cat /tmp/fitcore-mvp25-publish.log
echo "MVP-25 aplicado: execução real do treino ativa."
