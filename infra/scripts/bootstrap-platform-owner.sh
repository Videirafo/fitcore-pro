#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

EMAIL="${FITCORE_PLATFORM_OWNER_EMAIL:-}"
SECRET="${FITCORE_PLATFORM_OWNER_SECRET:-}"
NAME="${FITCORE_PLATFORM_OWNER_NAME:-Fernando Videira}"
SECRET_FILE="${FITCORE_POSTGRES_SECRET_FILE:-/opt/fitcore-pro/storage/secrets/fitcore-postgres.env}"

if [[ ! "$EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]; then
  echo "ERRO: FITCORE_PLATFORM_OWNER_EMAIL inválido." >&2
  exit 2
fi
if (( ${#SECRET} < 8 )); then
  echo "ERRO: FITCORE_PLATFORM_OWNER_SECRET deve ter pelo menos 8 caracteres." >&2
  exit 2
fi
if [[ ! -f "$SECRET_FILE" ]]; then
  echo "ERRO: secrets do PostgreSQL ausentes." >&2
  exit 1
fi

set -a
. "$SECRET_FILE"
set +a
DB_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:55435/${POSTGRES_DB}?sslmode=disable"

HASH=$(node --input-type=module - <<'NODE'
import { randomBytes, scryptSync } from "node:crypto";
const value = process.env.FITCORE_PLATFORM_OWNER_SECRET || "";
const salt = randomBytes(16).toString("hex");
const hash = scryptSync(value, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
console.log(`scrypt:16384:8:1:${salt}:${hash}`);
NODE
)
psql "$DB_URL" -X -v ON_ERROR_STOP=1 \
  -v owner_email="$EMAIL" \
  -v owner_name="$NAME" \
  -v owner_hash="$HASH" \
  -v reset_secret="${FITCORE_PLATFORM_OWNER_RESET_SECRET:-false}" <<'SQL'
BEGIN;

INSERT INTO fitcore_tenants (slug, nome, status)
VALUES ('platform-control', 'FitCore Platform Control', 'ativo')
ON CONFLICT (slug) DO UPDATE SET status='ativo', atualizado_em=now();

WITH tenant AS (
  SELECT id FROM fitcore_tenants WHERE slug='platform-control' LIMIT 1
)
INSERT INTO fitcore_users (
  tenant_id, nome, papel, externo_id, ativo,
  login_identifier, email, credential_kind, credential_hash,
  credential_set_at, credential_revoked_at, atualizado_em
)
SELECT tenant.id, :'owner_name', 'gestor', 'platform-owner-principal', true,
       lower(:'owner_email'), lower(:'owner_email'), 'password', :'owner_hash',
       now(), NULL, now()
FROM tenant
ON CONFLICT (tenant_id, externo_id) DO UPDATE SET
  nome = EXCLUDED.nome,
  papel = 'gestor',
  ativo = true,
  login_identifier = EXCLUDED.login_identifier,
  email = EXCLUDED.email,
  credential_kind = 'password',
  credential_hash = CASE
    WHEN :'reset_secret' = 'true' OR NOT EXISTS (
      SELECT 1 FROM fitcore_platform_admins pa
      WHERE pa.principal_user_id = fitcore_users.id AND pa.active = true
    ) THEN EXCLUDED.credential_hash
    ELSE fitcore_users.credential_hash
  END,
  credential_set_at = CASE
    WHEN :'reset_secret' = 'true' OR fitcore_users.credential_hash IS NULL THEN now()
    ELSE fitcore_users.credential_set_at
  END,
  credential_revoked_at = NULL,
  atualizado_em = now();

WITH principal AS (
  SELECT u.id
  FROM fitcore_users u
  JOIN fitcore_tenants t ON t.id = u.tenant_id
  WHERE t.slug='platform-control'
    AND u.externo_id='platform-owner-principal'
  LIMIT 1
)
INSERT INTO fitcore_platform_admins (principal_user_id, role, active, atualizado_em)
SELECT id, 'platform_owner', true, now()
FROM principal
ON CONFLICT (principal_user_id) DO UPDATE SET
  role='platform_owner', active=true, atualizado_em=now();
INSERT INTO fitcore_platform_admin_audit_events (
  platform_admin_id, actor_user_id, action, detail
)
SELECT pa.id, pa.principal_user_id, 'bootstrap', jsonb_build_object('source','operator')
FROM fitcore_platform_admins pa
JOIN fitcore_users u ON u.id = pa.principal_user_id
WHERE lower(COALESCE(u.email,u.login_identifier)) = lower(:'owner_email')
  AND NOT EXISTS (
    SELECT 1 FROM fitcore_platform_admin_audit_events e
    WHERE e.platform_admin_id = pa.id AND e.action='bootstrap'
  );

COMMIT;
SQL

chmod 600 "$SECRET_FILE" 2>/dev/null || true
echo "OK: platform_owner FitCore preparado para o e-mail informado; segredo não foi persistido pelo script."
