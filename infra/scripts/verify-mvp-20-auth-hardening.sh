#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
BASE="${FITCORE_PUBLIC_URL:-https://fitcore.marcaia.app}"
source "$ROOT/infra/scripts/lib/require-safe-test-target.sh"
fitcore_require_safe_test_target "$BASE"
SECRET_FILE="storage/secrets/mvp20-bootstrap-credential.txt"
JAR="/tmp/fitcore-mvp20.cookie"
rm -f "$JAR"

echo "MVP-20 — verificando hardening de autenticação"
node --check services/api/security/auth-hardening.mjs
node --check services/api/security/credential-auth.mjs
node --check services/api/security/signed-session.mjs
node --check services/api/server.mjs
node --check apps/site-static/script.js
node --check apps/site-static/mvp-16-auth-ui.js
node --check apps/site-static/mvp-20.js
echo "OK: sintaxe validada."

curl -fsS "$BASE/api/mvp-20/security/status" | grep -q '"enabled": true'
curl -fsS "$BASE/api/mvp-20/security/status" | grep -q '"demo_login_enabled": false'
echo "OK: hardening ativo e login demo bloqueado."

HTTP_DEMO=$(curl -s -o /tmp/mvp20-demo-login.json -w "%{http_code}" -H 'content-type: application/json' -d '{"role":"gestor","actor_name":"Demo bloqueado"}' "$BASE/api/mvp-15/session/login")
[ "$HTTP_DEMO" = "403" ] || { echo "ERRO: login demo deveria retornar 403, retornou $HTTP_DEMO"; cat /tmp/mvp20-demo-login.json; exit 1; }
echo "OK: /api/mvp-15/session/login bloqueia demo em produção."

[ -f "$SECRET_FILE" ] || { echo "ERRO: credencial bootstrap ausente em $SECRET_FILE"; exit 1; }
# shellcheck disable=SC1090
set -a
source "$SECRET_FILE"
set +a
python3 - <<'PYJSON'
import json, os
open('/tmp/mvp20-real-login-body.json','w').write(json.dumps({
    'login_identifier': os.environ['FITCORE_LOGIN_IDENTIFIER'],
    'secret': os.environ['FITCORE_LOGIN_SECRET'],
}))
PYJSON
HTTP_REAL=$(curl -s -o /tmp/mvp20-real-login.json -w "%{http_code}" -c "$JAR" -H "x-fitcore-rate-test: mvp20-real-login" -H 'content-type: application/json' --data-binary @/tmp/mvp20-real-login-body.json "$BASE/api/mvp-19/login")
[ "$HTTP_REAL" = "201" ] || { echo "ERRO: login real retornou $HTTP_REAL"; python3 - <<'PYERR'
import json
try:
    d=json.load(open('/tmp/mvp20-real-login.json'))
    print({k:d.get(k) for k in ('erro','mensagem','mvp')})
except Exception:
    print(open('/tmp/mvp20-real-login.json').read()[:400])
PYERR
exit 1; }
curl -fsS -b "$JAR" "$BASE/api/mvp-15/session" | grep -q '"actor_role": "gestor"'
curl -fsS -b "$JAR" "$BASE/api/mvp-15/session" | grep -q '"headers_trusted": false'
curl -fsS -b "$JAR" "$BASE/api/mvp-17/navigation" | grep -q '/mvp-01.html'
curl -fsS -b "$JAR" "$BASE/api/mvp-01/aluno-treino?limit=1" | grep -q '"items"'
curl -fsS -b "$JAR" "$BASE/api/mvp-03/professor/contexto" | grep -q '"resumo"'
echo "OK: entrada real por credencial funciona, menu e rotas operacionais abrem com sessão."

TEST_KEY="mvp20-$(date +%s)-$RANDOM"
HTTP_RATE="000"
for n in 1 2 3 4 5 6 7; do
  HTTP_RATE=$(curl -s -o /tmp/mvp20-rate.json -w "%{http_code}" -H "x-fitcore-rate-test: $TEST_KEY" -H 'content-type: application/json' -d '{"login_identifier":"nobody","secret":"errado"}' "$BASE/api/mvp-19/login")
  [ "$HTTP_RATE" = "429" ] && break
  sleep 0.1
done
[ "$HTTP_RATE" = "429" ] || { echo "ERRO: rate limit não retornou 429. Último HTTP=$HTTP_RATE"; cat /tmp/mvp20-rate.json; exit 1; }
echo "OK: rate limit por hash bloqueou excesso de tentativas."

curl -fsS -b "$JAR" "$BASE/api/mvp-20/security/logs" | grep -q 'rate_limit_blocked'
echo "OK: logs de segurança por tenant disponíveis para gestor."

curl -fsS -b "$JAR" -H 'content-type: application/json' -d '{}' "$BASE/api/mvp-20/security/cleanup-sessions" | grep -q '"cleanup": true'
echo "OK: limpeza/revogação de sessões expiradas disponível."

curl -fsSL "$BASE/" | grep -q '/mvp-19.html'
echo "OK: home direciona para login real."

curl -fsSI "$BASE/mvp-20.html" | grep -q 'HTTP/2 200'
echo "OK: /mvp-20.html publicado."

echo "MVP-20 verificado: demo bloqueado, login real, rate limit, política, sessões e logs por tenant ativos."
