#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NAME="fitcore-privacy-v11-${RANDOM}-$$"
PASS="fitcore-privacy"
DB="fitcore_privacy"
TENANT_A="30111111-1111-4111-8111-111111111111"
TENANT_B="30222222-2222-4222-8222-222222222222"
GESTOR_A="30aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

cleanup(){ docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --rm --name "$NAME"   -e POSTGRES_PASSWORD="$PASS"   -e POSTGRES_DB="$DB"   -p 127.0.0.1::5432 postgres:17.6-alpine >/dev/null

ready=0
for _ in $(seq 1 80); do
  if docker exec "$NAME" psql -U postgres -d "$DB" -Atqc 'select 1' 2>/dev/null | grep -qx 1; then
    ready=$((ready+1)); [[ "$ready" -ge 2 ]] && break
  else ready=0; fi
  sleep 0.4
done
[[ "$ready" -ge 2 ]] || { echo "ERRO: PostgreSQL 17.6 não ficou estável." >&2; exit 3; }

apply_sql(){ docker exec -i "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 < "$ROOT/$1" >/dev/null; }
apply_sql infra/sql/001-mvp-07-core.sql
apply_sql infra/sql/002-mvp-10-postgres-store.sql

docker exec -i "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fitcore_app') THEN
    CREATE ROLE fitcore_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
SQL

apply_sql infra/sql/030-privacy-audit-recovery.sql
apply_sql infra/sql/030-privacy-audit-recovery.sql

docker exec -i "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 <<SQL >/dev/null
INSERT INTO fitcore_tenants(id,slug,nome,status) VALUES
('$TENANT_A','privacy-a','Privacy A','teste'),
('$TENANT_B','privacy-b','Privacy B','teste');

INSERT INTO fitcore_users(id,tenant_id,nome,papel,ativo) VALUES
('$GESTOR_A','$TENANT_A','Gestor Privacy A','gestor',true);

INSERT INTO fitcore_privacy_requests(
  tenant_id,request_key,subject_ref,kind,status,requested_by
) VALUES (
  '$TENANT_A','req-001','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'access','received','$GESTOR_A'
);

INSERT INTO fitcore_retention_policies(
  tenant_id,dataset,retention_days,action,legal_hold,updated_by
) VALUES (
  '$TENANT_A','security_audit',30,'delete',true,'$GESTOR_A'
);

INSERT INTO fitcore_audit_events(
  tenant_id,actor_id,actor_role,recurso_tipo,acao,status,detalhe,criado_em
) VALUES (
  '$TENANT_A','$GESTOR_A','gestor','security_test','old_event','ok','sem payload pessoal',
  now()-interval '45 days'
);

GRANT SELECT ON fitcore_privacy_requests,fitcore_privacy_events,fitcore_retention_policies,fitcore_audit_events TO fitcore_app;
GRANT EXECUTE ON FUNCTION fitcore_audit_retention_purge(uuid,uuid) TO fitcore_app;
SQL

if docker exec "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -c   "UPDATE fitcore_audit_events SET status='changed' WHERE tenant_id='$TENANT_A'::uuid;"   >/tmp/fitcore-v11-audit-update.log 2>&1; then
  echo "ERRO: audit permitiu UPDATE." >&2; exit 5
fi
grep -q 'fitcore_audit_events_append_only' /tmp/fitcore-v11-audit-update.log
echo "OK audit UPDATE append-only"

if docker exec "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -c   "DELETE FROM fitcore_audit_events WHERE tenant_id='$TENANT_A'::uuid;"   >/tmp/fitcore-v11-audit-delete.log 2>&1; then
  echo "ERRO: audit permitiu DELETE direto." >&2; exit 6
fi
grep -q 'fitcore_audit_delete_requires_retention_purge' /tmp/fitcore-v11-audit-delete.log
echo "OK audit DELETE fail-closed"

if docker exec "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -c "
  SET ROLE fitcore_app;
  SELECT set_config('app.tenant_id','$TENANT_B',false);
  SELECT fitcore_audit_retention_purge('$TENANT_A'::uuid,'$GESTOR_A'::uuid);
" >/tmp/fitcore-v11-cross.log 2>&1; then
  echo "ERRO: purge cross-tenant aceito." >&2; exit 7
fi
grep -q 'privacy_tenant_context_mismatch' /tmp/fitcore-v11-cross.log
echo "OK purge cross-tenant fail-closed"

if docker exec "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -c "
  SET ROLE fitcore_app;
  SELECT set_config('app.tenant_id','$TENANT_A',false);
  SELECT fitcore_audit_retention_purge('$TENANT_A'::uuid,'$GESTOR_A'::uuid);
" >/tmp/fitcore-v11-hold.log 2>&1; then
  echo "ERRO: legal hold não bloqueou purge." >&2; exit 8
fi
grep -q 'security_audit_legal_hold' /tmp/fitcore-v11-hold.log
echo "OK legal hold bloqueia purge"

docker exec "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -c "
  UPDATE fitcore_retention_policies
  SET legal_hold=false
  WHERE tenant_id='$TENANT_A'::uuid AND dataset='security_audit';
" >/dev/null

PURGED="$(docker exec "$NAME" psql -U postgres -d "$DB" -At -v ON_ERROR_STOP=1 -c "
  SET ROLE fitcore_app;
  SELECT set_config('app.tenant_id','$TENANT_A',false);
  SELECT fitcore_audit_retention_purge('$TENANT_A'::uuid,'$GESTOR_A'::uuid);
" | tail -1)"
[[ "$PURGED" == "1" ]] || { echo "ERRO: purge esperado=1 obtido=$PURGED" >&2; exit 9; }
echo "OK governed purge remove somente evento expirado"

EVIDENCE_COUNT="$(docker exec "$NAME" psql -U postgres -d "$DB" -At -c "
  SELECT count(*) FROM fitcore_audit_events
  WHERE tenant_id='$TENANT_A'::uuid AND acao='retention_purge';
")"
[[ "$EVIDENCE_COUNT" == "1" ]] || { echo "ERRO: evidência de purge ausente." >&2; exit 10; }
echo "OK purge gera nova evidência auditável"

CROSS_COUNT="$(docker exec "$NAME" psql -U postgres -d "$DB" -At -v ON_ERROR_STOP=1 -c "
  SET ROLE fitcore_app;
  SELECT set_config('app.tenant_id','$TENANT_B',false);
  SELECT count(*) FROM fitcore_privacy_requests;
" | tail -1)"
[[ "$CROSS_COUNT" == "0" ]] || { echo "ERRO: privacy request vazou cross-tenant." >&2; exit 11; }
echo "OK privacy RLS cross-tenant"

if docker exec "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -c   "UPDATE fitcore_privacy_events SET metadata='{}'::jsonb;"   >/tmp/fitcore-v11-events.log 2>&1; then
  echo "ERRO: privacy event mutável." >&2; exit 12
fi
grep -q 'fitcore_privacy_events_append_only' /tmp/fitcore-v11-events.log
echo "OK privacy events append-only"

VERSION="$(docker exec "$NAME" psql -U postgres -d "$DB" -At -c   "SELECT version FROM fitcore_schema_migrations WHERE version='030-privacy-audit-recovery';")"
[[ "$VERSION" == "030-privacy-audit-recovery" ]]
echo "FITCORE_PRIVACY_AUDIT_RECOVERY_DB_GATE=PASS PostgreSQL=17.6"
