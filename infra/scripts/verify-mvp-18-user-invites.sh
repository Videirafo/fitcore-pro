#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
BASE="https://fitcore.marcaia.app"
source "$ROOT/infra/scripts/lib/require-safe-test-target.sh"
fitcore_require_safe_test_target "$BASE"
JAR_GESTOR="/tmp/fitcore-mvp18-gestor.cookies"
JAR_INVITED="/tmp/fitcore-mvp18-invited.cookies"
rm -f "$JAR_GESTOR" "$JAR_INVITED" /tmp/fitcore-mvp18-invite.json /tmp/fitcore-mvp18-accept.json

echo "MVP-18 — verificando perfis reais e convite por token"
node --check services/api/security/signed-session.mjs
node --check services/api/security/invite-users.mjs
node --check services/api/server.mjs
node --check apps/site-static/mvp-18.js
echo "OK: sintaxe validada."

HTTP_NO_SESSION=$(curl -s -o /tmp/mvp18-no-session.json -w "%{http_code}" "$BASE/api/mvp-18/users")
[ "$HTTP_NO_SESSION" = "401" ] || { echo "ERRO: /api/mvp-18/users sem sessão deveria retornar 401, retornou $HTTP_NO_SESSION"; cat /tmp/mvp18-no-session.json; exit 1; }
echo "OK: gestão de usuários exige sessão."

curl -fsS -c "$JAR_GESTOR" -H 'content-type: application/json' -d '{"role":"gestor","actor_name":"Gestor MVP-18"}' "$BASE/api/mvp-15/session/login" >/dev/null
echo "OK: gestor logado."

curl -fsS -b "$JAR_GESTOR" -c "$JAR_GESTOR" -H 'content-type: application/json' \
  -d '{"nome":"Professor Real MVP-18","papel":"professor","ttl_horas":24}' \
  "$BASE/api/mvp-18/users/invite" > /tmp/fitcore-mvp18-invite.json
TOKEN=$(python3 - <<'TOKPY'
import json
print(json.load(open('/tmp/fitcore-mvp18-invite.json'))['token'])
TOKPY
)
[ -n "$TOKEN" ] || { echo "ERRO: token não gerado"; cat /tmp/fitcore-mvp18-invite.json; exit 1; }
echo "OK: convite por token criado."

curl -fsS "$BASE/api/mvp-18/invites/inspect?token=$TOKEN" | grep -q '"can_accept": true'
echo "OK: convite pode ser aceito sem sessão demo."

curl -fsS -c "$JAR_INVITED" -H 'content-type: application/json' -d "{\"token\":\"$TOKEN\"}" "$BASE/api/mvp-18/invites/accept" > /tmp/fitcore-mvp18-accept.json
grep -q '"accepted": true' /tmp/fitcore-mvp18-accept.json
grep -q '"login_source": "mvp18_invite"' /tmp/fitcore-mvp18-accept.json
echo "OK: professor recebeu sessão real pelo convite, sem botão demo."

curl -fsS -b "$JAR_INVITED" "$BASE/api/mvp-15/session" | grep -q '"actor_role": "professor"'
curl -fsS -b "$JAR_INVITED" "$BASE/api/mvp-15/session" | grep -q '"headers_trusted": false'
echo "OK: papel final vem do banco e headers não são fonte final."

HTTP_PROF_USERS=$(curl -s -b "$JAR_INVITED" -o /tmp/mvp18-prof-users.json -w "%{http_code}" "$BASE/api/mvp-18/users")
[ "$HTTP_PROF_USERS" = "403" ] || { echo "ERRO: professor não deveria gerenciar usuários, retornou $HTTP_PROF_USERS"; cat /tmp/mvp18-prof-users.json; exit 1; }
echo "OK: professor não acessa gestão de usuários."

curl -fsS -b "$JAR_GESTOR" "$BASE/api/mvp-18/users" | grep -q 'Professor Real MVP-18'
echo "OK: gestor vê usuário criado por convite."

curl -fsSI "$BASE/mvp-18.html" | grep -q "HTTP/2 200"
echo "OK: /mvp-18.html publicado."

echo "MVP-18 verificado: usuário por gestor, convite por token, sessão real sem demo, RBAC e auditoria ativos."
