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
SECRET_FILE="storage/secrets/mvp20-bootstrap-credential.txt"
mkdir -p storage/secrets
if [ ! -f "$SECRET_FILE" ]; then
  LOGIN_SECRET="FitCore-$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9' | head -c 18)-20"
  {
    echo "FITCORE_LOGIN_URL=https://fitcore.marcaia.app/mvp-19.html"
    echo "FITCORE_LOGIN_IDENTIFIER=gestor.fitcore"
    echo "FITCORE_LOGIN_SECRET=$LOGIN_SECRET"
  } > "$SECRET_FILE"
  chmod 600 "$SECRET_FILE"
fi
# shellcheck disable=SC1090
source "$SECRET_FILE"
HASH=$(FITCORE_BOOTSTRAP_SECRET="$FITCORE_LOGIN_SECRET" node --input-type=module - <<'NODE'
import { randomBytes, scryptSync } from "node:crypto";
const secret = process.env.FITCORE_BOOTSTRAP_SECRET || "";
const salt = randomBytes(16).toString("hex");
const hash = scryptSync(secret, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
console.log(`scrypt:16384:8:1:${salt}:${hash}`);
NODE
)
psql "$FITCORE_DATABASE_URL" -v ON_ERROR_STOP=1 -q <<SQL
WITH tenant AS (SELECT id FROM fitcore_tenants WHERE slug='demo' LIMIT 1),
scope AS (SELECT set_config('app.tenant_id', (SELECT id::text FROM tenant), true))
INSERT INTO fitcore_users (tenant_id, nome, papel, externo_id, ativo, login_identifier, credential_kind, credential_hash, credential_set_at, credential_revoked_at, atualizado_em)
SELECT tenant.id, 'Gestor FitCore', 'gestor', 'mvp20-bootstrap-gestor', true, '$FITCORE_LOGIN_IDENTIFIER', 'password', '$HASH', now(), NULL, now()
FROM tenant, scope
ON CONFLICT (tenant_id, externo_id) DO UPDATE SET
  nome = EXCLUDED.nome,
  papel = EXCLUDED.papel,
  ativo = true,
  login_identifier = EXCLUDED.login_identifier,
  credential_kind = EXCLUDED.credential_kind,
  credential_hash = EXCLUDED.credential_hash,
  credential_set_at = now(),
  credential_revoked_at = NULL,
  atualizado_em = now();
SQL
echo "MVP-20 bootstrap gestor pronto: $SECRET_FILE"
