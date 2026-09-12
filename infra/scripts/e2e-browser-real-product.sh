#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
NAME="fitcore-browser-e2e-${RANDOM}-$$"
PASS="fitcore-browser-e2e"
DB="fitcore_browser"
API_PORT="$((18100 + RANDOM % 500))"
NEXT_PORT="$((13100 + RANDOM % 500))"
PROXY_PORT="$((19100 + RANDOM % 500))"
API_PID=""
NEXT_PID=""
PROXY_PID=""
API_LOG="/tmp/${NAME}-api.log"
NEXT_LOG="/tmp/${NAME}-next.log"
PROXY_LOG="/tmp/${NAME}-proxy.log"

cleanup() {
  local rc=$?
  [[ "$rc" -eq 0 ]] || { echo "--- API log ---"; tail -80 "$API_LOG" 2>/dev/null || true; echo "--- Next log ---"; tail -80 "$NEXT_LOG" 2>/dev/null || true; echo "--- Proxy log ---"; tail -80 "$PROXY_LOG" 2>/dev/null || true; }
  [[ -n "$PROXY_PID" ]] && kill "$PROXY_PID" >/dev/null 2>&1 || true
  [[ -n "$NEXT_PID" ]] && kill "$NEXT_PID" >/dev/null 2>&1 || true
  [[ -n "$API_PID" ]] && kill "$API_PID" >/dev/null 2>&1 || true
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  exit "$rc"
}
trap cleanup EXIT

for cmd in docker curl node npm; do
  command -v "$cmd" >/dev/null || { echo "ERRO: $cmd obrigatório" >&2; exit 2; }
done
[[ -x node_modules/.bin/playwright ]] || { echo "ERRO: rode npm ci na raiz para instalar Playwright." >&2; exit 2; }
[[ -x apps/site/node_modules/.bin/next ]] || npm --prefix apps/site ci --no-audit --no-fund

docker run -d --rm --name "$NAME" \
  -e POSTGRES_PASSWORD="$PASS" \
  -e POSTGRES_DB="$DB" \
  -p 127.0.0.1::5432 \
  postgres:17.6-alpine >/dev/null

ready_count=0
for _ in $(seq 1 80); do
  if docker exec "$NAME" psql -U postgres -d "$DB" -Atqc 'select 1' 2>/dev/null | grep -qx 1; then
    ready_count=$((ready_count + 1)); [[ "$ready_count" -ge 2 ]] && break
  else
    ready_count=0
  fi
  sleep 0.4
done
[[ "$ready_count" -ge 2 ]] || { echo "ERRO: PostgreSQL 17.6 não ficou estável." >&2; exit 3; }

HOST_PORT="$(docker port "$NAME" 5432/tcp | awk -F: 'NR==1{print $NF}')"
export FITCORE_DATABASE_URL="postgresql://postgres:${PASS}@127.0.0.1:${HOST_PORT}/${DB}?sslmode=disable"

for file in $(find infra/sql -maxdepth 1 -type f -name '[0-9][0-9][0-9]-*.sql' | sort); do
  docker exec -i "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 < "$file" >/dev/null
done

export FITCORE_PERSISTENCE_STORE=postgres
export FITCORE_ENV=production
export NODE_ENV=production
export FITCORE_AUTH_MODE=signed
export FITCORE_DEMO_LOGIN_ENABLED=false
export FITCORE_CREDENTIAL_LOGIN_ENABLED=true
export FITCORE_AUTH_HARDENING_ENABLED=true
export FITCORE_TENANT_ONBOARDING_ENABLED=true
export FITCORE_TENANT_USER_MANAGEMENT_ENABLED=true
export FITCORE_STUDENT_MANAGEMENT_ENABLED=true
export FITCORE_WORKOUT_PRESCRIPTION_ENABLED=true
export FITCORE_WORKOUT_EXECUTION_ENABLED=true
export FITCORE_STUDENT_EVOLUTION_ENABLED=true
export FITCORE_GUIDED_SETUP_ENABLED=true
export FITCORE_SESSION_COOKIE_SECURE=false
export FITCORE_SESSION_SECRET="fitcore-browser-${RANDOM}-${RANDOM}-${RANDOM}"
export FITCORE_API_HOST=127.0.0.1
export FITCORE_API_PORT="$API_PORT"
export FITCORE_E2E_API_TARGET="http://127.0.0.1:${API_PORT}"
export FITCORE_E2E_WEB_TARGET="http://127.0.0.1:${NEXT_PORT}"
export FITCORE_E2E_PROXY_PORT="$PROXY_PORT"
export FITCORE_BROWSER_BASE_URL="http://127.0.0.1:${PROXY_PORT}"
export FITCORE_PUBLIC_URL="$FITCORE_BROWSER_BASE_URL"

start_api() {
  node services/api/server.mjs >"$API_LOG" 2>&1 &
  API_PID=$!
  for _ in $(seq 1 80); do
    curl -fsS "http://127.0.0.1:${API_PORT}/api/health" >/dev/null 2>&1 && return 0
    kill -0 "$API_PID" >/dev/null 2>&1 || { cat "$API_LOG" >&2; return 1; }
    sleep 0.25
  done
  cat "$API_LOG" >&2
  return 1
}

stop_api() {
  [[ -n "$API_PID" ]] || return 0
  kill "$API_PID" >/dev/null 2>&1 || true
  wait "$API_PID" 2>/dev/null || true
  API_PID=""
}

npm run site:next:build >/dev/null
(cd apps/site && node_modules/.bin/next start -H 127.0.0.1 -p "$NEXT_PORT") >"$NEXT_LOG" 2>&1 &
NEXT_PID=$!
start_api
node tools/e2e-browser-proxy.mjs >"$PROXY_LOG" 2>&1 &
PROXY_PID=$!

for _ in $(seq 1 80); do
  curl -fsS "$FITCORE_BROWSER_BASE_URL/cadastro" >/dev/null 2>&1 && break
  kill -0 "$NEXT_PID" >/dev/null 2>&1 || { cat "$NEXT_LOG" >&2; exit 4; }
  kill -0 "$PROXY_PID" >/dev/null 2>&1 || { cat "$PROXY_LOG" >&2; exit 4; }
  sleep 0.25
done
curl -fsS "$FITCORE_BROWSER_BASE_URL/cadastro" >/dev/null

STAMP="$(date +%s)-$RANDOM"
export FITCORE_E2E_SLUG="browser-$STAMP"
export FITCORE_E2E_OWNER_LOGIN="owner-$STAMP@fitcore.test"
export FITCORE_E2E_OWNER_SECRET="FitCoreOwner9-$RANDOM"
export FITCORE_E2E_PROF_LOGIN="prof-$STAMP@fitcore.test"
export FITCORE_E2E_PROF_SECRET="FitCoreProf9-$RANDOM"
export FITCORE_E2E_ALUNO_LOGIN="aluno-$STAMP@fitcore.test"
export FITCORE_E2E_ALUNO_SECRET="FitCoreAluno9-$RANDOM"

npx playwright test tests/browser/real-product-create.spec.mjs --config=playwright.config.mjs

echo "Reiniciando API para provar persistência..."
stop_api
start_api
curl -fsS "$FITCORE_BROWSER_BASE_URL/api/health" >/dev/null
npx playwright test tests/browser/real-product-after-restart.spec.mjs --config=playwright.config.mjs

TENANT_ID="$(docker exec "$NAME" psql -U postgres -d "$DB" -X -A -t -q -c "SELECT id::text FROM fitcore_tenants WHERE slug='${FITCORE_E2E_SLUG}' LIMIT 1")"
COUNTS="$(docker exec "$NAME" psql -U postgres -d "$DB" -X -A -t -q -c "SELECT jsonb_build_object(
  'users',(SELECT count(*) FROM fitcore_users WHERE tenant_id='${TENANT_ID}'),
  'students',(SELECT count(*) FROM fitcore_students WHERE tenant_id='${TENANT_ID}' AND user_id IS NOT NULL AND professor_id IS NOT NULL),
  'workouts',(SELECT count(*) FROM fitcore_workouts WHERE tenant_id='${TENANT_ID}' AND status='aprovado'),
  'completed',(SELECT count(*) FROM fitcore_workout_executions WHERE tenant_id='${TENANT_ID}' AND status='concluido')
)::text")"
python3 - <<PY
import json
j=json.loads('''$COUNTS''')
assert j['users']==3, j
assert j['students']==1, j
assert j['workouts']==1, j
assert j['completed']==1, j
print('BROWSER_DB_ASSERTIONS=PASS', j)
PY

echo "Browser E2E aprovado: cadastro → gestor → professor → aluno vinculado → prescrição → restart → login aluno → execução → evolução → viewport Android."
