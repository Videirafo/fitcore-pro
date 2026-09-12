#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SECRET_FILE="${FITCORE_POSTGRES_SECRET_FILE:-/opt/fitcore-pro/storage/secrets/fitcore-postgres.env}"

if [[ ! -f "$SECRET_FILE" ]]; then
  echo "ERRO: secrets do PostgreSQL ausentes." >&2
  exit 1
fi

set -a
. "$SECRET_FILE"
set +a

DB_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:55435/${POSTGRES_DB}?sslmode=disable"
psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$ROOT/infra/sql/020-mvp-48-premium-product.sql"

node --check "$ROOT/services/api/security/tenant-onboarding.mjs"
node --check "$ROOT/services/api/security/tenant-user-management.mjs"
node "$ROOT/tools/check-mvp-48-premium-product.mjs"

echo "MVP-48 aplicado: identidade por e-mail e perfil premium preparados no PostgreSQL."
