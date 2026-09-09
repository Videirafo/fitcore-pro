#!/usr/bin/env bash
set -Eeuo pipefail
cd /opt/fitcore-pro
BASE="${FITCORE_PUBLIC_URL:-https://fitcore.marcaia.app}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)-$RANDOM"

echo "MVP-31 — verificando setup guiado pós-criação do negócio"
bash infra/scripts/apply-mvp-31-guided-setup.sh >/tmp/mvp31-apply.log
node --check services/api/security/guided-setup.mjs
node --check services/api/security/tenant-user-management.mjs
node --check services/api/server.mjs
npm run site:next:check
npm run mvp28:check
npm run mvp29:check
npm run mvp30:check
npm run mvp31:check
npm run site:next:build >/tmp/mvp31-next-build.log
echo "OK: contratos, sintaxe e build Next validados."

systemctl restart fitcore-api
systemctl restart fitcore-next
sleep 2
systemctl is-active --quiet fitcore-api && echo "OK: fitcore-api ativa."
systemctl is-active --quiet fitcore-next && echo "OK: fitcore-next ativo."

curl -fsS "$BASE/api/mvp-31/status" | grep -q '"enabled": true'
for path in / /setup /login /onboarding /equipe /alunos /treinos /execucao /evolucao /convite; do
  curl -fsSI "$BASE$path" | grep -q "x-fitcore-shell: next-shell" || { echo "ERRO: rota sem Next shell: $path" >&2; exit 1; }
  echo "OK: rota Next publicada: $path"
done

bash infra/scripts/verify-mvp-26-student-evolution.sh >/tmp/mvp31-mvp26-setup.log
tail -24 /tmp/mvp31-mvp26-setup.log
SLUG="$(python3 -c "import json; print(json.load(open('/tmp/mvp24-onboarding.json'))['tenant']['slug'])")"
echo "OK: cenário real completo criado pelos gates anteriores."

curl -fsS -b /tmp/fitcore-mvp24-owner.cookie "$BASE/api/mvp-31/setup" > /tmp/mvp31-setup-final.json
python3 - <<'PY'
import json
j=json.load(open('/tmp/mvp31-setup-final.json'))
assert j['setup_guided'] is True, j
assert j['progress_percent'] == 100, j
assert j['all_done'] is True, j
assert set(j['completed_steps']) >= {'professor','student','prescription','execution','evolution'}, j
assert j['persisted']['saved'] is True, j
PY
echo "OK: setup chegou a 100% e progresso ficou salvo por tenant."

curl -fsS -b /tmp/fitcore-mvp24-owner.cookie -H "content-type: application/json" \
  -d "{\"nome\":\"Convidado MVP31\",\"papel\":\"aluno\",\"login_identifier\":\"convite.mvp31.$STAMP\"}" \
  "$BASE/api/mvp-22/users/invite" > /tmp/mvp31-invite.json
INVITE_URL="$(python3 -c "import json; print(json.load(open('/tmp/mvp31-invite.json'))['invite']['full_invite_url'])")"
case "$INVITE_URL" in *"/convite"*) echo "OK: convite aponta para rota Next /convite." ;; *) echo "ERRO: convite não aponta para /convite: $INVITE_URL" >&2; exit 1 ;; esac

set -a
. storage/secrets/fitcore-postgres.env
set +a
DB_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:55435/${POSTGRES_DB}?sslmode=disable"
psql "$DB_URL" -X -A -t -q -c "
WITH tenant AS (SELECT id FROM fitcore_tenants WHERE slug = '$SLUG')
SELECT jsonb_build_object(
 'progress', (SELECT count(*) FROM fitcore_tenant_setup_progress WHERE tenant_id=(SELECT id FROM tenant)),
 'events', (SELECT count(*) FROM fitcore_tenant_setup_events WHERE tenant_id=(SELECT id FROM tenant)),
 'audit', (SELECT count(*) FROM fitcore_audit_events WHERE tenant_id=(SELECT id FROM tenant) AND recurso_tipo='tenant_setup')
)::text;
" > /tmp/mvp31-db-counts.json
cat /tmp/mvp31-db-counts.json
python3 - <<'PY'
import json
j=json.load(open('/tmp/mvp31-db-counts.json'))
assert j['progress'] >= 1, j
assert j['audit'] >= 1, j
PY
echo "OK: progresso e auditoria persistidos no PostgreSQL."
echo "MVP-31 verificado: setup guiado pós-criação, etapas reais, progresso por tenant, dashboard e convite Next ativos."
