#!/usr/bin/env bash
set -euo pipefail
cd /opt/fitcore-pro
BASE="${FITCORE_PUBLIC_URL:-https://fitcore.marcaia.app}"
JAR_ONBOARD="/tmp/fitcore-mvp21-onboard.cookie"
JAR_LOGIN="/tmp/fitcore-mvp21-login.cookie"
rm -f "$JAR_ONBOARD" "$JAR_LOGIN"

echo "MVP-21 — verificando onboarding real do tenant"
node --check services/api/security/tenant-onboarding.mjs
node --check services/api/security/signed-session.mjs
node --check services/api/security/credential-auth.mjs
node --check services/api/persistence/server-adapter-glue.mjs
node --check services/api/server.mjs
node --check apps/site-static/mvp-19.js
node --check apps/site-static/mvp-21.js
echo "OK: sintaxe validada."

curl -fsS "$BASE/api/mvp-21/status" | grep -q '"enabled": true'
curl -fsS "$BASE/api/mvp-21/status" | grep -q '"demo_is_no_longer_only_flow": true'
echo "OK: MVP-21 ativo e demo não é mais fluxo único."

STAMP="$(date +%Y%m%d%H%M%S)-$RANDOM"
SLUG="fitcore-v21-$STAMP"
LOGIN_ID="gestor-$SLUG"
SECRET="FitCore#Tenant21-$RANDOM-$STAMP"
cat > /tmp/mvp21-onboarding.json <<JSON
{
  "business_name": "Academia MVP-21 $STAMP",
  "business_type": "academia",
  "slug": "$SLUG",
  "owner_name": "Gestor MVP-21",
  "login_identifier": "$LOGIN_ID",
  "secret": "$SECRET",
  "professor_nome": "Professor MVP-21",
  "aluno_nome": "Aluno MVP-21"
}
JSON

curl -fsS -c "$JAR_ONBOARD" -H 'content-type: application/json' \
  -d @/tmp/mvp21-onboarding.json "$BASE/api/mvp-21/onboarding" > /tmp/mvp21-created.json
python3 - <<'PY'
import json, sys
payload=json.load(open('/tmp/mvp21-created.json'))
assert payload['ok'] is True
assert payload['tenant']['slug'].startswith('fitcore-v21-')
assert payload['tenant']['internal_domain'].endswith('.fitcore.local')
assert payload['owner']['papel']=='gestor'
assert payload['first_professor']['papel']=='professor'
assert payload['first_student_user']['papel']=='aluno'
PY
echo "OK: tenant, domínio interno, gestor, professor e aluno criados."

curl -fsS -b "$JAR_ONBOARD" "$BASE/api/mvp-15/session" | grep -q '"login_source": "mvp21_onboarding"'
curl -fsS -b "$JAR_ONBOARD" "$BASE/api/mvp-15/session" | grep -q "\"tenant_slug\": \"$SLUG\""
echo "OK: sessão assinada aponta para o tenant novo."

curl -fsS -b "$JAR_ONBOARD" "$BASE/api/mvp-21/tenant" | grep -q "\"slug\": \"$SLUG\""
echo "OK: endpoint do tenant atual lê dados do tenant novo."

curl -fsS -b "$JAR_ONBOARD" -H 'content-type: application/json' -d '{}' "$BASE/api/mvp-15/session/logout" >/tmp/mvp21-logout.json
python3 - <<PY > /tmp/mvp21-login-body.json
import json
print(json.dumps({"tenant_slug":"$SLUG","login_identifier":"$LOGIN_ID","secret":"$SECRET"}))
PY
curl -fsS -c "$JAR_LOGIN" -H 'content-type: application/json' \
  -d @/tmp/mvp21-login-body.json "$BASE/api/mvp-19/login" > /tmp/mvp21-login.json
curl -fsS -b "$JAR_LOGIN" "$BASE/api/mvp-15/session" | grep -q '"login_source": "mvp19_credential"'
curl -fsS -b "$JAR_LOGIN" "$BASE/api/mvp-15/session" | grep -q "\"tenant_slug\": \"$SLUG\""
echo "OK: login por credencial funciona fora do tenant demo."

curl -fsS -b "$JAR_LOGIN" "$BASE/api/mvp-17/navigation" | grep -q '/mvp-21.html'
curl -fsS -b "$JAR_LOGIN" "$BASE/api/mvp-03/professor/contexto" >/tmp/mvp21-prof-context.json
echo "OK: navegação e rota operacional abrem com sessão do novo tenant."

curl -fsS -b "$JAR_LOGIN" -H 'content-type: application/json' \
  -d '{"aluno_nome":"Aluno Tenant MVP-21","objetivo":"saude","nivel":"iniciante","modalidade":"academia","foco":"completo","dias_semana":2}' \
  "$BASE/api/mvp-01/aluno-treino" > /tmp/mvp21-workout.json
WORKOUT_ID=$(python3 -c "import json; print(json.load(open('/tmp/mvp21-workout.json'))['id'])")
[ -n "$WORKOUT_ID" ] || { echo "ERRO: treino do tenant não criado"; exit 1; }
echo "OK: criação operacional via API autenticada funcionou."

DB_URL=$(systemctl cat fitcore-api 2>/dev/null | grep -o 'FITCORE_DATABASE_URL=[^" ]*' | tail -1 | cut -d= -f2-)
[ -n "$DB_URL" ] || { echo "ERRO: FITCORE_DATABASE_URL ausente no systemd"; exit 1; }
TENANT_DB_CHECK=$(psql "$DB_URL" -X -A -t -q -v ON_ERROR_STOP=1 -c "WITH t AS (SELECT id FROM fitcore_tenants WHERE slug='$SLUG'), scope AS (SELECT set_config('app.tenant_id',(SELECT id::text FROM t),true)) SELECT jsonb_build_object('users',(SELECT count(*) FROM fitcore_users WHERE tenant_id=(SELECT id FROM t)),'students',(SELECT count(*) FROM fitcore_students WHERE tenant_id=(SELECT id FROM t)),'workouts',(SELECT count(*) FROM fitcore_workouts WHERE tenant_id=(SELECT id FROM t)),'audit',(SELECT count(*) FROM fitcore_audit_events WHERE tenant_id=(SELECT id FROM t) AND acao IN ('tenant_onboarded','owner_created','first_professor_created','first_student_created','postgres_store_upsert')),'security',(SELECT count(*) FROM fitcore_security_events WHERE tenant_id=(SELECT id FROM t)))::text FROM scope;")
printf '%s\n' "$TENANT_DB_CHECK" > /tmp/mvp21-db-check.json
python3 - <<'PY'
import json
payload=json.load(open('/tmp/mvp21-db-check.json'))
assert payload['users'] >= 3, payload
assert payload['students'] >= 2, payload
assert payload['workouts'] >= 1, payload
assert payload['audit'] >= 4, payload
assert payload['security'] >= 1, payload
print(json.dumps(payload, indent=2, ensure_ascii=False))
PY
echo "OK: dados gravados no PostgreSQL usando tenant_id do tenant novo."

curl -fsS "$BASE/api/health" | grep -q '"mvp_21"'
curl -fsSL "$BASE/" | grep -q '/mvp-21.html'
curl -fsSI "$BASE/mvp-21.html" | grep -q 'HTTP/2 200'
echo "OK: health, home e /mvp-21.html publicados."

echo "MVP-21 verificado: onboarding real cria tenant, gestor, professor, aluno, sessão, login fora do demo, RBAC e dados por tenant."
