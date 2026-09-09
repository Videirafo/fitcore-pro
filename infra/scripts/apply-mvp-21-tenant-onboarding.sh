#!/usr/bin/env bash
set -euo pipefail
cd /opt/fitcore-pro

resolve_db_url() {
  if [ -n "${FITCORE_DATABASE_URL:-}" ]; then echo "$FITCORE_DATABASE_URL"; return 0; fi
  local from_systemd
  from_systemd=$(systemctl cat fitcore-api 2>/dev/null | grep -o 'FITCORE_DATABASE_URL=[^" ]*' | tail -1 | cut -d= -f2- || true)
  if [ -n "$from_systemd" ]; then echo "$from_systemd"; return 0; fi
  if [ -f storage/secrets/fitcore-postgres.env ]; then
    set -a; . storage/secrets/fitcore-postgres.env; set +a
    if [ -n "${POSTGRES_DB:-}" ] && [ -n "${POSTGRES_USER:-}" ] && [ -n "${POSTGRES_PASSWORD:-}" ]; then
      echo "postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:55435/${POSTGRES_DB}?sslmode=disable"
      return 0
    fi
  fi
  return 1
}

FITCORE_DATABASE_URL=$(resolve_db_url) || { echo "ERRO: FITCORE_DATABASE_URL não resolvido."; exit 1; }
export FITCORE_DATABASE_URL

psql "$FITCORE_DATABASE_URL" -v ON_ERROR_STOP=1 -f infra/sql/007-mvp-21-tenant-onboarding.sql

mkdir -p /etc/systemd/system/fitcore-api.service.d
cat > /etc/systemd/system/fitcore-api.service.d/50-fitcore-tenant-onboarding.conf <<'EOF_CONF'
[Service]
Environment="FITCORE_TENANT_ONBOARDING_ENABLED=true"
EOF_CONF

node --check services/api/security/tenant-onboarding.mjs
node --check services/api/security/signed-session.mjs
node --check services/api/security/credential-auth.mjs
node --check services/api/security/auth-hardening.mjs
node --check services/api/persistence/server-adapter-glue.mjs
node --check services/api/server.mjs
node --check apps/site-static/mvp-19.js
node --check apps/site-static/mvp-21.js

systemctl daemon-reload
systemctl restart fitcore-api
systemctl status --no-pager fitcore-api

bash infra/scripts/switch-fitcore-to-own-ui.sh

echo "MVP-21 aplicado: onboarding real de tenant ativo."
