#!/usr/bin/env bash
set -euo pipefail
cd /opt/fitcore-pro

ENV_FILE="/opt/fitcore-pro/storage/secrets/fitcore-postgres.env"
if [ -f "$ENV_FILE" ]; then set -a; . "$ENV_FILE"; set +a; fi
if [ -z "${FITCORE_DATABASE_URL:-}" ] && [ -n "${POSTGRES_DB:-}" ] && [ -n "${POSTGRES_USER:-}" ] && [ -n "${POSTGRES_PASSWORD:-}" ]; then
  FITCORE_DATABASE_URL="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:55435/${POSTGRES_DB}?sslmode=disable"
fi
if [ -z "${FITCORE_DATABASE_URL:-}" ]; then echo "ERRO: FITCORE_DATABASE_URL ausente." >&2; exit 1; fi

psql "${FITCORE_DATABASE_URL}" -v ON_ERROR_STOP=1 -f infra/sql/004-mvp-18-user-invites.sql

node --check services/api/security/signed-session.mjs
node --check services/api/security/invite-users.mjs
node --check services/api/server.mjs
node --check apps/site-static/mvp-18.js
systemctl restart fitcore-api
systemctl status --no-pager fitcore-api

echo "MVP-18 aplicado: perfis reais e convites por token ativos."
