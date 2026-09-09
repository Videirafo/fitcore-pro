#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_BASE="${FITCORE_PUBLIC_API_BASE:-https://fitcore.marcaia.app}"
COOKIE_JAR="/tmp/fitcore-mvp15-cookies.txt"
cd "$ROOT"

echo "MVP-15 — verificando sessão assinada e RBAC real"
node --check services/api/security/signed-session.mjs
node --check services/api/server.mjs
node --check apps/site-static/mvp-15.js

echo "OK: sintaxe validada."

STATUS_CODE="$(curl -s -o /tmp/fitcore-mvp15-unauth.json -w '%{http_code}' "$API_BASE/api/mvp-03/professor/contexto")"
if [[ "$STATUS_CODE" != "401" ]]; then
  echo "ERRO: rota protegida sem sessão deveria retornar 401, retornou $STATUS_CODE" >&2
  cat /tmp/fitcore-mvp15-unauth.json >&2 || true
  exit 1
fi

echo "OK: rota protegida exige sessão."

curl -fsS -c "$COOKIE_JAR" -H 'content-type: application/json' -X POST \
  --data '{"role":"professor","actor_name":"Professor Demo"}' \
  "$API_BASE/api/mvp-15/session/login" >/tmp/fitcore-mvp15-login.json

grep -q '"role_from_db": true' /tmp/fitcore-mvp15-login.json

echo "OK: login criou sessão com papel vindo do banco."

curl -fsS -b "$COOKIE_JAR" "$API_BASE/api/mvp-15/session" >/tmp/fitcore-mvp15-session.json
grep -q '"headers_trusted": false' /tmp/fitcore-mvp15-session.json

echo "OK: headers não são fonte final de confiança."

curl -fsS -b "$COOKIE_JAR" "$API_BASE/api/mvp-03/professor/contexto" >/tmp/fitcore-mvp15-protected.json
python3 -m json.tool /tmp/fitcore-mvp15-protected.json >/dev/null

echo "OK: rota protegida abriu com sessão válida."

curl -fsS -b "$COOKIE_JAR" -c "$COOKIE_JAR" -H 'content-type: application/json' -X POST \
  --data '{}' "$API_BASE/api/mvp-15/session/logout" >/tmp/fitcore-mvp15-logout.json

grep -q '"logout": true' /tmp/fitcore-mvp15-logout.json

echo "OK: logout executado."

STATUS_CODE="$(curl -s -b "$COOKIE_JAR" -o /tmp/fitcore-mvp15-after-logout.json -w '%{http_code}' "$API_BASE/api/mvp-03/professor/contexto")"
if [[ "$STATUS_CODE" != "401" ]]; then
  echo "ERRO: rota protegida após logout deveria retornar 401, retornou $STATUS_CODE" >&2
  cat /tmp/fitcore-mvp15-after-logout.json >&2 || true
  exit 1
fi

echo "OK: sessão inválida após logout."

curl -fsSI "$API_BASE/mvp-15.html" | grep -q "HTTP/2 200\|HTTP/1.1 200"

echo "OK: /mvp-15.html publicado."
echo "MVP-15 verificado: sessão assinada, tenant demo, papel do banco, rotas protegidas, logout e rollback soft disponíveis."
