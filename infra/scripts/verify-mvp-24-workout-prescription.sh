#!/usr/bin/env bash
set -euo pipefail
cd /opt/fitcore-pro

BASE="${FITCORE_PUBLIC_URL:-https://fitcore.marcaia.app}"
STAMP="$(date +%s)-$RANDOM"
SLUG="mvp24-$STAMP"
OWNER_LOGIN="owner24-$STAMP"
OWNER_CODE="FitCoreMVP24$RANDOM"
PROF_LOGIN="prof24-$STAMP"
PROF_CODE="FitCoreProf24$RANDOM"
ALUNO_LOGIN="aluno24-$STAMP"
ALUNO_CODE="FitCoreAluno24$RANDOM"
OTHER_LOGIN="outro24-$STAMP"
OTHER_CODE="FitCoreOutro24$RANDOM"
OWNER_JAR="/tmp/fitcore-mvp24-owner.cookie"
PROF_JAR="/tmp/fitcore-mvp24-prof.cookie"
ALUNO_JAR="/tmp/fitcore-mvp24-aluno.cookie"
OTHER_JAR="/tmp/fitcore-mvp24-other.cookie"
rm -f "$OWNER_JAR" "$PROF_JAR" "$ALUNO_JAR" "$OTHER_JAR"

echo "MVP-24 — verificando prescrição real de treino vinculada ao aluno"
node --check services/api/security/workout-prescription.mjs
node --check services/api/security/student-management.mjs
node --check services/api/security/navigation-rbac.mjs
node --check services/api/security/signed-session.mjs
node --check services/api/server.mjs
node --check apps/site-static/mvp-24.js
node tools/check-front-assets.mjs
node tools/check-next-app.mjs

echo "OK: sintaxe, CSS/JS estático e contrato Next validados."
curl -fsS "$BASE/api/mvp-24/status" | grep -q '"enabled": true'
curl -fsS "$BASE/api/mvp-24/status" | grep -q '"aluno_own_workouts_only": true'
echo "OK: MVP-24 ativo."

curl -fsS -c "$OWNER_JAR" -H 'content-type: application/json' \
  -d "{\"business_name\":\"Academia MVP24 $STAMP\",\"business_type\":\"academia\",\"slug\":\"$SLUG\",\"owner_name\":\"Gestor MVP24\",\"login_identifier\":\"$OWNER_LOGIN\",\"secret\":\"$OWNER_CODE\",\"professor_nome\":\"Professor Inicial MVP24\",\"aluno_nome\":\"Aluno Inicial MVP24\"}" \
  "$BASE/api/mvp-21/onboarding" > /tmp/mvp24-onboarding.json
python3 - <<'PY2'
import json
j=json.load(open('/tmp/mvp24-onboarding.json'))
assert j['tenant']['slug'].startswith('mvp24-'), j
assert j['session']['actor_role']=='gestor', j
PY2
echo "OK: tenant novo criado."

curl -fsS -b "$OWNER_JAR" -H 'content-type: application/json' \
  -d "{\"nome\":\"Professor Prescrição MVP24\",\"papel\":\"professor\",\"login_identifier\":\"$PROF_LOGIN\",\"secret\":\"$PROF_CODE\"}" \
  "$BASE/api/mvp-22/users" > /tmp/mvp24-prof-created.json
curl -fsS -b "$OWNER_JAR" -H 'content-type: application/json' \
  -d "{\"nome\":\"Aluno Prescrição MVP24\",\"papel\":\"aluno\",\"login_identifier\":\"$ALUNO_LOGIN\",\"secret\":\"$ALUNO_CODE\"}" \
  "$BASE/api/mvp-22/users" > /tmp/mvp24-aluno-user.json
curl -fsS -b "$OWNER_JAR" -H 'content-type: application/json' \
  -d "{\"nome\":\"Outro Aluno MVP24\",\"papel\":\"aluno\",\"login_identifier\":\"$OTHER_LOGIN\",\"secret\":\"$OTHER_CODE\"}" \
  "$BASE/api/mvp-22/users" > /tmp/mvp24-other-user.json
python3 - <<'PY2'
import json
for f in ['prof-created','aluno-user','other-user']:
  j=json.load(open(f'/tmp/mvp24-{f}.json'))
  assert j['user']['id'], j
PY2
echo "OK: professor e alunos usuários criados no tenant."

PROF_ID=$(python3 -c "import json; print(json.load(open('/tmp/mvp24-prof-created.json'))['user']['id'])")
ALUNO_USER_ID=$(python3 -c "import json; print(json.load(open('/tmp/mvp24-aluno-user.json'))['user']['id'])")
OTHER_USER_ID=$(python3 -c "import json; print(json.load(open('/tmp/mvp24-other-user.json'))['user']['id'])")

curl -fsS -b "$OWNER_JAR" -H 'content-type: application/json' \
  -d "{\"nome_publico\":\"Aluno Treino MVP24\",\"codigo_publico\":\"ALU24-$STAMP\",\"nivel\":\"iniciante\",\"objetivo\":\"hipertrofia\",\"modalidade_preferida\":\"academia\",\"frequencia_semana\":4,\"professor_id\":\"$PROF_ID\",\"user_id\":\"$ALUNO_USER_ID\"}" \
  "$BASE/api/mvp-23/students" > /tmp/mvp24-student.json
curl -fsS -b "$OWNER_JAR" -H 'content-type: application/json' \
  -d "{\"nome_publico\":\"Outro Aluno Treino MVP24\",\"codigo_publico\":\"OUT24-$STAMP\",\"nivel\":\"iniciante\",\"objetivo\":\"saude\",\"modalidade_preferida\":\"academia\",\"frequencia_semana\":3,\"professor_id\":\"$PROF_ID\",\"user_id\":\"$OTHER_USER_ID\"}" \
  "$BASE/api/mvp-23/students" > /tmp/mvp24-other-student.json
python3 - <<'PY2'
import json
for f in ['student','other-student']:
  j=json.load(open(f'/tmp/mvp24-{f}.json'))
  assert j['student']['id'], j
  assert j['student']['professor_id'], j
  assert j['student']['user_id'], j
PY2
echo "OK: alunos reais criados com professor e usuário aluno vinculados."

STUDENT_ID=$(python3 -c "import json; print(json.load(open('/tmp/mvp24-student.json'))['student']['id'])")

curl -fsS -b "$OWNER_JAR" -H 'content-type: application/json' \
  -d "{\"student_id\":\"$STUDENT_ID\",\"objetivo\":\"hipertrofia\",\"modalidade\":\"academia\",\"foco\":\"completo\",\"dias_semana\":4,\"blocos\":[{\"dia\":1,\"titulo\":\"Base A\",\"exercicios\":[\"Agachamento\",\"Supino\",\"Remada\"]}]}" \
  "$BASE/api/mvp-24/prescriptions" > /tmp/mvp24-prescription.json
python3 - <<'PY2'
import json
j=json.load(open('/tmp/mvp24-prescription.json'))
assert j['prescription']['id'], j
assert j['prescription']['student_id'], j
assert j['prescription']['status'] in ['rascunho','em_revisao'], j
PY2
echo "OK: treino nasceu a partir do aluno real."

PRESCRIPTION_ID=$(python3 -c "import json; print(json.load(open('/tmp/mvp24-prescription.json'))['prescription']['id'])")

curl -fsS -c "$PROF_JAR" -H "x-fitcore-rate-test: mvp24-prof-$STAMP" -H 'content-type: application/json' \
  -d "{\"tenant_slug\":\"$SLUG\",\"login_identifier\":\"$PROF_LOGIN\",\"secret\":\"$PROF_CODE\"}" \
  "$BASE/api/mvp-19/login" > /tmp/mvp24-prof-login.json
curl -fsS -b "$PROF_JAR" -H 'content-type: application/json' \
  -d '{"status":"aprovado","observacoes":"Treino aprovado no smoke MVP-24."}' \
  "$BASE/api/mvp-24/prescriptions/$PRESCRIPTION_ID/review" > /tmp/mvp24-review.json
python3 - <<'PY2'
import json
j=json.load(open('/tmp/mvp24-review.json'))
assert j['prescription']['status']=='aprovado', j
assert j['reviewed'] is True, j
assert j['prescription']['review_status']=='aprovado', j
PY2
echo "OK: professor responsável revisou e aprovou o treino."

curl -fsS -c "$ALUNO_JAR" -H "x-fitcore-rate-test: mvp24-aluno-$STAMP" -H 'content-type: application/json' \
  -d "{\"tenant_slug\":\"$SLUG\",\"login_identifier\":\"$ALUNO_LOGIN\",\"secret\":\"$ALUNO_CODE\"}" \
  "$BASE/api/mvp-19/login" > /tmp/mvp24-aluno-login.json
curl -fsS -b "$ALUNO_JAR" "$BASE/api/mvp-24/my-workouts" > /tmp/mvp24-my-workouts.json
python3 - <<'PY2'
import json
j=json.load(open('/tmp/mvp24-my-workouts.json'))
items=j.get('prescriptions') or []
assert len(items)==1, j
assert items[0]['status']=='aprovado', j
PY2
echo "OK: aluno vê somente o próprio treino."

curl -fsS -c "$OTHER_JAR" -H "x-fitcore-rate-test: mvp24-other-$STAMP" -H 'content-type: application/json' \
  -d "{\"tenant_slug\":\"$SLUG\",\"login_identifier\":\"$OTHER_LOGIN\",\"secret\":\"$OTHER_CODE\"}" \
  "$BASE/api/mvp-19/login" > /tmp/mvp24-other-login.json
curl -fsS -b "$OTHER_JAR" "$BASE/api/mvp-24/my-workouts" > /tmp/mvp24-other-workouts.json
python3 - <<'PY2'
import json
j=json.load(open('/tmp/mvp24-other-workouts.json'))
assert len(j.get('prescriptions') or [])==0, j
PY2
echo "OK: outro aluno não vê treino que não pertence a ele."

HTTP_CROSS=$(curl -s -o /tmp/mvp24-cross.json -w "%{http_code}" -b "$OWNER_JAR" "$BASE/api/mvp-24/prescriptions?tenant_slug=demo")
[ "$HTTP_CROSS" = "403" ] || { echo "ERRO: acesso cruzado deveria retornar 403, retornou $HTTP_CROSS"; cat /tmp/mvp24-cross.json; exit 1; }
echo "OK: bloqueio de acesso cruzado por tenant validado."

set -a
. storage/secrets/fitcore-postgres.env
set +a
DB_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:55435/${POSTGRES_DB}?sslmode=disable"
TENANT_ID=$(python3 -c "import json; print(json.load(open('/tmp/mvp24-onboarding.json'))['tenant']['id'])")
COUNTS=$(psql "$DB_URL" -X -A -t -q -c "WITH scope AS (SELECT set_config('app.tenant_id','$TENANT_ID',true)) SELECT jsonb_build_object('students',(SELECT count(*) FROM fitcore_students WHERE tenant_id='$TENANT_ID'),'workouts',(SELECT count(*) FROM fitcore_workouts WHERE tenant_id='$TENANT_ID'),'reviews',(SELECT count(*) FROM fitcore_professor_reviews WHERE tenant_id='$TENANT_ID'),'events',(SELECT count(*) FROM fitcore_workout_prescription_events WHERE tenant_id='$TENANT_ID'),'audit',(SELECT count(*) FROM fitcore_audit_events WHERE tenant_id='$TENANT_ID'))::text FROM scope;")
printf '%s' "$COUNTS" > /tmp/mvp24-counts.json
python3 - <<'PY2'
import json
j=json.load(open('/tmp/mvp24-counts.json'))
assert j['students'] >= 2, j
assert j['workouts'] >= 1, j
assert j['reviews'] >= 1, j
assert j['events'] >= 2, j
assert j['audit'] >= 6, j
print(json.dumps(j, indent=2))
PY2
echo "OK: status e auditoria por tenant persistidos no PostgreSQL."

curl -fsS "$BASE/api/health" | grep -q '"mvp_24"'
curl -fsSI "$BASE/mvp-24.html" | grep -q "HTTP/2 200"
curl -fsSL "$BASE/" | grep -q '/mvp-24.html'
echo "OK: health, home e /mvp-24.html publicados."
echo "MVP-24 verificado: prescrição real de treino vinculada ao aluno, revisão do professor, visibilidade do aluno, RBAC e auditoria por tenant ativos."
