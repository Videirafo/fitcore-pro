#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="${FITCORE_ROOT:-/opt/fitcore-pro}"
MODE="${1:---check}"
ROLLBACK_FILE="${2:-}"
EMAIL="${FITCORE_GESTOR_EMAIL:-}"
TENANT_SLUG="${FITCORE_GESTOR_TENANT_SLUG:-demo}"
EXTERNAL_ID="${FITCORE_GESTOR_EXTERNAL_ID:-mvp20-bootstrap-gestor}"
SECRET_FILE="${FITCORE_BOOTSTRAP_CREDENTIAL_FILE:-$ROOT/storage/secrets/mvp20-bootstrap-credential.txt}"
BACKUP_DIR="${FITCORE_AUTH_BACKUP_DIR:-$ROOT/storage/backups/auth}"

[[ $EUID -eq 0 ]] || { echo "ERRO: execute como root." >&2; exit 1; }
case "$MODE" in
  --check|--apply|--rollback) ;;
  *) echo "Uso: FITCORE_GESTOR_EMAIL=email $0 [--check|--apply|--rollback <backup.sql>]" >&2; exit 2 ;;
esac

if [[ "$MODE" == "--apply" && ! "$EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]; then
  echo "ERRO: FITCORE_GESTOR_EMAIL deve conter um e-mail válido." >&2
  exit 2
fi

resolve_db_url() {
  if [[ -n "${FITCORE_DATABASE_URL:-}" ]]; then printf '%s' "$FITCORE_DATABASE_URL"; return 0; fi
  local pid
  pid="$(systemctl show -p MainPID --value fitcore-api.service 2>/dev/null || true)"
  [[ -n "$pid" && -r "/proc/$pid/environ" ]] || return 1
  tr '\0' '\n' < "/proc/$pid/environ" | sed -n 's/^FITCORE_DATABASE_URL=//p' | head -1
}
DB_URL="$(resolve_db_url)" || { echo "ERRO: FITCORE_DATABASE_URL não disponível." >&2; exit 1; }

query() {
  psql "$DB_URL" -X -A -t -q -v ON_ERROR_STOP=1 \
    -v tenant_slug="$TENANT_SLUG" -v external_id="$EXTERNAL_ID" "$@"
}

sync_secret_identifier() {
  local identifier="$1"
  [[ -f "$SECRET_FILE" ]] || return 0
  python3 - "$SECRET_FILE" "$identifier" <<'PY'
from pathlib import Path
import sys
path=Path(sys.argv[1]); identifier=sys.argv[2]
lines=path.read_text().splitlines(); out=[]; seen=False
for line in lines:
    if line.startswith('FITCORE_LOGIN_IDENTIFIER='):
        out.append(f'FITCORE_LOGIN_IDENTIFIER={identifier}'); seen=True
    else: out.append(line)
if not seen: out.append(f'FITCORE_LOGIN_IDENTIFIER={identifier}')
path.write_text('\n'.join(out)+'\n')
PY
  chmod 600 "$SECRET_FILE"
}

CURRENT="$(query <<'SQL'
SELECT concat_ws('|',u.id::text,u.papel,
 CASE WHEN u.credential_hash IS NULL THEN 'missing' ELSE 'ready' END,
 CASE WHEN u.credential_revoked_at IS NULL THEN 'active' ELSE 'revoked' END,
 md5(coalesce(u.credential_hash,'')),coalesce(u.login_identifier,''))
FROM fitcore_users u JOIN fitcore_tenants t ON t.id=u.tenant_id
WHERE t.slug=:'tenant_slug' AND u.externo_id=:'external_id' AND u.ativo=true LIMIT 1;
SQL
)"
[[ -n "$CURRENT" ]] || { echo "ERRO: gestor bootstrap não encontrado." >&2; exit 1; }
IFS='|' read -r USER_ID USER_ROLE CRED_STATE REVOCATION_STATE BEFORE_HASH CURRENT_LOGIN <<< "$CURRENT"
[[ "$USER_ROLE" == "gestor" ]] || { echo "ERRO: usuário alvo não é gestor." >&2; exit 1; }
[[ "$CRED_STATE" == "ready" && "$REVOCATION_STATE" == "active" ]] || {
  echo "ERRO: credencial atual não pode ser preservada." >&2; exit 1;
}

if [[ "$MODE" == "--check" ]]; then
  TARGET_MATCH=false
  [[ -n "$EMAIL" && "${CURRENT_LOGIN,,}" == "${EMAIL,,}" ]] && TARGET_MATCH=true
  printf 'user_found=true role=gestor credential_ready=true identifier_is_target=%s\n' "$TARGET_MATCH"
  exit 0
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

if [[ "$MODE" == "--rollback" ]]; then
  [[ -n "$ROLLBACK_FILE" && -f "$ROLLBACK_FILE" ]] || { echo "ERRO: backup SQL obrigatório." >&2; exit 2; }
  BACKUP_REAL="$(realpath "$ROLLBACK_FILE")"
  DIR_REAL="$(realpath "$BACKUP_DIR")"
  [[ "$BACKUP_REAL" == "$DIR_REAL"/gestor-login-*.sql ]] || { echo "ERRO: backup fora do diretório autorizado." >&2; exit 2; }
  psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f "$BACKUP_REAL"
  RESTORED_LOGIN="$(query -v user_id="$USER_ID" -c "SELECT coalesce(login_identifier,'') FROM fitcore_users WHERE id=:'user_id'::uuid;")"
  sync_secret_identifier "$RESTORED_LOGIN"
  echo "rollback=PASS"
  exit 0
fi

CONFLICTS="$(query -v email="$EMAIL" -v user_id="$USER_ID" <<'SQL'
SELECT count(*) FROM fitcore_users
WHERE id<>:'user_id'::uuid AND ativo=true
AND (lower(coalesce(login_identifier,''))=lower(:'email') OR lower(coalesce(email,''))=lower(:'email'));
SQL
)"
[[ "$CONFLICTS" == "0" ]] || { echo "ERRO: e-mail alvo já pertence a outro usuário ativo." >&2; exit 1; }
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_FILE="$BACKUP_DIR/gestor-login-$STAMP.sql"
query -v user_id="$USER_ID" <<'SQL' >"$BACKUP_FILE"
SELECT format($fmt$
BEGIN;
UPDATE fitcore_users SET login_identifier=%s, atualizado_em=now() WHERE id=%L::uuid;
INSERT INTO fitcore_audit_events (tenant_id,actor_id,actor_role,recurso_tipo,recurso_id,acao,status,detalhe)
SELECT tenant_id,id,'gestor','auth',id,'gestor_login_identifier_rollback','ok','Rollback administrativo do identificador de login.'
FROM fitcore_users WHERE id=%L::uuid;
COMMIT;
$fmt$,
 CASE WHEN login_identifier IS NULL OR login_identifier='' THEN 'NULL' ELSE quote_literal(login_identifier) END,
 id::text,id::text)
FROM fitcore_users WHERE id=:'user_id'::uuid;
SQL
chmod 600 "$BACKUP_FILE"

query -v email="$EMAIL" -v user_id="$USER_ID" <<'SQL' >/dev/null
BEGIN;
UPDATE fitcore_users SET login_identifier=lower(:'email'), atualizado_em=now()
WHERE id=:'user_id'::uuid AND papel='gestor' AND ativo=true;
INSERT INTO fitcore_audit_events (tenant_id,actor_id,actor_role,recurso_tipo,recurso_id,acao,status,detalhe)
SELECT tenant_id,id,'gestor','auth',id,'gestor_login_identifier_updated','ok',
 'Identificador de login do gestor atualizado por operação administrativa.'
FROM fitcore_users WHERE id=:'user_id'::uuid;
COMMIT;
SQL

AFTER="$(query -v user_id="$USER_ID" -v email="$EMAIL" -c "SELECT concat_ws('|',lower(login_identifier)=lower(:'email'),md5(coalesce(credential_hash,''))) FROM fitcore_users WHERE id=:'user_id'::uuid;")"
IFS='|' read -r IDENTIFIER_OK AFTER_HASH <<< "$AFTER"
[[ "$IDENTIFIER_OK" == "t" && "$AFTER_HASH" == "$BEFORE_HASH" ]] || {
  echo "ERRO: verificação pós-update falhou; use o backup gerado." >&2
  exit 1
}
sync_secret_identifier "$EMAIL"
printf 'apply=PASS credential_hash_preserved=true rollback_file=%s\n' "$BACKUP_FILE"
