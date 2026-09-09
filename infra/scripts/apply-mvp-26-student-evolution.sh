#!/usr/bin/env bash
set -euo pipefail
cd /opt/fitcore-pro
SECRET_ENV="/opt/fitcore-pro/storage/secrets/fitcore-postgres.env"
SERVICE_DIR="/etc/systemd/system/fitcore-api.service.d"
DROPIN="$SERVICE_DIR/50-fitcore-student-evolution.conf"
if [[ -f "$SECRET_ENV" ]]; then set -a; source "$SECRET_ENV"; set +a; fi
if [[ -z "${FITCORE_DATABASE_URL:-}" ]]; then
  if [[ -n "${POSTGRES_USER:-}" && -n "${POSTGRES_PASSWORD:-}" && -n "${POSTGRES_DB:-}" ]]; then
    export FITCORE_DATABASE_URL="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:55435/${POSTGRES_DB}"
  fi
fi
if [[ -z "${FITCORE_DATABASE_URL:-}" ]]; then echo "ERRO: FITCORE_DATABASE_URL ausente." >&2; exit 1; fi
psql "$FITCORE_DATABASE_URL" -v ON_ERROR_STOP=1 -f infra/sql/012-mvp-26-student-evolution.sql
node --check services/api/security/student-evolution.mjs
node --check services/api/server.mjs
node --check apps/site-static/mvp-26.js
node tools/check-front-assets.mjs
node tools/check-next-app.mjs
mkdir -p "$SERVICE_DIR"
cat > "$DROPIN" <<DROPIN
[Service]
Environment=FITCORE_STUDENT_EVOLUTION_ENABLED=1
DROPIN
systemctl daemon-reload
systemctl restart fitcore-api
systemctl status --no-pager fitcore-api
bash infra/scripts/switch-fitcore-to-own-ui.sh
curl -fsS https://fitcore.marcaia.app/api/mvp-26/status | grep -q '"enabled": true'
echo "MVP-26 aplicado: histórico e evolução do aluno ativos."
