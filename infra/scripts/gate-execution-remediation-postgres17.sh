#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NAME="fitcore-remediation90-pg17-${RANDOM}-$$"
PASS="fitcore-remediation90"
DB="fitcore_remediation90"
TENANT_A="90111111-1111-4111-8111-111111111111"
TENANT_B="90222222-2222-4222-8222-222222222222"
ACTOR_A="90aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
ACTOR_B="90bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
EXEC_A="exe_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
ATT_A="att_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
OP_A="op_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
TRACE_A="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
SUB_A="sub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
BIND_A="$(printf 'a%.0s' {1..64})"
IDEM_A="$(printf 'b%.0s' {1..64})"

cleanup(){ docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD="$PASS" -e POSTGRES_DB="$DB" -p 127.0.0.1::5432 postgres:17.6-alpine >/dev/null
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
CREATE ROLE fitcore_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
SQL
apply_sql infra/sql/023-execution-kernel-v2.sql
apply_sql infra/sql/024-execution-analytics-nba.sql
apply_sql infra/sql/025-decision-intelligence.sql
apply_sql infra/sql/026-execution-remediation.sql
apply_sql infra/sql/026-execution-remediation.sql

docker exec -i "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 <<SQL >/dev/null
INSERT INTO fitcore_tenants(id,slug,nome,status) VALUES
('$TENANT_A','remediation90-a','Remediation90 A','teste'),
('$TENANT_B','remediation90-b','Remediation90 B','teste');
INSERT INTO fitcore_users(id,tenant_id,nome,papel,ativo) VALUES
('$ACTOR_A','$TENANT_A','Aluno A','aluno',true),
('$ACTOR_B','$TENANT_B','Aluno B','aluno',true);
SQL

sql_a() {
  docker exec "$NAME" psql -U postgres -d "$DB" -At -v ON_ERROR_STOP=1 -c "
    SET ROLE fitcore_app;
    SELECT set_config('app.tenant_id','$TENANT_A',false);
    $1" | tail -1
}

ADMIT="$(sql_a "SELECT row_to_json(x)::text FROM fitcore_execution_admit(
  '$TENANT_A'::uuid,'$ACTOR_A'::uuid,'$SUB_A','$EXEC_A','$ATT_A','$OP_A','$TRACE_A',
  'fitcore.workout.execution.start',1,'ui','$IDEM_A','$BIND_A'
) x;")"
node -e 'const x=JSON.parse(process.argv[1]); if(x.run_state!=="admitted") process.exit(2)' "$ADMIT"

sql_a "SELECT row_to_json(x)::text FROM fitcore_execution_transition(
  '$TENANT_A'::uuid,'$EXEC_A','$ATT_A','$OP_A','executing',NULL,NULL,'{}'::jsonb
) x;" >/dev/null
sql_a "SELECT row_to_json(x)::text FROM fitcore_execution_transition(
  '$TENANT_A'::uuid,'$EXEC_A','$ATT_A','$OP_A','retry_wait','temporary_failure',NULL,'{}'::jsonb
) x;" >/dev/null

QUEUE="$(sql_a "SELECT fitcore_execution_remediation_dashboard('$TENANT_A'::uuid,168)::text;")"
node -e '
const q=JSON.parse(process.argv[1]),s=q.summary||{},i=q.items?.[0]||{};
if(s.awaiting_retry!==1||s.dead_letter!==0) process.exit(2);
if(i.status!=="scheduled"||i.route!=="ops_retry"||i.severity!=="high") process.exit(3);
if(i.retry_count!==0||i.max_attempts!==3) process.exit(4);
if("binding_hash" in i||"idempotency_hash" in i||"raw_payload" in i) process.exit(5);
' "$QUEUE"
REM_ID="$(node -e 'console.log(JSON.parse(process.argv[1]).items[0].remediation_id)' "$QUEUE")"
echo "OK queue/routing: scheduled high ops_retry remediation=$REM_ID"

BACKOFF="$(sql_a "SELECT fitcore_execution_remediation_preview(
  '$TENANT_A'::uuid,'$ACTOR_A'::uuid,'$REM_ID','$BIND_A'
)::text;")"
node -e 'const x=JSON.parse(process.argv[1]); if(x.allowed!==false||x.code!=="execution_remediation_backoff_active") process.exit(2)' "$BACKOFF"
echo "OK backoff: retry bloqueado antes da janela"

if sql_a "SELECT fitcore_execution_remediation_preview(
  '$TENANT_A'::uuid,'$ACTOR_A'::uuid,'$REM_ID','$(printf 'c%.0s' {1..64})'
)::text;" >/tmp/fitcore-rem90-binding.log 2>&1; then
  echo "ERRO: binding divergente aceito." >&2; exit 4
fi
grep -q 'execution_remediation_binding_conflict' /tmp/fitcore-rem90-binding.log

docker exec "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -c "
UPDATE fitcore_execution_remediations SET next_retry_at=now()-interval '1 second'
WHERE tenant_id='$TENANT_A'::uuid AND remediation_id='$REM_ID';" >/dev/null

READY="$(sql_a "SELECT fitcore_execution_remediation_preview(
  '$TENANT_A'::uuid,'$ACTOR_A'::uuid,'$REM_ID','$BIND_A'
)::text;")"
node -e 'const x=JSON.parse(process.argv[1]); if(x.allowed!==true||x.code!=="ready") process.exit(2)' "$READY"

PREP="$(sql_a "SELECT fitcore_execution_prepare_remediation_retry(
  '$TENANT_A'::uuid,'$ACTOR_A'::uuid,'$REM_ID','$BIND_A'
)::text;")"
node -e '
const x=JSON.parse(process.argv[1]);
if(!x.allowed||x.replayed||x.occurrence!==1||x.retry_count!==1) process.exit(2);
if(!/^att_[0-9a-f]{32}$/.test(x.attempt_id)||!/^op_[0-9a-f]{32}$/.test(x.operation_id)) process.exit(3);
' "$PREP"
ATT_1="$(node -e 'console.log(JSON.parse(process.argv[1]).attempt_id)' "$PREP")"
OP_1="$(node -e 'console.log(JSON.parse(process.argv[1]).operation_id)' "$PREP")"

PREP_REPLAY="$(sql_a "SELECT fitcore_execution_prepare_remediation_retry(
  '$TENANT_A'::uuid,'$ACTOR_A'::uuid,'$REM_ID','$BIND_A'
)::text;")"
node -e '
const a=JSON.parse(process.argv[1]),b=JSON.parse(process.argv[2]);
if(!b.allowed||!b.replayed||a.attempt_id!==b.attempt_id||a.operation_id!==b.operation_id) process.exit(2);
' "$PREP" "$PREP_REPLAY"
echo "OK retry prepare: occurrence=1 + replay idempotente"

sql_a "SELECT row_to_json(x)::text FROM fitcore_execution_transition(
  '$TENANT_A'::uuid,'$EXEC_A','$ATT_1','$OP_1','executing',NULL,NULL,'{}'::jsonb
) x;" >/dev/null
sql_a "SELECT row_to_json(x)::text FROM fitcore_execution_transition(
  '$TENANT_A'::uuid,'$EXEC_A','$ATT_1','$OP_1','settlement_pending',NULL,NULL,'{}'::jsonb
) x;" >/dev/null
RESOURCE_A="90333333-3333-4333-8333-333333333333"
sql_a "SELECT row_to_json(x)::text FROM fitcore_execution_transition(
  '$TENANT_A'::uuid,'$EXEC_A','$ATT_1','$OP_1','succeeded',NULL,'$RESOURCE_A'::uuid,'{}'::jsonb
) x;" >/dev/null

RESOLVED="$(sql_a "SELECT fitcore_execution_remediation_dashboard('$TENANT_A'::uuid,168)::text;")"
node -e '
const q=JSON.parse(process.argv[1]),s=q.summary||{},i=q.items?.[0]||{};
if(s.resolved!==1||s.retries!==1||i.status!=="resolved") process.exit(2);
if(i.resolution_code!=="execution_succeeded") process.exit(3);
if(Number(s.avg_mttr_ms)<0) process.exit(4);
' "$RESOLVED"
echo "OK settlement/reconciliation: remediation resolved + MTTR"

EXEC_B="exe_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
ATT_B="att_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
OP_B="op_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
TRACE_B="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
SUB_B="sub_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
IDEM_B="$(printf 'd%.0s' {1..64})"
BIND_B="$(printf 'e%.0s' {1..64})"
sql_a "SELECT row_to_json(x)::text FROM fitcore_execution_admit(
  '$TENANT_A'::uuid,'$ACTOR_A'::uuid,'$SUB_B','$EXEC_B','$ATT_B','$OP_B','$TRACE_B',
  'fitcore.workout.execution.finish',1,'ui','$IDEM_B','$BIND_B'
) x;" >/dev/null
sql_a "SELECT row_to_json(x)::text FROM fitcore_execution_transition(
  '$TENANT_A'::uuid,'$EXEC_B','$ATT_B','$OP_B','executing',NULL,NULL,'{}'::jsonb
) x;" >/dev/null
sql_a "SELECT row_to_json(x)::text FROM fitcore_execution_transition(
  '$TENANT_A'::uuid,'$EXEC_B','$ATT_B','$OP_B','dead_letter','terminal_failure',NULL,'{}'::jsonb
) x;" >/dev/null

DEAD="$(sql_a "SELECT fitcore_execution_remediation_dashboard('$TENANT_A'::uuid,168)::text;")"
node -e '
const q=JSON.parse(process.argv[1]);
const i=q.items.find(x=>x.execution_id===process.argv[2]);
if(!i||i.status!=="dead_letter"||i.severity!=="critical"||i.route!=="ops_critical") process.exit(2);
if(q.summary.dead_letter!==1) process.exit(3);
' "$DEAD" "$EXEC_B"
DEAD_ID="$(node -e 'const q=JSON.parse(process.argv[1]); console.log(q.items.find(x=>x.execution_id===process.argv[2]).remediation_id)' "$DEAD" "$EXEC_B")"
echo "OK dead-letter routing: critical ops_critical"

if docker exec "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -c "
  SET ROLE fitcore_app;
  SELECT set_config('app.tenant_id','$TENANT_B',false);
  SELECT fitcore_execution_remediation_dashboard('$TENANT_A'::uuid,168);" >/tmp/fitcore-rem90-cross.log 2>&1; then
  echo "ERRO: dashboard cross-tenant aceito." >&2; exit 6
fi
grep -q 'execution_tenant_context_mismatch' /tmp/fitcore-rem90-cross.log

if sql_a "SELECT fitcore_execution_remediation_preview(
  '$TENANT_A'::uuid,'$ACTOR_B'::uuid,'$REM_ID','$BIND_A'
)::text;" >/tmp/fitcore-rem90-actor.log 2>&1; then
  echo "ERRO: ator de outro tenant aceito." >&2; exit 7
fi
grep -q 'execution_remediation_actor_mismatch' /tmp/fitcore-rem90-actor.log
echo "OK tenant/actor isolation: fail-closed"

EVENTS="$(docker exec "$NAME" psql -U postgres -d "$DB" -At -v ON_ERROR_STOP=1 -c "
SELECT count(*) FROM fitcore_execution_remediation_events e
JOIN fitcore_execution_remediations m ON m.id=e.remediation_id
WHERE m.tenant_id='$TENANT_A'::uuid;")"
[[ "$EVENTS" -ge 4 ]]
echo "OK remediation audit events=$EVENTS"

apply_sql infra/sql/rollback-026-execution-remediation.sql
MISSING="$(docker exec "$NAME" psql -U postgres -d "$DB" -AtF '|' -c "
SELECT
  to_regclass('public.fitcore_execution_remediations') IS NULL,
  to_regclass('public.fitcore_execution_remediation_events') IS NULL,
  to_regprocedure('public.fitcore_execution_remediation_dashboard(uuid,integer)') IS NULL,
  NOT EXISTS (SELECT 1 FROM fitcore_schema_migrations WHERE version='026-execution-remediation');")"
[[ "$MISSING" == "t|t|t|t" ]]
apply_sql infra/sql/026-execution-remediation.sql

echo "EXECUTION_REMEDIATION_DB_GATE=PASS PostgreSQL=17.6"
