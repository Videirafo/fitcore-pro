#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

BASE="${FITCORE_PUBLIC_URL:-https://fitcore.marcaia.app}"
source "$ROOT/infra/scripts/lib/require-safe-test-target.sh"
fitcore_require_safe_test_target "$BASE"
STAMP="$(date +%s)-$RANDOM"
SLUG="mvp23-$STAMP"
OWNER_LOGIN="owner23-$STAMP"
OWNER_SECRET="FitCore#Owner23-$RANDOM"
PROF_LOGIN="prof23-$STAMP"
PROF_SECRET="FitCore#Prof23-$RANDOM"
ALUNO_LOGIN="aluno23-$STAMP"
ALUNO_SECRET="FitCore#Aluno23-$RANDOM"
OWNER_JAR="/tmp/fitcore-mvp23-owner.cookie"
PROF_JAR="/tmp/fitcore-mvp23-prof.cookie"
ALUNO_JAR="/tmp/fitcore-mvp23-aluno.cookie"
rm -f "$OWNER_JAR" "$PROF_JAR" "$ALUNO_JAR"

echo "MVP-23 — verificando cadastro operacional de aluno real"
node --check services/api/security/student-management.mjs
node --check services/api/security/signed-session.mjs
node --check services/api/security/navigation-rbac.mjs
node --check services/api/server.mjs
node --check apps/site-static/mvp-23.js
node tools/check-front-assets.mjs
node tools/check-next-app.mjs
echo "OK: sintaxe, CSS/JS estático e contrato Next validados."

curl -fsS "$BASE/api/mvp-23/status" | grep -q '"enabled": true'
curl -fsS "$BASE/api/mvp-23/status" | grep -q '"student_entity_complete": true'
echo "OK: MVP-23 ativo."

curl -fsS -c "$OWNER_JAR" -H 'content-type: application/json' \
  -d "{\"business_name\":\"Academia MVP23 $STAMP\",\"business_type\":\"academia\",\"slug\":\"$SLUG\",\"owner_name\":\"Gestor MVP23\",\"login_identifier\":\"$OWNER_LOGIN\",\"secret\":\"$OWNER_SECRET\",\"professor_nome\":\"Professor Inicial MVP23\",\"aluno_nome\":\"Aluno Inicial MVP23\"}" \
  "$BASE/api/mvp-21/onboarding" > /tmp/mvp23-onboarding.json
python3 - <<'PY2'
import json
j=json.load(open('/tmp/mvp23-onboarding.json'))
assert j['tenant']['slug'].startswith('mvp23-'), j
assert j['session']['actor_role']=='gestor', j
PY2
echo "OK: tenant novo criado com gestor proprietário."

curl -fsS -b "$OWNER_JAR" -H 'content-type: application/json' \
  -d "{\"nome\":\"Professor MVP23\",\"papel\":\"professor\",\"login_identifier\":\"$PROF_LOGIN\",\"secret\":\"$PROF_SECRET\"}" \
  "$BASE/api/mvp-22/users" > /tmp/mvp23-prof-user.json
PROF_ID=$(python3 - <<'PY2'
import json
print(json.load(open('/tmp/mvp23-prof-user.json'))['user']['id'])
PY2
)
curl -fsS -b "$OWNER_JAR" -H 'content-type: application/json' \
  -d "{\"nome\":\"Aluno User MVP23\",\"papel\":\"aluno\",\"login_identifier\":\"$ALUNO_LOGIN\",\"secret\":\"$ALUNO_SECRET\"}" \
  "$BASE/api/mvp-22/users" > /tmp/mvp23-aluno-user.json
ALUNO_USER_ID=$(python3 - <<'PY2'
import json
print(json.load(open('/tmp/mvp23-aluno-user.json'))['user']['id'])
PY2
)
echo "OK: gestor criou professor e usuário aluno no tenant."

curl -fsS -b "$OWNER_JAR" -H 'content-type: application/json' \
  -d "{\"nome_publico\":\"Aluno Cadastro MVP23\",\"codigo_publico\":\"ALU-$STAMP\",\"nivel\":\"intermediario\",\"objetivo\":\"força\",\"modalidade_preferida\":\"academia\",\"frequencia_semana\":4,\"professor_id\":\"$PROF_ID\",\"aluno_user_id\":\"$ALUNO_USER_ID\",\"etiquetas\":[\"manhã\",\"força\"],\"observacoes_minimas\":\"sem dados sensíveis no MVP\"}" \
  "$BASE/api/mvp-23/students" > /tmp/mvp23-student-created.json
STUDENT_ID=$(python3 - <<'PY2'
import json
j=json.load(open('/tmp/mvp23-student-created.json'))
assert j['student']['nome_publico']=='Aluno Cadastro MVP23', j
assert j['student']['professor_id'], j
assert j['student']['user_id'], j
print(j['student']['id'])
PY2
)
echo "OK: aluno operacional criado com vínculo de professor e usuário aluno."

curl -fsS -b "$OWNER_JAR" "$BASE/api/mvp-23/students?search=Cadastro&limit=10" > /tmp/mvp23-students.json
python3 - <<'PY2'
import json
j=json.load(open('/tmp/mvp23-students.json'))
assert j['total'] >= 2, j
assert any(s['nome_publico']=='Aluno Cadastro MVP23' for s in j['students']), j
PY2
echo "OK: listagem por tenant encontrou o aluno criado."

curl -fsS -b "$OWNER_JAR" "$BASE/api/mvp-23/students/$STUDENT_ID" | grep -q 'Aluno Cadastro MVP23'
echo "OK: detalhe por ID carrega aluno do tenant."

curl -fsS -b "$OWNER_JAR" -H 'content-type: application/json' -d '{"status":"inativo","detalhe":"verificação MVP-23"}' "$BASE/api/mvp-23/students/$STUDENT_ID/status" | grep -q '"status": "inativo"'
echo "OK: alteração de status persistiu."


curl -fsS -c "$PROF_JAR" -H "x-fitcore-rate-test: mvp23-prof-$STAMP" -H 'content-type: application/json' \
  -d "{\"tenant_slug\":\"$SLUG\",\"login_identifier\":\"$PROF_LOGIN\",\"secret\":\"$PROF_SECRET\"}" \
  "$BASE/api/mvp-19/login" > /tmp/mvp23-prof-login.json
curl -fsS -b "$PROF_JAR" "$BASE/api/mvp-15/session" | grep -q '"actor_role": "professor"'
curl -fsS -b "$PROF_JAR" -H 'content-type: application/json' \
  -d '{"nome_publico":"Aluno Criado por Professor MVP23","objetivo":"condicionamento","frequencia_semana":3}' \
  "$BASE/api/mvp-23/students" | grep -q 'Aluno Criado por Professor MVP23'
echo "OK: professor cria aluno no próprio tenant."

curl -fsS -c "$ALUNO_JAR" -H "x-fitcore-rate-test: mvp23-aluno-$STAMP" -H 'content-type: application/json' \
  -d "{\"tenant_slug\":\"$SLUG\",\"login_identifier\":\"$ALUNO_LOGIN\",\"secret\":\"$ALUNO_SECRET\"}" \
  "$BASE/api/mvp-19/login" > /tmp/mvp23-aluno-login.json
HTTP_ALUNO=$(curl -s -o /tmp/mvp23-aluno-forbidden.json -w "%{http_code}" -b "$ALUNO_JAR" "$BASE/api/mvp-23/students")
[ "$HTTP_ALUNO" = "403" ] || { echo "ERRO: aluno não deveria acessar gestão de alunos, retornou $HTTP_ALUNO"; cat /tmp/mvp23-aluno-forbidden.json; exit 1; }
echo "OK: aluno logado não acessa gestão operacional de alunos."

HTTP_CROSS=$(curl -s -o /tmp/mvp23-cross.json -w "%{http_code}" -b "$OWNER_JAR" "$BASE/api/mvp-23/students?tenant_slug=demo")
[ "$HTTP_CROSS" = "403" ] || { echo "ERRO: acesso cruzado deveria retornar 403, retornou $HTTP_CROSS"; cat /tmp/mvp23-cross.json; exit 1; }
echo "OK: bloqueio de acesso cruzado por tenant validado."

set -a
# shellcheck disable=SC1091
. storage/secrets/fitcore-postgres.env
set +a
DB_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:55435/${POSTGRES_DB}?sslmode=disable"
TENANT_ID=$(python3 - <<'PY2'
import json
print(json.load(open('/tmp/mvp23-onboarding.json'))['tenant']['id'])
PY2
)
COUNTS=$(psql "$DB_URL" -X -A -t -q -c "WITH scope AS (SELECT set_config('app.tenant_id','$TENANT_ID',true)) SELECT jsonb_build_object('students',(SELECT count(*) FROM fitcore_students WHERE tenant_id='$TENANT_ID'),'events',(SELECT count(*) FROM fitcore_student_events WHERE tenant_id='$TENANT_ID'),'audit',(SELECT count(*) FROM fitcore_audit_events WHERE tenant_id='$TENANT_ID'))::text FROM scope;")
printf '%s' "$COUNTS" > /tmp/mvp23-counts.json
python3 - <<'PY2'
import json
j=json.load(open('/tmp/mvp23-counts.json'))
assert j['students'] >= 3, j
assert j['events'] >= 2, j
assert j['audit'] >= 7, j
print(json.dumps(j, indent=2))
PY2
echo "OK: dados e auditoria de aluno persistidos no PostgreSQL."

curl -fsS "$BASE/api/health" | grep -q '"mvp_23"'
curl -fsSI "$BASE/mvp-23.html" | grep -q "HTTP/2 200"
curl -fsSL "$BASE/" | grep -q '/mvp-23.html'
echo "OK: health, home e /mvp-23.html publicados."

echo "MVP-23 verificado: cadastro operacional de aluno real, vínculos, status, RBAC, bloqueio cruzado, auditoria e front Next-ready ativos."
