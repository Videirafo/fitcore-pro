#!/usr/bin/env bash
set -euo pipefail
cd /opt/fitcore-pro
set -a
. storage/secrets/fitcore-postgres.env
set +a
DB_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:55435/${POSTGRES_DB}?sslmode=disable"
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f infra/sql/017-mvp-31-guided-setup.sql
node --check services/api/security/guided-setup.mjs
node --check services/api/server.mjs
