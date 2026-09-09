#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_BASE="${FITCORE_PUBLIC_API_BASE:-https://fitcore.marcaia.app}"

cd "$ROOT"

echo "MVP-14 — verificando Auth/RBAC foundation"

node --check services/api/security/access-context.mjs
node --check services/api/server.mjs
node --check apps/site-static/mvp-14.js

echo "OK: sintaxe validada."

curl -fsS "$API_BASE/api/mvp-10/postgres-store" | grep -q '"active_store": "PostgresStore"'
echo "OK: PostgresStore segue ativo."

for role in gestor professor aluno; do
  curl -fsS \
    -H "x-fitcore-role: $role" \
    -H "x-fitcore-tenant: demo" \
    -H "x-fitcore-actor: smoke-$role" \
    "$API_BASE/api/mvp-14/access-context" >/tmp/fitcore-mvp14-$role.json
  python3 -m json.tool /tmp/fitcore-mvp14-$role.json >/dev/null
  grep -q "\"actor_role\": \"$role\"" /tmp/fitcore-mvp14-$role.json
  grep -q '"tenant_slug": "demo"' /tmp/fitcore-mvp14-$role.json
  echo "OK: contexto de acesso para $role"
done

curl -fsS "$API_BASE/api/health" | grep -q '"mvp_14"'
echo "OK: /api/health expõe mvp_14."

curl -fsSI "$API_BASE/mvp-14.html" | grep -q "HTTP/2 200\|HTTP/1.1 200"
echo "OK: /mvp-14.html publicado."

echo "MVP-14 verificado: contexto de tenant/papel pronto para login real sem quebrar PostgresStore."
