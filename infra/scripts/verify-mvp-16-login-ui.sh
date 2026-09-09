#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_BASE="${FITCORE_PUBLIC_API_BASE:-https://fitcore.marcaia.app}"
COOKIE_JAR="/tmp/fitcore-mvp16-cookies.txt"

cd "$ROOT"

echo "MVP-16 — verificando Login UI integrado"

node --check apps/site-static/mvp-16-auth-ui.js
node --check apps/site-static/mvp-16.js
node --check apps/site-static/mvp-01.js
node --check apps/site-static/mvp-02.js
node --check apps/site-static/mvp-03.js
node --check apps/site-static/mvp-13.js

echo "OK: sintaxe JS validada."

for page in mvp-01.html mvp-02.html mvp-03.html mvp-13.html; do
  grep -q 'mvp-16-auth-ui.css' "apps/site-static/$page"
  grep -q 'mvp-16-auth-ui.js' "apps/site-static/$page"
  grep -q 'data-fitcore-auth-required="true"' "apps/site-static/$page"
  echo "OK: $page integrado ao login compartilhado."
done

rm -f "$COOKIE_JAR"

STATUS="$(curl -s -o /tmp/fitcore-mvp16-no-session.json -w '%{http_code}' "$API_BASE/api/mvp-03/professor/contexto")"
if [[ "$STATUS" != "401" ]]; then
  echo "ERRO: rota protegida sem sessão deveria retornar 401; retornou $STATUS" >&2
  cat /tmp/fitcore-mvp16-no-session.json >&2 || true
  exit 1
fi

echo "OK: rota protegida exige sessão."

curl -fsS -c "$COOKIE_JAR" \
  -H 'content-type: application/json' \
  -X POST \
  --data '{"role":"professor","actor_name":"Professor MVP-16"}' \
  "$API_BASE/api/mvp-15/session/login" >/tmp/fitcore-mvp16-login.json

grep -q '"role_from_db"' /tmp/fitcore-mvp16-login.json

echo "OK: login criou sessão assinada."

curl -fsS -b "$COOKIE_JAR" "$API_BASE/api/mvp-15/session" >/tmp/fitcore-mvp16-session.json
grep -q '"current_session"' /tmp/fitcore-mvp16-session.json
grep -q '"headers_trusted": false' /tmp/fitcore-mvp16-session.json

echo "OK: sessão detectada e headers não são fonte final."

curl -fsS -b "$COOKIE_JAR" "$API_BASE/api/mvp-03/professor/contexto" >/tmp/fitcore-mvp16-context.json
python3 -m json.tool /tmp/fitcore-mvp16-context.json >/dev/null

echo "OK: tela operacional consegue ler rota protegida com cookie."

for page in mvp-01.html mvp-02.html mvp-03.html mvp-13.html mvp-16.html; do
  if ! curl -fsSI "$API_BASE/$page" | grep -q "HTTP/2 200\|HTTP/1.1 200"; then
    echo "ERRO: $page não respondeu 200." >&2
    exit 1
  fi
  echo "OK: /$page publicado."
done

curl -fsS -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
  -H 'content-type: application/json' \
  -X POST --data '{}' "$API_BASE/api/mvp-15/session/logout" >/tmp/fitcore-mvp16-logout.json

echo "OK: logout executado."

echo "MVP-16 verificado: Login UI integrado às telas operacionais com sessão assinada."
