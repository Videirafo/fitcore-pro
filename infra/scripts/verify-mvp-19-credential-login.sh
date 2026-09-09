#!/usr/bin/env bash
set -euo pipefail
cd /opt/fitcore-pro
BASE="${FITCORE_PUBLIC_URL:-https://fitcore.marcaia.app}"
JAR_GESTOR=/tmp/fitcore-mvp19-gestor.cookie
JAR_INVITED=/tmp/fitcore-mvp19-invited.cookie
JAR_CRED=/tmp/fitcore-mvp19-credential.cookie
JAR_REC=/tmp/fitcore-mvp19-recovery.cookie
rm -f "$JAR_GESTOR" "$JAR_INVITED" "$JAR_CRED" "$JAR_REC"

echo "MVP-19 — verificando login por credencial mínima"
node --check services/api/security/credential-auth.mjs
node --check services/api/security/signed-session.mjs
node --check services/api/server.mjs
node --check apps/site-static/mvp-19.js
echo "OK: sintaxe validada."

curl -fsS "$BASE/api/mvp-19/status" | grep -q '"enabled": true'
echo "OK: MVP-19 ativo."

HTTP_ME=$(curl -s -o /tmp/mvp19-no-session.json -w "%{http_code}" "$BASE/api/mvp-19/credentials/me")
[ "$HTTP_ME" = "401" ] || { echo "ERRO: credentials/me sem sessão deveria retornar 401, retornou $HTTP_ME"; cat /tmp/mvp19-no-session.json; exit 1; }
echo "OK: credencial exige sessão para configuração."

curl -fsS -c "$JAR_GESTOR" -H 'content-type: application/json' -d '{"role":"gestor","actor_name":"Gestor MVP-19"}' "$BASE/api/mvp-15/session/login" > /tmp/mvp19-gestor.json
curl -fsS -b "$JAR_GESTOR" -H 'content-type: application/json' -d '{"nome":"Professor Credencial MVP-19","papel":"professor","ttl_horas":24}' "$BASE/api/mvp-18/users/invite" > /tmp/mvp19-invite.json
TOKEN=$(python3 -c "import json;print(json.load(open('/tmp/mvp19-invite.json'))['token'])")
[ -n "$TOKEN" ] || { echo "ERRO: token de convite vazio"; exit 1; }
echo "OK: gestor criou convite."

curl -fsS -c "$JAR_INVITED" -H 'content-type: application/json' -d "{\"token\":\"$TOKEN\"}" "$BASE/api/mvp-18/invites/accept" > /tmp/mvp19-accept.json
curl -fsS -b "$JAR_INVITED" "$BASE/api/mvp-15/session" | grep -q '"login_source": "mvp18_invite"'
echo "OK: usuário aceitou convite sem login demo."

LOGIN_ID="prof-mvp19-$(date +%s)-$RANDOM"
SECRET="FitCore#MVP19-$RANDOM"
NEW_SECRET="FitCore#MVP19-Reset-$RANDOM"
printf '%s' "$LOGIN_ID" > /tmp/mvp19-login-id.txt
printf '%s' "$SECRET" > /tmp/mvp19-secret.txt

curl -fsS -b "$JAR_INVITED" -H 'content-type: application/json' \
  -d "{\"login_identifier\":\"$LOGIN_ID\",\"credential_kind\":\"password\",\"secret\":\"$SECRET\"}" \
  "$BASE/api/mvp-19/credentials/set" > /tmp/mvp19-set.json
curl -fsS -b "$JAR_INVITED" "$BASE/api/mvp-19/credentials/me" | grep -q '"credential_set": true'
echo "OK: usuário definiu senha/código de acesso."

curl -fsS -b "$JAR_INVITED" -H 'content-type: application/json' -d '{}' "$BASE/api/mvp-15/session/logout" >/tmp/mvp19-logout-invited.json
curl -fsS -c "$JAR_CRED" -H 'content-type: application/json' \
  -d "{\"login_identifier\":\"$LOGIN_ID\",\"secret\":\"$SECRET\"}" \
  "$BASE/api/mvp-19/login" > /tmp/mvp19-login.json
curl -fsS -b "$JAR_CRED" "$BASE/api/mvp-15/session" | grep -q '"login_source": "mvp19_credential"'
echo "OK: login por credencial criou sessão real sem botão demo."

curl -fsS -b "$JAR_CRED" -H 'x-fitcore-role: gestor' "$BASE/api/mvp-15/session" | grep -q '"headers_trusted": false'
curl -fsS -b "$JAR_CRED" -H 'x-fitcore-role: gestor' "$BASE/api/mvp-15/session" | grep -q '"actor_role": "professor"'
echo "OK: papel final vem do banco; headers não são fonte final."

curl -fsS -H 'content-type: application/json' -d "{\"login_identifier\":\"$LOGIN_ID\"}" "$BASE/api/mvp-19/recovery/request" > /tmp/mvp19-recovery-request.json
RECOVERY_TOKEN=$(python3 -c "import json;print(json.load(open('/tmp/mvp19-recovery-request.json')).get('token',''))")
[ -n "$RECOVERY_TOKEN" ] || { echo "ERRO: token de recuperação vazio"; cat /tmp/mvp19-recovery-request.json; exit 1; }
echo "OK: recuperação controlada gerou token."

curl -fsS -c "$JAR_REC" -H 'content-type: application/json' \
  -d "{\"token\":\"$RECOVERY_TOKEN\",\"new_secret\":\"$NEW_SECRET\"}" \
  "$BASE/api/mvp-19/recovery/complete" > /tmp/mvp19-recovery-complete.json
curl -fsS -b "$JAR_REC" "$BASE/api/mvp-15/session" | grep -q '"login_source": "mvp19_recovery"'
echo "OK: recuperação redefiniu credencial e criou sessão."

HTTP_OLD=$(curl -s -o /tmp/mvp19-old-login.json -w "%{http_code}" -H 'content-type: application/json' \
  -d "{\"login_identifier\":\"$LOGIN_ID\",\"secret\":\"$SECRET\"}" "$BASE/api/mvp-19/login")
[ "$HTTP_OLD" = "401" ] || { echo "ERRO: senha antiga deveria falhar após recuperação, retornou $HTTP_OLD"; cat /tmp/mvp19-old-login.json; exit 1; }
echo "OK: senha antiga invalidada após recuperação."

curl -fsS -b "$JAR_REC" -H 'content-type: application/json' -d '{}' "$BASE/api/mvp-19/credentials/revoke" > /tmp/mvp19-revoke.json
HTTP_REVOKED=$(curl -s -o /tmp/mvp19-revoked-login.json -w "%{http_code}" -H 'content-type: application/json' \
  -d "{\"login_identifier\":\"$LOGIN_ID\",\"secret\":\"$NEW_SECRET\"}" "$BASE/api/mvp-19/login")
[ "$HTTP_REVOKED" = "401" ] || { echo "ERRO: credencial revogada deveria falhar, retornou $HTTP_REVOKED"; cat /tmp/mvp19-revoked-login.json; exit 1; }
echo "OK: revogação controlada bloqueou login."

DB_URL=$(systemctl cat fitcore-api 2>/dev/null | grep -o 'FITCORE_DATABASE_URL=[^" ]*' | tail -1 | cut -d= -f2-)
if [ -n "$DB_URL" ]; then
  AUDIT_COUNT=$(psql "$DB_URL" -X -A -t -q -c "WITH tenant AS (SELECT id FROM fitcore_tenants WHERE slug='demo'), scope AS (SELECT set_config('app.tenant_id',(SELECT id::text FROM tenant),true)) SELECT count(*) FROM fitcore_audit_events, scope WHERE recurso_tipo='auth' AND acao IN ('credential_set','credential_login_ok','recovery_requested','recovery_completed','credential_revoked') AND criado_em > now() - interval '1 hour';")
  [ "${AUDIT_COUNT:-0}" -ge 5 ] || { echo "ERRO: auditoria de autenticação insuficiente: $AUDIT_COUNT"; exit 1; }
  echo "OK: auditoria de autenticação persistida no PostgreSQL ($AUDIT_COUNT eventos recentes)."
fi

curl -fsSI "$BASE/mvp-19.html" | grep -q "HTTP/2 200"
echo "OK: /mvp-19.html publicado."
echo "MVP-19 verificado: credencial mínima, recuperação, revogação, sessão real, RBAC e auditoria ativos."
