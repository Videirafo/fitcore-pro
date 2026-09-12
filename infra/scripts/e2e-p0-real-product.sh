#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
NAME="fitcore-p0-e2e-${RANDOM}-$$"
PASS="fitcore-p0-e2e"
DB="fitcore_p0"
API_PORT="$((18000 + RANDOM % 1000))"
API_PID=""
OWNER_JAR="/tmp/${NAME}-owner.cookie"
PROF_JAR="/tmp/${NAME}-prof.cookie"
ALUNO_JAR="/tmp/${NAME}-aluno.cookie"
LOG="/tmp/${NAME}-api.log"

cleanup() {
  [[ -n "$API_PID" ]] && kill "$API_PID" >/dev/null 2>&1 || true
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  rm -f "$OWNER_JAR" "$PROF_JAR" "$ALUNO_JAR" /tmp/${NAME}-*.json "$LOG" /tmp/${NAME}-fail-closed.log
}
trap cleanup EXIT

for cmd in docker psql curl node python3; do
  command -v "$cmd" >/dev/null || { echo "ERRO: $cmd obrigatório" >&2; exit 2; }
done

docker run -d --rm --name "$NAME" \
  -e POSTGRES_PASSWORD="$PASS" \
  -e POSTGRES_DB="$DB" \
  -p 127.0.0.1::5432 \
  postgres:17.6-alpine >/dev/null

ready_count=0
for _ in $(seq 1 80); do
  if docker exec "$NAME" psql -U postgres -d "$DB" -Atqc 'select 1' 2>/dev/null | grep -qx 1; then
    ready_count=$((ready_count + 1))
    [[ "$ready_count" -ge 2 ]] && break
  else
    ready_count=0
  fi
  sleep 0.4
done
[[ "$ready_count" -ge 2 ]] || { echo "ERRO: PostgreSQL 17.6 não ficou estável." >&2; exit 3; }

HOST_PORT="$(docker port "$NAME" 5432/tcp | awk -F: 'NR==1{print $NF}')"
DATABASE_URL="postgresql://postgres:${PASS}@127.0.0.1:${HOST_PORT}/${DB}?sslmode=disable"

apply_sql() {
  docker exec -i "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 < "$ROOT/$1" >/dev/null
}
for file in $(find infra/sql -maxdepth 1 -type f -name '[0-9][0-9][0-9]-*.sql' | sort); do
  apply_sql "$file"
done

# MVP-48 migration reapply: must remain idempotent.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f infra/sql/020-mvp-48-premium-product.sql >/dev/null

export FITCORE_DATABASE_URL="$DATABASE_URL"
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
export FITCORE_SESSION_COOKIE_SECURE=false
export FITCORE_SESSION_SECRET="fitcore-p0-e2e-secret-${RANDOM}-${RANDOM}"
export FITCORE_API_HOST=127.0.0.1
export FITCORE_API_PORT="$API_PORT"
export FITCORE_PUBLIC_URL="http://127.0.0.1:${API_PORT}"
BASE="$FITCORE_PUBLIC_URL"

FAIL_CLOSED_LOG="/tmp/${NAME}-fail-closed.log"
if env -u FITCORE_DATABASE_URL -u DATABASE_URL \
  FITCORE_ENV=production NODE_ENV=production FITCORE_PERSISTENCE_STORE=postgres \
  FITCORE_API_HOST=127.0.0.1 FITCORE_API_PORT="$((API_PORT + 1))" \
  node services/api/server.mjs >"$FAIL_CLOSED_LOG" 2>&1; then
  echo "ERRO: produção iniciou sem FITCORE_DATABASE_URL." >&2
  exit 4
fi
grep -q 'FITCORE_DATABASE_URL é obrigatório em produção' "$FAIL_CLOSED_LOG"
echo "OK produção fail-closed sem PostgreSQL"

start_api() {
  node services/api/server.mjs >"$LOG" 2>&1 &
  API_PID=$!
  for _ in $(seq 1 60); do
    curl -fsS "$BASE/api/health" >/dev/null 2>&1 && return 0
    kill -0 "$API_PID" >/dev/null 2>&1 || { cat "$LOG" >&2; return 1; }
    sleep 0.25
  done
  cat "$LOG" >&2
  return 1
}

stop_api() {
  [[ -n "$API_PID" ]] || return 0
  kill "$API_PID" >/dev/null 2>&1 || true
  wait "$API_PID" 2>/dev/null || true
  API_PID=""
}

start_api
STAMP="$(date +%s)-$RANDOM"
SLUG="p0-$STAMP"
OWNER_LOGIN="owner-$STAMP@fitcore.test"
OWNER_SECRET="FitCore#Owner-$RANDOM"
PROF_LOGIN="prof-$STAMP@fitcore.test"
PROF_SECRET="FitCore#Prof-$RANDOM"
ALUNO_LOGIN="aluno-$STAMP@fitcore.test"
ALUNO_SECRET="FitCore#Aluno-$RANDOM"

curl -fsS -c "$OWNER_JAR" -H 'content-type: application/json' \
  -d "{\"business_name\":\"Academia P0 $STAMP\",\"business_type\":\"academia\",\"slug\":\"$SLUG\",\"owner_name\":\"Gestor P0 Completo\",\"owner_email\":\"$OWNER_LOGIN\",\"owner_phone\":\"22999998888\",\"city\":\"Saquarema\",\"state\":\"RJ\",\"accept_terms\":true,\"accept_privacy\":true,\"secret\":\"$OWNER_SECRET\",\"confirm_secret\":\"$OWNER_SECRET\"}" \
  "$BASE/api/mvp-21/onboarding" > "/tmp/${NAME}-onboarding.json"
python3 - <<PY
import json
j=json.load(open('/tmp/${NAME}-onboarding.json'))
assert j['session']['actor_role']=='gestor', j
assert j['tenant']['slug']=='$SLUG', j
assert j.get('first_professor') is None, j
assert j.get('first_student_user') is None, j
assert j.get('first_student') is None, j
print('OK cadastro cria somente tenant + gestor real, sem equipe fictícia')
PY

curl -fsS -b "$OWNER_JAR" -H 'content-type: application/json' \
  -d "{\"nome\":\"Professor P0\",\"papel\":\"professor\",\"email\":\"$PROF_LOGIN\",\"telefone\":\"22999997777\",\"secret\":\"$PROF_SECRET\"}" \
  "$BASE/api/mvp-22/users" > "/tmp/${NAME}-prof.json"
curl -fsS -b "$OWNER_JAR" -H 'content-type: application/json' \
  -d "{\"nome\":\"Aluno P0\",\"papel\":\"aluno\",\"email\":\"$ALUNO_LOGIN\",\"telefone\":\"22999996666\",\"secret\":\"$ALUNO_SECRET\"}" \
  "$BASE/api/mvp-22/users" > "/tmp/${NAME}-aluno.json"
PROF_ID="$(python3 -c "import json; print(json.load(open('/tmp/${NAME}-prof.json'))['user']['id'])")"
ALUNO_USER_ID="$(python3 -c "import json; print(json.load(open('/tmp/${NAME}-aluno.json'))['user']['id'])")"

curl -fsS -b "$OWNER_JAR" -H 'content-type: application/json' \
  -d "{\"nome_publico\":\"Aluno P0\",\"nivel\":\"iniciante\",\"objetivo\":\"forca\",\"modalidade_preferida\":\"academia\",\"frequencia_semana\":3,\"professor_id\":\"$PROF_ID\",\"user_id\":\"$ALUNO_USER_ID\"}" \
  "$BASE/api/mvp-23/students" > "/tmp/${NAME}-student.json"
STUDENT_ID="$(python3 -c "import json; print(json.load(open('/tmp/${NAME}-student.json'))['student']['id'])")"
python3 - <<PY
import json
j=json.load(open('/tmp/${NAME}-student.json'))['student']
assert j['user_id']=='$ALUNO_USER_ID', j
assert j['professor_id']=='$PROF_ID', j
print('OK aluno operacional vinculado ao usuário e professor reais')
PY

curl -fsS -c "$PROF_JAR" -H 'content-type: application/json' \
  -d "{\"login_identifier\":\"$PROF_LOGIN\",\"secret\":\"$PROF_SECRET\"}" \
  "$BASE/api/mvp-19/login" > "/tmp/${NAME}-prof-login.json"
curl -fsS -b "$PROF_JAR" "$BASE/api/mvp-15/session" | grep -q '"actor_role": "professor"'

curl -fsS -c "$ALUNO_JAR" -H 'content-type: application/json' \
  -d "{\"login_identifier\":\"$ALUNO_LOGIN\",\"secret\":\"$ALUNO_SECRET\"}" \
  "$BASE/api/mvp-19/login" > "/tmp/${NAME}-aluno-login.json"
curl -fsS -b "$ALUNO_JAR" "$BASE/api/mvp-15/session" | grep -q '"actor_role": "aluno"'

curl -fsS -b "$PROF_JAR" -H 'content-type: application/json' \
  -d "{\"student_id\":\"$STUDENT_ID\",\"nome_treino\":\"Treino P0\",\"objetivo\":\"forca\",\"modalidade\":\"academia\",\"foco\":\"completo\",\"dias_semana\":3,\"exercicios\":[{\"nome\":\"Agachamento\",\"series\":3,\"repeticoes\":\"10\"}]}" \
  "$BASE/api/mvp-24/prescriptions" > "/tmp/${NAME}-prescription.json"
PRESCRIPTION_ID="$(python3 -c "import json; print(json.load(open('/tmp/${NAME}-prescription.json'))['prescription']['id'])")"

curl -fsS -b "$PROF_JAR" -H 'content-type: application/json' \
  -d '{"status":"aprovado","observacoes":"Aprovado no E2E P0."}' \
  "$BASE/api/mvp-24/prescriptions/$PRESCRIPTION_ID/review" > "/tmp/${NAME}-review.json"

curl -fsS -b "$ALUNO_JAR" "$BASE/api/mvp-24/my-workouts" > "/tmp/${NAME}-my-workouts-before.json"
python3 - <<PY
import json
j=json.load(open('/tmp/${NAME}-my-workouts-before.json'))
items=j.get('prescriptions') or []
assert len(items)==1, j
assert items[0]['id']=='$PRESCRIPTION_ID', j
assert items[0]['status']=='aprovado', j
print('OK gestor/professor/aluno + treino real antes do restart')
PY

stop_api
start_api
curl -fsS -b "$ALUNO_JAR" "$BASE/api/mvp-24/my-workouts" > "/tmp/${NAME}-my-workouts-after.json"
curl -fsS -b "$OWNER_JAR" "$BASE/api/mvp-22/users" > "/tmp/${NAME}-users-after.json"
python3 - <<PY
import json
workouts=json.load(open('/tmp/${NAME}-my-workouts-after.json'))
users=json.load(open('/tmp/${NAME}-users-after.json'))
items=workouts.get('prescriptions') or []
assert len(items)==1 and items[0]['id']=='$PRESCRIPTION_ID', workouts
assert users.get('total_users')==3, users
print('OK dados e sessões sobreviveram ao restart')
PY

TENANT_ID="$(python3 -c "import json; print(json.load(open('/tmp/${NAME}-onboarding.json'))['tenant']['id'])")"
COUNTS="$(docker exec "$NAME" psql -U postgres -d "$DB" -X -A -t -q -c "SELECT jsonb_build_object('users',(SELECT count(*) FROM fitcore_users WHERE tenant_id='$TENANT_ID'),'students',(SELECT count(*) FROM fitcore_students WHERE tenant_id='$TENANT_ID'),'workouts',(SELECT count(*) FROM fitcore_workouts WHERE tenant_id='$TENANT_ID'))::text")"
python3 - <<PY
import json
j=json.loads('''$COUNTS''')
assert j['users']==3, j
assert j['students']==1, j
assert j['workouts']>=1, j
print('OK PostgreSQL canônico:', j)
PY

echo "P0 E2E aprovado: cadastro → gestor → professor → aluno → treino → restart → persistência."
