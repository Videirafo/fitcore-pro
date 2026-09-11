#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

BASE="${FITCORE_PUBLIC_URL:-https://fitcore.marcaia.app}"
source "$ROOT/infra/scripts/lib/require-safe-test-target.sh"
fitcore_require_safe_test_target "$BASE"
STAMP="$(date +%s)-$RANDOM"
SLUG="mvp22-$STAMP"
OWNER_LOGIN="owner-$STAMP"
OWNER_SECRET="FitCore#MVP22-$RANDOM"
PROF_LOGIN="prof-$STAMP"
PROF_SECRET="FitCore#Prof22-$RANDOM"
ALUNO_LOGIN="aluno-$STAMP"
ALUNO_SECRET="FitCore#Aluno22-$RANDOM"
OWNER_JAR="/tmp/fitcore-mvp22-owner.cookie"
PROF_JAR="/tmp/fitcore-mvp22-prof.cookie"
ALUNO_JAR="/tmp/fitcore-mvp22-aluno.cookie"
rm -f "$OWNER_JAR" "$PROF_JAR" "$ALUNO_JAR"

echo "MVP-22 — verificando gestão real de usuários por tenant"
node --check services/api/security/tenant-user-management.mjs
node --check services/api/security/credential-auth.mjs
node --check services/api/security/signed-session.mjs
node --check services/api/security/navigation-rbac.mjs
node --check services/api/server.mjs
node --check apps/site-static/mvp-22.js
node tools/check-front-assets.mjs
node tools/check-next-app.mjs
echo "OK: sintaxe, CSS/JS estático e contrato Next validados."
curl -fsS "$BASE/api/mvp-22/status" | grep -q '"enabled": true'
curl -fsS "$BASE/api/mvp-22/status" | grep -q '"cross_tenant_block": true'
echo "OK: MVP-22 ativo."

curl -fsS -c "$OWNER_JAR" -H 'content-type: application/json' \
  -d "{\"business_name\":\"Academia MVP22 $STAMP\",\"business_type\":\"academia\",\"slug\":\"$SLUG\",\"owner_name\":\"Gestor MVP22\",\"login_identifier\":\"$OWNER_LOGIN\",\"secret\":\"$OWNER_SECRET\",\"professor_nome\":\"Professor Inicial MVP22\",\"aluno_nome\":\"Aluno Inicial MVP22\"}" \
  "$BASE/api/mvp-21/onboarding" > /tmp/mvp22-onboarding.json
python3 - <<'PY'
import json
j=json.load(open('/tmp/mvp22-onboarding.json'))
assert j['tenant']['slug'].startswith('mvp22-'), j
assert j['session']['actor_role']=='gestor', j
PY
echo "OK: tenant novo criado com gestor proprietário."

curl -fsS -b "$OWNER_JAR" "$BASE/api/mvp-22/users" > /tmp/mvp22-users-before.json
python3 - <<'PY'
import json
j=json.load(open('/tmp/mvp22-users-before.json'))
assert j['total_users'] >= 3, j
assert j['tenant_slug'].startswith('mvp22-'), j
PY
echo "OK: listagem inicial do tenant carregada."
curl -fsS -b "$OWNER_JAR" -H 'content-type: application/json' \
  -d "{\"nome\":\"Professor Direto MVP22\",\"papel\":\"professor\",\"login_identifier\":\"$PROF_LOGIN\",\"secret\":\"$PROF_SECRET\"}" \
  "$BASE/api/mvp-22/users" > /tmp/mvp22-prof-created.json
python3 - <<'PY'
import json
j=json.load(open('/tmp/mvp22-prof-created.json'))
assert j['user']['papel']=='professor', j
assert j['user']['credential_set'] is True, j
PY
echo "OK: gestor criou professor com credencial no próprio tenant."

curl -fsS -c "$PROF_JAR" -H "x-fitcore-rate-test: mvp22-prof-$STAMP" -H 'content-type: application/json' \
  -d "{\"tenant_slug\":\"$SLUG\",\"login_identifier\":\"$PROF_LOGIN\",\"secret\":\"$PROF_SECRET\"}" \
  "$BASE/api/mvp-19/login" > /tmp/mvp22-prof-login.json
curl -fsS -b "$PROF_JAR" "$BASE/api/mvp-15/session" | grep -q '"actor_role": "professor"'
curl -fsS -b "$PROF_JAR" "$BASE/api/mvp-15/session" | grep -q "\"tenant_slug\": \"$SLUG\""
echo "OK: professor entra por credencial usando tenant_slug."

curl -fsS -b "$OWNER_JAR" -H 'content-type: application/json' \
  -d "{\"nome\":\"Aluno Convite MVP22\",\"papel\":\"aluno\",\"login_identifier\":\"$ALUNO_LOGIN\"}" \
  "$BASE/api/mvp-22/users/invite" > /tmp/mvp22-invite.json
TOKEN=$(python3 - <<'PY'
import json
print(json.load(open('/tmp/mvp22-invite.json'))['token'])
PY
)
[ -n "$TOKEN" ] || { echo "ERRO: convite sem token"; exit 1; }
curl -fsS "$BASE/api/mvp-22/invites/inspect?tenant_slug=$SLUG&token=$TOKEN" | grep -q '"can_accept": true'
echo "OK: convite carrega tenant_slug e pode ser inspecionado."

curl -fsS -c "$ALUNO_JAR" -H 'content-type: application/json' \
  -d "{\"tenant_slug\":\"$SLUG\",\"token\":\"$TOKEN\",\"nome\":\"Aluno Aceito MVP22\",\"login_identifier\":\"$ALUNO_LOGIN\",\"secret\":\"$ALUNO_SECRET\"}" \
  "$BASE/api/mvp-22/invites/accept" > /tmp/mvp22-accept.json
curl -fsS -b "$ALUNO_JAR" "$BASE/api/mvp-15/session" | grep -q '"actor_role": "aluno"'
curl -fsS -b "$ALUNO_JAR" "$BASE/api/mvp-15/session" | grep -q "\"tenant_slug\": \"$SLUG\""
echo "OK: aluno aceitou convite, definiu credencial e entrou no tenant correto."

curl -fsS -c /tmp/fitcore-mvp22-aluno-login.cookie -H "x-fitcore-rate-test: mvp22-aluno-$STAMP" -H 'content-type: application/json' \
  -d "{\"tenant_slug\":\"$SLUG\",\"login_identifier\":\"$ALUNO_LOGIN\",\"secret\":\"$ALUNO_SECRET\"}" \
  "$BASE/api/mvp-19/login" | grep -q '"credential_login": true'
echo "OK: login posterior por credencial funciona fora do demo."
HTTP_CROSS=$(curl -s -o /tmp/mvp22-cross.json -w "%{http_code}" -b "$OWNER_JAR" "$BASE/api/mvp-22/users?tenant_slug=demo")
[ "$HTTP_CROSS" = "403" ] || { echo "ERRO: acesso cruzado deveria retornar 403, retornou $HTTP_CROSS"; cat /tmp/mvp22-cross.json; exit 1; }
echo "OK: bloqueio de acesso cruzado por tenant validado."

curl -fsS -b "$OWNER_JAR" -H 'content-type: application/json' \
  -d "{\"aluno_nome\":\"Aluno Operacional MVP22\",\"objetivo\":\"saude\",\"nivel\":\"iniciante\",\"modalidade\":\"academia\",\"foco\":\"completo\",\"dias_semana\":3}" \
  "$BASE/api/mvp-01/aluno-treino" > /tmp/mvp22-workout.json
echo "OK: rota operacional gravou com sessão do tenant."

set -a
# shellcheck disable=SC1091
. storage/secrets/fitcore-postgres.env
set +a
DB_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:55435/${POSTGRES_DB}?sslmode=disable"
TENANT_ID=$(python3 - <<'PY'
import json
print(json.load(open('/tmp/mvp22-onboarding.json'))['tenant']['id'])
PY
)
COUNTS=$(psql "$DB_URL" -X -A -t -q -c "WITH scope AS (SELECT set_config('app.tenant_id','$TENANT_ID',true)) SELECT jsonb_build_object('users',(SELECT count(*) FROM fitcore_users WHERE tenant_id='$TENANT_ID'),'invites',(SELECT count(*) FROM fitcore_user_invites WHERE tenant_id='$TENANT_ID'),'events',(SELECT count(*) FROM fitcore_tenant_user_events WHERE tenant_id='$TENANT_ID'),'audit',(SELECT count(*) FROM fitcore_audit_events WHERE tenant_id='$TENANT_ID'),'workouts',(SELECT count(*) FROM fitcore_workouts WHERE tenant_id='$TENANT_ID'))::text FROM scope;")
printf '%s' "$COUNTS" > /tmp/mvp22-counts.json
python3 - <<'PY'
import json
j=json.load(open('/tmp/mvp22-counts.json'))
assert j['users'] >= 5, j
assert j['invites'] >= 1, j
assert j['events'] >= 2, j
assert j['audit'] >= 5, j
assert j['workouts'] >= 1, j
print(json.dumps(j, indent=2))
PY
echo "OK: auditoria/listagem/dados por tenant persistidos no PostgreSQL."

curl -fsS "$BASE/api/health" | grep -q '"mvp_22"'
curl -fsSI "$BASE/mvp-22.html" | grep -q "HTTP/2 200"
curl -fsSL "$BASE/" | grep -q '/mvp-22.html'
echo "OK: health, home e /mvp-22.html publicados."

echo "MVP-22 verificado: gestão real de usuários por tenant, convite com tenant_slug, credencial, bloqueio cruzado, auditoria e front Next-ready ativos."
