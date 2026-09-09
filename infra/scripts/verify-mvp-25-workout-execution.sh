#!/usr/bin/env bash
set -euo pipefail
cd /opt/fitcore-pro
BASE="${FITCORE_PUBLIC_URL:-https://fitcore.marcaia.app}"

echo "MVP-25 — verificando execução real do treino pelo aluno"
node --check services/api/security/workout-execution.mjs
node --check services/api/security/workout-prescription.mjs
node --check services/api/security/signed-session.mjs
node --check services/api/server.mjs
node --check apps/site-static/mvp-25.js
node tools/check-front-assets.mjs
node tools/check-next-app.mjs
echo "OK: sintaxe, CSS/JS e contrato Next validados."

curl -fsS "$BASE/api/mvp-25/status" | grep -q '"enabled": true'
curl -fsS "$BASE/api/mvp-25/status" | grep -q '"exercise_progress": true'
echo "OK: MVP-25 ativo."

bash infra/scripts/verify-mvp-24-workout-prescription.sh >/tmp/mvp25-setup.log
tail -20 /tmp/mvp25-setup.log
WORKOUT_ID=$(python3 -c "import json; print(json.load(open('/tmp/mvp24-review.json'))['prescription']['id'])")
SLUG=$(python3 -c "import json; print(json.load(open('/tmp/mvp24-onboarding.json'))['tenant']['slug'])")
echo "OK: cenário com tenant, aluno real, professor e treino aprovado criado."
curl -fsS -b /tmp/fitcore-mvp24-aluno.cookie -H 'content-type: application/json' \
  -d "{\"workout_id\":\"$WORKOUT_ID\",\"observacoes\":\"iniciado pelo smoke MVP25\"}" \
  "$BASE/api/mvp-25/executions/start" > /tmp/mvp25-start.json
EXECUTION_ID=$(python3 -c "import json; j=json.load(open('/tmp/mvp25-start.json')); assert j['execution']['status']=='em_execucao', j; assert j['execution']['exercicios_total']>=3, j; print(j['execution']['id'])")
echo "OK: aluno iniciou treino aprovado."

curl -fsS -b /tmp/fitcore-mvp24-aluno.cookie -H 'content-type: application/json' \
  -d '{"observacao":"execução controlada"}' \
  "$BASE/api/mvp-25/executions/$EXECUTION_ID/exercises/0/done" > /tmp/mvp25-done0.json
curl -fsS -b /tmp/fitcore-mvp24-aluno.cookie -H 'content-type: application/json' \
  -d '{"observacao":"sem dor"}' \
  "$BASE/api/mvp-25/executions/$EXECUTION_ID/exercises/1/done" > /tmp/mvp25-done1.json
python3 -c "import json; j=json.load(open('/tmp/mvp25-done1.json')); assert j['execution']['exercicios_feitos'] >= 2, j; assert j['execution']['status']=='em_execucao', j"
echo "OK: aluno marcou exercícios como feitos."

curl -fsS -b /tmp/fitcore-mvp24-aluno.cookie -H 'content-type: application/json' \
  -d '{"percepcao_esforco":8,"duracao_minutos":47,"observacoes":"Treino concluído no smoke MVP-25."}' \
  "$BASE/api/mvp-25/executions/$EXECUTION_ID/finish" > /tmp/mvp25-finish.json
python3 -c "import json; j=json.load(open('/tmp/mvp25-finish.json')); e=j['execution']; assert e['status']=='concluido', j; assert e['percepcao_esforco']==8, j; assert e['duracao_minutos']==47, j"
echo "OK: aluno registrou esforço/duração e concluiu treino."
curl -fsS -b /tmp/fitcore-mvp24-prof.cookie "$BASE/api/mvp-25/executions?limit=20" > /tmp/mvp25-staff-executions.json
python3 -c "import json; j=json.load(open('/tmp/mvp25-staff-executions.json')); assert j['total'] >= 1, j; assert any(x['id'] for x in j['executions']), j"
echo "OK: professor/gestor acompanha execução no tenant."

OTHER_CODE_HTTP=$(curl -sS -o /tmp/mvp25-other-get.json -w '%{http_code}' -b /tmp/fitcore-mvp24-other.cookie "$BASE/api/mvp-25/executions/$EXECUTION_ID")
if [[ "$OTHER_CODE_HTTP" != "404" && "$OTHER_CODE_HTTP" != "403" ]]; then
  echo "ERRO: outro aluno acessou execução alheia: HTTP $OTHER_CODE_HTTP" >&2
  cat /tmp/mvp25-other-get.json >&2 || true
  exit 1
fi
echo "OK: outro aluno não vê execução que não pertence a ele."

CROSS_CODE=$(curl -sS -o /tmp/mvp25-cross.json -w '%{http_code}' -b /tmp/fitcore-mvp24-prof.cookie "$BASE/api/mvp-25/executions?tenant_slug=tenant-invalido")
if [[ "$CROSS_CODE" != "403" ]]; then
  echo "ERRO: acesso cruzado deveria retornar 403, retornou $CROSS_CODE" >&2
  cat /tmp/mvp25-cross.json >&2 || true
  exit 1
fi
echo "OK: bloqueio de acesso cruzado por tenant validado."
set -a
. storage/secrets/fitcore-postgres.env
set +a
DB_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:55435/${POSTGRES_DB}?sslmode=disable"
psql "$DB_URL" -X -A -t -q -c "
WITH tenant AS (SELECT id FROM fitcore_tenants WHERE slug = '$SLUG')
SELECT jsonb_build_object(
  'executions', (SELECT count(*) FROM fitcore_workout_executions WHERE tenant_id = (SELECT id FROM tenant)),
  'events', (SELECT count(*) FROM fitcore_workout_execution_events WHERE tenant_id = (SELECT id FROM tenant)),
  'audit', (SELECT count(*) FROM fitcore_audit_events WHERE tenant_id = (SELECT id FROM tenant))
)::text;
" > /tmp/mvp25-db-counts.json
cat /tmp/mvp25-db-counts.json
python3 -c "import json; j=json.load(open('/tmp/mvp25-db-counts.json')); assert j['executions'] >= 1, j; assert j['events'] >= 3, j; assert j['audit'] >= 3, j"
echo "OK: execução e auditoria por tenant persistidas no PostgreSQL."

curl -fsSI "$BASE/" | grep -E "HTTP/2 200|x-fitcore-shell|x-fitcore-engine"
curl -fsSI "$BASE/mvp-25.html" | grep -E "HTTP/2 200|x-fitcore-shell|x-fitcore-engine"
echo "OK: execução publicada e legado /mvp-25.html preservado."
echo "MVP-25 verificado: execução real do treino pelo aluno, progresso por exercício, esforço/duração, acompanhamento e auditoria ativos."
