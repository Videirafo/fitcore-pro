#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_BASE="${FITCORE_PUBLIC_API_BASE:-https://fitcore.marcaia.app}"
SECRETS_FILE="$ROOT/storage/secrets/fitcore-postgres.env"
cd "$ROOT"

echo "MVP-17 — verificando navegação por papel"

node --check apps/site-static/mvp-17-nav-rbac.js
node --check apps/site-static/mvp-17.js
node --check services/api/security/navigation-rbac.mjs
node --check services/api/security/signed-session.mjs
node --check services/api/server.mjs

echo "OK: sintaxe validada."

for page in mvp-01.html mvp-02.html mvp-03.html mvp-13.html; do
  grep -q "mvp-17-nav-rbac.js" "apps/site-static/$page"
  grep -q "mvp-17-nav-rbac.css" "apps/site-static/$page"
  echo "OK: $page integrado ao menu por papel."
done

HTTP_NO_SESSION="$(curl -s -o /tmp/fitcore-mvp17-no-session.json -w '%{http_code}' "$API_BASE/api/mvp-17/navigation")"
if [[ "$HTTP_NO_SESSION" != "401" ]]; then
  echo "ERRO: navegação sem sessão deveria retornar 401; retornou $HTTP_NO_SESSION" >&2
  cat /tmp/fitcore-mvp17-no-session.json >&2 || true
  exit 1
fi

echo "OK: rota de navegação exige sessão."

assert_nav() {
  local role="$1"
  local jar="/tmp/fitcore-mvp17-${role}.cookies"
  rm -f "$jar"
  curl -fsS -c "$jar" -H 'content-type: application/json' -X POST --data "{\"role\":\"$role\",\"actor_name\":\"$role MVP-17\"}" "$API_BASE/api/mvp-15/session/login" >/tmp/fitcore-mvp17-login.json
  curl -fsS -b "$jar" "$API_BASE/api/mvp-17/navigation" >/tmp/fitcore-mvp17-${role}.json
  python3 - "$role" "/tmp/fitcore-mvp17-${role}.json" <<'ASSERTPY'
import json, sys
role, path = sys.argv[1], sys.argv[2]
data = json.load(open(path, encoding='utf-8'))
hrefs = {item.get('href') for item in data.get('items', [])}
if data.get('actor_role') != role:
    raise SystemExit(f"ERRO: papel esperado {role}, recebido {data.get('actor_role')}")
if not data.get('role_from_db') or data.get('headers_trusted') is not False:
    raise SystemExit('ERRO: navegação não está usando papel do banco com headers não confiáveis')
if role == 'aluno':
    blocked = {'/mvp-03.html', '/mvp-13.html', '/mvp-11.html', '/mvp-15.html', '/mvp-17.html'}
    if hrefs & blocked:
        raise SystemExit(f"ERRO: aluno recebeu itens proibidos: {sorted(hrefs & blocked)}")
    if '/mvp-04.html' not in hrefs or '/mvp-02.html' not in hrefs:
        raise SystemExit('ERRO: aluno não recebeu menu mínimo de aluno')
elif role == 'professor':
    blocked = {'/mvp-11.html', '/mvp-12.html', '/mvp-15.html', '/mvp-16.html', '/mvp-17.html'}
    if hrefs & blocked:
        raise SystemExit(f"ERRO: professor recebeu admin indevido: {sorted(hrefs & blocked)}")
    for required in ['/mvp-01.html', '/mvp-02.html', '/mvp-03.html']:
        if required not in hrefs:
            raise SystemExit(f'ERRO: professor sem menu esperado {required}')
elif role == 'gestor':
    for required in ['/mvp-01.html', '/mvp-02.html', '/mvp-03.html', '/mvp-13.html', '/mvp-17.html']:
        if required not in hrefs:
            raise SystemExit(f'ERRO: gestor sem operação completa: {required}')
print(f"OK: menu do papel {role} validado.")
ASSERTPY
  if [[ "$role" == "aluno" ]]; then
    HTTP_PROF="$(curl -s -o /tmp/fitcore-mvp17-aluno-professor.json -w '%{http_code}' -b "$jar" "$API_BASE/api/mvp-03/professor/contexto")"
    if [[ "$HTTP_PROF" != "403" ]]; then
      echo "ERRO: aluno deveria receber 403 no painel professor; recebeu $HTTP_PROF" >&2
      cat /tmp/fitcore-mvp17-aluno-professor.json >&2 || true
      exit 1
    fi
    echo "OK: aluno não acessa painel do professor."
  fi
  curl -fsS -b "$jar" -H 'content-type: application/json' -X POST --data '{}' "$API_BASE/api/mvp-15/session/logout" >/dev/null
}

assert_nav gestor
assert_nav professor
assert_nav aluno

if [[ -f "$SECRETS_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "$SECRETS_FILE"
  set +a
  DB_URL="${FITCORE_DATABASE_URL:-${DATABASE_URL:-}}"
  if [[ -z "$DB_URL" && -n "${POSTGRES_USER:-}" && -n "${POSTGRES_PASSWORD:-}" && -n "${POSTGRES_DB:-}" ]]; then
    DB_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:55435/${POSTGRES_DB}?sslmode=disable"
  fi
  if [[ -n "$DB_URL" ]]; then
    COUNT="$(psql "$DB_URL" -X -A -t -q -v ON_ERROR_STOP=1 -c "WITH tenant AS (SELECT id FROM fitcore_tenants WHERE slug='demo' LIMIT 1), scope AS (SELECT set_config('app.tenant_id', (SELECT id::text FROM tenant), true)) SELECT count(*) FROM fitcore_audit_events, scope WHERE tenant_id=(SELECT id FROM tenant) AND recurso_tipo='navigation' AND acao='menu_resolvido';")"
    if [[ "${COUNT:-0}" -lt 3 ]]; then
      echo "ERRO: auditoria de navegação insuficiente: $COUNT" >&2
      exit 1
    fi
    echo "OK: auditoria de navegação persistida no PostgreSQL ($COUNT eventos)."
  fi
fi

for page in mvp-01.html mvp-02.html mvp-03.html mvp-13.html mvp-17.html; do
  curl -fsSI "$API_BASE/$page" | grep -q "HTTP/2 200\|HTTP/1.1 200"
  echo "OK: /$page publicado."
done

echo "MVP-17 verificado: menu por papel, bloqueios de UI, sessão assinada e auditoria ativos."
