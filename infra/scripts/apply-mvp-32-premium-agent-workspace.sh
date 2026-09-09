#!/usr/bin/env bash
set -euo pipefail
cd /opt/fitcore-pro
if [ -f storage/secrets/fitcore-postgres.env ]; then
  # shellcheck disable=SC1091
  source storage/secrets/fitcore-postgres.env
fi
if [ -z "${FITCORE_DATABASE_URL:-}" ]; then
  if [ -n "${POSTGRES_DB:-}" ] && [ -n "${POSTGRES_USER:-}" ] && [ -n "${POSTGRES_PASSWORD:-}" ]; then
    export FITCORE_DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:55435/${POSTGRES_DB}?sslmode=disable"
  else
    export FITCORE_DATABASE_URL="$(systemctl cat fitcore-api 2>/dev/null | grep -o 'FITCORE_DATABASE_URL=[^" ]*' | tail -1 | cut -d= -f2-)"
  fi
fi
psql "$FITCORE_DATABASE_URL" -v ON_ERROR_STOP=1 -f infra/sql/018-mvp-32-premium-agents-media.sql
npm run mvp32:check
