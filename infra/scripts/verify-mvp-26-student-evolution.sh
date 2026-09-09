#!/usr/bin/env bash
set -euo pipefail
cd /opt/fitcore-pro
BASE="${FITCORE_PUBLIC_URL:-https://fitcore.marcaia.app}"

echo "MVP-26 — verificando histórico e evolução do aluno"
node --check services/api/security/student-evolution.mjs
node --check services/api/security/workout-execution.mjs
node --check services/api/security/signed-session.mjs
node --check services/api/server.mjs
node --check apps/site-static/mvp-26.js
node tools/check-front-assets.mjs
node tools/check-next-app.mjs
curl -fsS "$BASE/api/mvp-26/status" | grep -q '"enabled": true'
curl -fsS "$BASE/api/mvp-26/status" | grep -q '"weekly_frequency": true'
echo "OK: MVP-26 ativo e contratos validados."

bash infra/scripts/verify-mvp-25-workout-execution.sh >/tmp/mvp26-setup.log
tail -18 /tmp/mvp26-setup.log
STUDENT_ID="$(python3 -c "import json; print(json.load(open('/tmp/mvp24-student.json'))['student']['id'])")"
OTHER_STUDENT_ID="$(python3 -c "import json; print(json.load(open('/tmp/mvp24-other-student.json'))['student']['id'])")"
SLUG="$(python3 -c "import json; print(json.load(open('/tmp/mvp24-onboarding.json'))['tenant']['slug'])")"
echo "OK: cenário real com aluno, treino aprovado e execução concluída criado."

curl -fsS -b /tmp/fitcore-mvp24-aluno.cookie "$BASE/api/mvp-26/my-evolution" > /tmp/mvp26-my.json
python3 - <<'PY'
import json
j=json.load(open('/tmp/mvp26-my.json'))
s=j['student']
assert j['own_only'] is True, j
assert s['total_executions'] >= 1, j
assert s['completed_executions'] >= 1, j
assert s['average_effort'] is not None, j
assert s['weekly_frequency'] >= 1, j
assert len(j['history']) >= 1, j
PY
echo "OK: aluno vê histórico, esforço médio e frequência semanal próprios."

curl -fsS -b /tmp/fitcore-mvp24-prof.cookie "$BASE/api/mvp-26/students/$STUDENT_ID/evolution" > /tmp/mvp26-prof-student.json
python3 - <<'PY'
import json
j=json.load(open('/tmp/mvp26-prof-student.json'))
assert j['student']['total_executions'] >= 1, j
assert len(j['by_workout']) >= 1, j
assert j['student']['progress_percent'] >= 1, j
PY
echo "OK: professor acompanha progresso do aluno responsável."

curl -fsS -b /tmp/fitcore-mvp24-owner.cookie "$BASE/api/mvp-26/evolution?limit=20" > /tmp/mvp26-tenant.json
python3 - <<'PY'
import json
j=json.load(open('/tmp/mvp26-tenant.json'))
assert j['summary']['students'] >= 1, j
assert j['summary']['executions'] >= 1, j
assert len(j['students']) >= 1, j
assert len(j['weekly']) >= 1, j
PY
echo "OK: gestor vê painel do tenant com tabelas e gráfico semanal."

HTTP_CODE="$(curl -sS -o /tmp/mvp26-cross.json -w '%{http_code}' -b /tmp/fitcore-mvp24-owner.cookie "$BASE/api/mvp-26/evolution?tenant_slug=tenant-indevido")"
if [[ "$HTTP_CODE" != "403" ]]; then
  echo "ERRO: acesso cruzado deveria retornar 403, retornou $HTTP_CODE" >&2
  cat /tmp/mvp26-cross.json >&2 || true
  exit 1
fi
echo "OK: bloqueio de acesso cruzado por tenant validado."

HTTP_CODE="$(curl -sS -o /tmp/mvp26-other.json -w '%{http_code}' -b /tmp/fitcore-mvp24-other.cookie "$BASE/api/mvp-26/students/$STUDENT_ID/evolution")"
if [[ "$HTTP_CODE" != "404" && "$HTTP_CODE" != "403" ]]; then
  echo "ERRO: outro aluno não deveria ver evolução do aluno principal, retornou $HTTP_CODE" >&2
  cat /tmp/mvp26-other.json >&2 || true
  exit 1
fi
echo "OK: aluno não vê evolução de outro aluno."

source storage/secrets/fitcore-postgres.env
export PGPASSWORD="$POSTGRES_PASSWORD"
psql -h 127.0.0.1 -p 55435 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -X -A -t -c "
SELECT json_build_object(
 'evolution_events', (SELECT count(*) FROM fitcore_student_evolution_events WHERE tenant_id=(SELECT id FROM fitcore_tenants WHERE slug='$SLUG')),
 'audit', (SELECT count(*) FROM fitcore_audit_events WHERE tenant_id=(SELECT id FROM fitcore_tenants WHERE slug='$SLUG') AND recurso_tipo='student_evolution'),
 'executions', (SELECT count(*) FROM fitcore_workout_executions WHERE tenant_id=(SELECT id FROM fitcore_tenants WHERE slug='$SLUG'))
)::text;
" > /tmp/mvp26-counts.json
cat /tmp/mvp26-counts.json
python3 - <<'PY'
import json
j=json.load(open('/tmp/mvp26-counts.json'))
assert j['evolution_events'] >= 3, j
assert j['audit'] >= 3, j
assert j['executions'] >= 1, j
PY
echo "OK: métricas e auditoria por tenant persistidas no PostgreSQL."

curl -fsSI "$BASE/" | grep -E 'HTTP/2 200|x-fitcore-shell|x-fitcore-engine'
curl -fsSI "$BASE/mvp-26.html" | grep -E 'HTTP/2 200|x-fitcore-shell|x-fitcore-engine'
curl -fsS "$BASE/evolucao" | grep -q '__next'
curl -fsS "$BASE/mvp-26.html" | grep -q '/mvp-26.js'
curl -fsS "$BASE/fitcore-system.css" | grep -q 'fc-kpi-grid'
echo "OK: evolução publicada em Next e legado /mvp-26.html preservado."
echo "MVP-26 verificado: histórico, evolução, esforço médio, frequência semanal, painel do professor, gráficos/tabelas e auditoria por tenant ativos."
