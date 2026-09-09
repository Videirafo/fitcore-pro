#!/usr/bin/env bash
set -euo pipefail
cd /opt/fitcore-pro

resolve_db_url() {
  if [ -n "${FITCORE_DATABASE_URL:-}" ]; then echo "$FITCORE_DATABASE_URL"; return 0; fi
  local from_systemd
  from_systemd=$(systemctl cat fitcore-api 2>/dev/null | grep -o 'FITCORE_DATABASE_URL=[^" ]*' | tail -1 | cut -d= -f2- || true)
  if [ -n "$from_systemd" ]; then echo "$from_systemd"; return 0; fi
  if [ -f storage/secrets/fitcore-postgres.env ]; then
    # shellcheck disable=SC1091
    source storage/secrets/fitcore-postgres.env
    if [ -n "${POSTGRES_DB:-}" ] && [ -n "${POSTGRES_USER:-}" ] && [ -n "${POSTGRES_PASSWORD:-}" ]; then
      echo "postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:55435/${POSTGRES_DB}?sslmode=disable"
      return 0
    fi
  fi
  return 1
}

FITCORE_DATABASE_URL=$(resolve_db_url) || { echo "ERRO: FITCORE_DATABASE_URL não resolvido."; exit 1; }
export FITCORE_DATABASE_URL

psql "$FITCORE_DATABASE_URL" -v ON_ERROR_STOP=1 -f infra/sql/005-mvp-19-credential-login.sql

mkdir -p /etc/systemd/system/fitcore-api.service.d
cat > /etc/systemd/system/fitcore-api.service.d/30-fitcore-credential-login.conf <<'EOF'
[Service]
Environment="FITCORE_CREDENTIAL_LOGIN_ENABLED=true"
EOF

node --check services/api/security/credential-auth.mjs
node --check services/api/security/signed-session.mjs
node --check services/api/server.mjs
node --check apps/site-static/mvp-19.js

systemctl daemon-reload
systemctl restart fitcore-api
systemctl status --no-pager fitcore-api

echo "MVP-19 aplicado: login por credencial mínima ativo com rollback controlado."
