#!/usr/bin/env bash
set -euo pipefail

cd "${FITCORE_ROOT:-/opt/fitcore-pro}"
MODE="${1:---check}"
EMAIL="${FITCORE_GESTOR_EMAIL:-}"
TENANT_SLUG="${FITCORE_GESTOR_TENANT_SLUG:-demo}"
EXTERNAL_ID="${FITCORE_GESTOR_EXTERNAL_ID:-mvp20-bootstrap-gestor}"
SECRET_FILE="${FITCORE_BOOTSTRAP_CREDENTIAL_FILE:-storage/secrets/mvp20-bootstrap-credential.txt}"

if [[ "$MODE" != "--check" && "$MODE" != "--apply" ]]; then
  echo "Uso: FITCORE_GESTOR_EMAIL=email ./infra/scripts/set-gestor-login-email.sh [--check|--apply]" >&2
  exit 2
fi

if [[ "$MODE" == "--apply" && ! "$EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]; then
  echo "ERRO: FITCORE_GESTOR_EMAIL deve conter um e-mail válido." >&2
  exit 2
fi

resolve_db_url() {
  if [[ -n "${FITCORE_DATABASE_URL:-}" ]]; then printf '%s' "$FITCORE_DATABASE_URL"; return 0; fi
  local pid
  pid="$(systemctl show -p MainPID --value fitcore-api.service 2>/dev/null || true)"
  if [[ -n "$pid" && -r "/proc/$pid/environ" ]]; then
    tr '\0' '\n' < "/proc/$pid/environ" | sed -n 's/^FITCORE_DATABASE_URL=//p' | head -1
    return 0
  fi
  return 1
}

DB_URL="$(resolve_db_url)" || {
  echo "ERRO: FITCORE_DATABASE_URL não disponível." >&2
  exit 1
}

query() {
  psql "$DB_URL" -X -A -t -q -v ON_ERROR_STOP=1 -v tenant_slug="$TENANT_SLUG" -v external_id="$EXTERNAL_ID" "$@"
}

CURRENT="$(query <<'SQL'
SELECT concat_ws('|', t.slug, u.id::text, u.nome, u.papel,
  coalesce(u.login_identifier,''),
  CASE WHEN u.credential_hash IS NULL THEN 'credential_missing' ELSE 'credential_ready' END,
  CASE WHEN u.credential_revoked_at IS NULL THEN 'active_credential' ELSE 'revoked_credential' END)
FROM fitcore_users u
JOIN fitcore_tenants t ON t.id=u.tenant_id
WHERE t.slug=:'tenant_slug' AND u.externo_id=:'external_id' AND u.ativo=true
LIMIT 1;
SQL
)"
if [[ -z "$CURRENT" ]]; then
  echo "ERRO: gestor bootstrap não encontrado no tenant informado." >&2
  exit 1
fi

IFS='|' read -r CURRENT_TENANT USER_ID USER_NAME USER_ROLE CURRENT_LOGIN CREDENTIAL_STATE REVOCATION_STATE <<< "$CURRENT"
printf 'tenant=%s user=%s role=%s login=%s %s %s\n' \
  "$CURRENT_TENANT" "$USER_NAME" "$USER_ROLE" "${CURRENT_LOGIN:-<empty>}" "$CREDENTIAL_STATE" "$REVOCATION_STATE"

if [[ "$USER_ROLE" != "gestor" ]]; then
  echo "ERRO: usuário alvo não possui papel gestor." >&2
  exit 1
fi
if [[ "$CREDENTIAL_STATE" != "credential_ready" || "$REVOCATION_STATE" != "active_credential" ]]; then
  echo "ERRO: credencial atual não está pronta para ser preservada." >&2
  exit 1
fi

if [[ "$MODE" == "--check" ]]; then
  exit 0
fi

query -v email="$EMAIL" -v user_id="$USER_ID" <<'SQL' >/dev/null
BEGIN;
UPDATE fitcore_users
SET login_identifier=lower(:'email'), atualizado_em=now()
WHERE id=:'user_id'::uuid AND papel='gestor' AND ativo=true;
INSERT INTO fitcore_audit_events (
  tenant_id, actor_id, actor_role, recurso_tipo, recurso_id, acao, status, detalhe
)
SELECT u.tenant_id, u.id, 'gestor', 'auth', u.id,
  'gestor_login_identifier_updated', 'ok',
  'Identificador de login do gestor atualizado por operação administrativa.'
FROM fitcore_users u WHERE u.id=:'user_id'::uuid;
COMMIT;
SQL

if [[ -f "$SECRET_FILE" ]]; then
  python3 - "$SECRET_FILE" "$EMAIL" <<'PY'
from pathlib import Path
import sys
path=Path(sys.argv[1])
email=sys.argv[2]
lines=path.read_text().splitlines()
out=[]
seen=False
for line in lines:
    if line.startswith('FITCORE_LOGIN_IDENTIFIER='):
        out.append(f'FITCORE_LOGIN_IDENTIFIER={email}')
        seen=True
    else:
        out.append(line)
if not seen:
    out.append(f'FITCORE_LOGIN_IDENTIFIER={email}')
path.write_text('\n'.join(out)+'\n')
PY
  chmod 600 "$SECRET_FILE"
fi

echo "OK: identificador do gestor atualizado; hash existente preservado."
