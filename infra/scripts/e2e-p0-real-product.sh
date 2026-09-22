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
  -d '{"snapshot":{"name":"Treino P0 VNext","objective":"forca","modality":"academia","focus":"completo","days":[{"title":"Dia A","focus":"superior","blocks":[{"title":"Principal","protocol_code":"strength_4x8","exercises":[{"name":"Supino","sets":4,"reps":"8","rest_seconds":120,"target_load_kg":30,"target_rir_min":1,"target_rir_max":2,"target_rpe":8,"tempo":"3-1-1","protocol_code":"strength_4x8"},{"name":"Remada","sets":4,"reps":"10","rest_seconds":90,"target_load_kg":40,"target_rir_min":1,"target_rir_max":2,"target_rpe":8}]}]},{"title":"Dia B","focus":"inferior","blocks":[{"title":"Principal","exercises":[{"name":"Agachamento","sets":4,"reps":"8","rest_seconds":120,"target_load_kg":50,"target_rir_min":2,"target_rir_max":3,"target_rpe":7.5}]}]}]},"periodization":{"model":"linear","weeks":[{"week":1,"label":"Base","load_delta_pct":0,"volume_delta_pct":0},{"week":2,"label":"Progressao","load_delta_pct":2.5,"volume_delta_pct":5}]}}' \
  "$BASE/api/vnext/workout-builder/workouts/$PRESCRIPTION_ID/versions" > "/tmp/${NAME}-builder-version.json"
BUILDER_VERSION_ID="$(python3 -c "import json; print(json.load(open('/tmp/${NAME}-builder-version.json'))['version']['id'])")"

curl -fsS -b "$PROF_JAR" "$BASE/api/vnext/workout-builder/workouts/$PRESCRIPTION_ID/versions" > "/tmp/${NAME}-builder-preview.json"
python3 - <<PY
import json
j=json.load(open('/tmp/${NAME}-builder-preview.json'))
v=j['versions'][0]
assert v['state']=='draft', j
assert len(v['snapshot']['days'])==2, j
assert v['snapshot']['days'][0]['blocks'][0]['exercises'][0]['target_rpe']==8, j
assert len(v['periodization']['weeks'])==2, j
print('OK #93 builder draft + preview + periodization')
PY

curl -fsS -b "$PROF_JAR" -H 'content-type: application/json' -d '{}' \
  "$BASE/api/vnext/workout-builder/workouts/$PRESCRIPTION_ID/versions/$BUILDER_VERSION_ID/publish" > "/tmp/${NAME}-builder-publish.json"

curl -fsS -b "$PROF_JAR" -H 'content-type: application/json' \
  -d "{"version_id":"$BUILDER_VERSION_ID","template_code":"p0_strength","name":"P0 Strength"}" \
  "$BASE/api/vnext/workout-builder/templates" > "/tmp/${NAME}-builder-template.json"

curl -fsS -b "$PROF_JAR" -H 'content-type: application/json' \
  -d '{"protocol_code":"strength_4x8","name":"Strength 4x8","description":"P0 protocol","defaults":{"sets":4,"reps":"8","rest_seconds":120,"target_rir_min":1,"target_rir_max":2}}' \
  "$BASE/api/vnext/workout-builder/protocols" > "/tmp/${NAME}-builder-protocol.json"

curl -fsS -b "$PROF_JAR" -H 'content-type: application/json' \
  -d "{"template_code":"p0_strength","student_id":"$STUDENT_ID"}" \
  "$BASE/api/vnext/workout-builder/templates/clone" > "/tmp/${NAME}-builder-clone.json"

python3 - <<PY
import json
pub=json.load(open('/tmp/${NAME}-builder-publish.json'))
tpl=json.load(open('/tmp/${NAME}-builder-template.json'))
pro=json.load(open('/tmp/${NAME}-builder-protocol.json'))
cl=json.load(open('/tmp/${NAME}-builder-clone.json'))
assert pub['published'] is True and pub['version']==1, pub
assert tpl['template']['template_code']=='p0_strength', tpl
assert pro['protocol']['protocol_code']=='strength_4x8', pro
assert cl['cloned'] is True and cl['clone']['state']=='draft', cl
print('OK #93 publish canônico + template + protocol + clone')
PY

curl -fsS -b "$PROF_JAR" -H 'content-type: application/json' \
  -d '{"status":"aprovado","observacoes":"Aprovado no E2E P0 após publish VNext."}' \
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

curl -fsS -b "$ALUNO_JAR" -H 'content-type: application/json' \
  -d '{"title":"Treinar 3 vezes por semana","goal_code":"weekly_frequency","target_value":3,"target_unit":"treinos/semana","priority":"high"}' \
  "$BASE/api/vnext/athlete-360/me/goals" > "/tmp/${NAME}-athlete-goal.json"
curl -fsS -b "$ALUNO_JAR" "$BASE/api/vnext/athlete-360/me" > "/tmp/${NAME}-athlete360-before.json"
python3 - <<PY
import json
g=json.load(open('/tmp/${NAME}-athlete-goal.json'))
a=json.load(open('/tmp/${NAME}-athlete360-before.json'))['athlete']
assert g['goal']['status']=='active', g
assert a['student_id']=='$STUDENT_ID', a
assert a['profile']['name']=='Aluno P0', a
assert a['relationships']['coach_id']=='$PROF_ID', a
assert len(a['goals'])==1, a
assert a['training']['approved_workouts']==1, a
assert a['privacy']['medical_data_included'] is False, a
assert a['privacy']['health_assessment_summary_included'] is True, a
assert a['availability']['physical_assessments'] is True, a
assert a['availability']['pr_engine'] is False, a
print('OK Athlete 360 aluno: perfil + coach + meta + treino + LGPD + #92 disponível')
PY

curl -fsS -b "$OWNER_JAR" -H 'content-type: application/json' \
  -d '{"template_code":"anamnesis_standard","title":"Anamnese padrão","assessment_kind":"anamnesis","schema":{"fields":["training_history","declared_restrictions","routine","sleep_quality"]}}' \
  "$BASE/api/vnext/assessments/templates" > "/tmp/${NAME}-assessment-template-anam.json"
curl -fsS -b "$OWNER_JAR" -H 'content-type: application/json' \
  -d '{"template_code":"physical_standard","title":"Avaliação física padrão","assessment_kind":"physical","schema":{"measurements":["body_weight","waist_circumference"]}}' \
  "$BASE/api/vnext/assessments/templates" > "/tmp/${NAME}-assessment-template-physical.json"

curl -fsS -b "$ALUNO_JAR" -H 'content-type: application/json' \
  -d '{"scope":"assessment_data","state":"granted","consent_version":"v1"}' \
  "$BASE/api/vnext/assessments/consents" > "/tmp/${NAME}-assessment-consent.json"
curl -fsS -b "$ALUNO_JAR" -H 'content-type: application/json' \
  -d '{"scope":"ai_coach_derived_signals","state":"granted","consent_version":"v1"}' \
  "$BASE/api/vnext/assessments/consents" > "/tmp/${NAME}-assessment-ai-consent.json"

curl -fsS -b "$ALUNO_JAR" -H 'content-type: application/json' \
  -d '{"template_code":"anamnesis_standard","template_version":1,"assessment_kind":"anamnesis","responses":{"training_history":"iniciante","declared_restrictions":"nenhuma declarada","routine":"3x semana","sleep_quality":"regular"},"measurements":[],"attachments":[]}' \
  "$BASE/api/vnext/assessments/me/records" > "/tmp/${NAME}-assessment-anam.json"

INVALID_CODE="$(curl -sS -o "/tmp/${NAME}-assessment-invalid.json" -w '%{http_code}' -b "$PROF_JAR" -H 'content-type: application/json' \
  -d '{"template_code":"physical_standard","template_version":1,"assessment_kind":"physical","responses":{"notes":"sensitive-test-marker"},"measurements":[{"code":"body_weight","value":null,"unit":"kg"}],"attachments":[]}' \
  "$BASE/api/vnext/assessments/students/$STUDENT_ID/records")"
[[ "$INVALID_CODE" == "400" ]]
python3 - <<PY
import json
j=json.load(open('/tmp/${NAME}-assessment-invalid.json'))
assert j.get('erro')=='assessment_measurement_invalid', j
raw=json.dumps(j).lower()
assert 'psql' not in raw and 'select ' not in raw and 'sensitive-test-marker' not in raw, j
print('OK #92 HTTP hardening: invalid measurement 400 + sanitized error')
PY

curl -fsS -b "$PROF_JAR" -H 'content-type: application/json' \
  -d '{"template_code":"physical_standard","template_version":1,"assessment_kind":"physical","responses":{"notes":"registro operacional P0"},"measurements":[{"code":"body_weight","value":80,"unit":"kg","method":"scale"},{"code":"waist_circumference","value":90,"unit":"cm","method":"tape"}],"attachments":[]}' \
  "$BASE/api/vnext/assessments/students/$STUDENT_ID/records" > "/tmp/${NAME}-assessment-physical.json"

curl -fsS -b "$ALUNO_JAR" "$BASE/api/vnext/assessments/me?limit=20" > "/tmp/${NAME}-assessments-before.json"
curl -fsS -b "$ALUNO_JAR" "$BASE/api/vnext/athlete-360/me" > "/tmp/${NAME}-athlete360-assessments.json"
python3 - <<PY
import json
t1=json.load(open('/tmp/${NAME}-assessment-template-anam.json'))['template']
t2=json.load(open('/tmp/${NAME}-assessment-template-physical.json'))['template']
h=json.load(open('/tmp/${NAME}-assessments-before.json'))
a=json.load(open('/tmp/${NAME}-athlete360-assessments.json'))['athlete']
assert t1['version']==1 and t2['version']==1, (t1,t2)
assert h['summary']['assessment_count']==2, h
assert h['summary']['assessment_data_consent']=='granted', h
assert h['summary']['ai_coach_allowed'] is True, h
assert len(h['records'])==2, h
assert a['assessments']['assessment_count']==2, a
assert a['assessments']['physical_count']==1, a
assert a['privacy']['raw_anamnesis_in_snapshot'] is False, a
assert a['privacy']['clinical_inference'] is False, a
print('OK #92 P0: templates + consent + anamnese + físico + Athlete 360 sanitizado')
PY

stop_api
start_api
curl -fsS -b "$ALUNO_JAR" "$BASE/api/mvp-24/my-workouts" > "/tmp/${NAME}-my-workouts-after.json"
curl -fsS -b "$OWNER_JAR" "$BASE/api/mvp-22/users" > "/tmp/${NAME}-users-after.json"
curl -fsS -b "$ALUNO_JAR" "$BASE/api/vnext/athlete-360/me" > "/tmp/${NAME}-athlete360-after.json"
curl -fsS -b "$ALUNO_JAR" "$BASE/api/vnext/assessments/me?limit=20" > "/tmp/${NAME}-assessments-after.json"
curl -fsS -b "$PROF_JAR" "$BASE/api/vnext/workout-builder/workouts/$PRESCRIPTION_ID/versions" > "/tmp/${NAME}-builder-after.json"
python3 - <<PY
import json
workouts=json.load(open('/tmp/${NAME}-my-workouts-after.json'))
users=json.load(open('/tmp/${NAME}-users-after.json'))
athlete=json.load(open('/tmp/${NAME}-athlete360-after.json'))['athlete']
assess=json.load(open('/tmp/${NAME}-assessments-after.json'))
builder=json.load(open('/tmp/${NAME}-builder-after.json'))
items=workouts.get('prescriptions') or []
assert len(items)==1 and items[0]['id']=='$PRESCRIPTION_ID', workouts
assert users.get('total_users')==3, users
assert athlete['student_id']=='$STUDENT_ID' and len(athlete['goals'])==1, athlete
assert athlete['assessments']['assessment_count']==2, athlete
assert assess['summary']['assessment_count']==2 and len(assess['records'])==2, assess
assert assess['summary']['ai_coach_allowed'] is True, assess
assert builder['versions'][0]['state']=='published', builder
assert builder['published_version_id']=='$BUILDER_VERSION_ID', builder
print('OK dados, sessões, Athlete 360, assessments e Workout Builder sobreviveram ao restart')
PY

TENANT_ID="$(python3 -c "import json; print(json.load(open('/tmp/${NAME}-onboarding.json'))['tenant']['id'])")"
COUNTS="$(docker exec "$NAME" psql -U postgres -d "$DB" -X -A -t -q -c "SELECT jsonb_build_object('users',(SELECT count(*) FROM fitcore_users WHERE tenant_id='$TENANT_ID'),'students',(SELECT count(*) FROM fitcore_students WHERE tenant_id='$TENANT_ID'),'workouts',(SELECT count(*) FROM fitcore_workouts WHERE tenant_id='$TENANT_ID'),'athlete_goals',(SELECT count(*) FROM fitcore_athlete_goals WHERE tenant_id='$TENANT_ID'),'assessment_templates',(SELECT count(*) FROM fitcore_assessment_templates WHERE tenant_id='$TENANT_ID'),'assessment_consents',(SELECT count(*) FROM fitcore_assessment_consents WHERE tenant_id='$TENANT_ID'),'assessments',(SELECT count(*) FROM fitcore_assessments WHERE tenant_id='$TENANT_ID'),'assessment_measurements',(SELECT count(*) FROM fitcore_assessment_measurements WHERE tenant_id='$TENANT_ID'),'builder_versions',(SELECT count(*) FROM fitcore_workout_builder_versions WHERE tenant_id='$TENANT_ID'),'builder_templates',(SELECT count(*) FROM fitcore_workout_templates WHERE tenant_id='$TENANT_ID'),'builder_protocols',(SELECT count(*) FROM fitcore_workout_protocols WHERE tenant_id='$TENANT_ID'),'builder_days',(SELECT count(*) FROM fitcore_workout_days WHERE tenant_id='$TENANT_ID' AND workout_id='$PRESCRIPTION_ID'),'builder_blocks',(SELECT count(*) FROM fitcore_workout_blocks WHERE tenant_id='$TENANT_ID'),'builder_exercises',(SELECT count(*) FROM fitcore_workout_exercises WHERE tenant_id='$TENANT_ID'))::text")"
python3 - <<PY
import json
j=json.loads('''$COUNTS''')
assert j['users']==3, j
assert j['students']==1, j
assert j['workouts']>=1, j
assert j['athlete_goals']==1, j
assert j['assessment_templates']==2, j
assert j['assessment_consents']==2, j
assert j['assessments']==2, j
assert j['assessment_measurements']==2, j
assert j['builder_versions']>=2, j
assert j['builder_templates']==1, j
assert j['builder_protocols']==1, j
assert j['builder_days']==2, j
assert j['builder_blocks']>=2, j
assert j['builder_exercises']>=3, j
print('OK PostgreSQL canônico + Athlete 360 + Assessments #92 + Workout Builder #93:', j)
PY

echo "P0 E2E aprovado: cadastro → gestor → professor → aluno → treino → Builder VNext/publish/template/clone → Athlete 360 → anamnese/avaliação → restart → persistência."
