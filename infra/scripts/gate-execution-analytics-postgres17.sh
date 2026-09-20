#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NAME="fitcore-exec85-pg17-${RANDOM}-$$"
PASS="fitcore-exec85"
DB="fitcore_exec85"
TENANT_A="85111111-1111-4111-8111-111111111111"
TENANT_B="85222222-2222-4222-8222-222222222222"
ACTOR_A="85aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
ACTOR_B="85bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

cleanup(){ docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
command -v docker >/dev/null || { echo "ERRO: Docker obrigatório." >&2; exit 2; }

docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD="$PASS" -e POSTGRES_DB="$DB" -p 127.0.0.1::5432 postgres:17.6-alpine >/dev/null
ready=0
for _ in $(seq 1 80); do
  if docker exec "$NAME" psql -U postgres -d "$DB" -Atqc 'select 1' 2>/dev/null | grep -qx 1; then
    ready=$((ready+1)); [[ "$ready" -ge 2 ]] && break
  else
    ready=0
  fi
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
apply_sql infra/sql/024-execution-analytics-nba.sql

docker exec -i "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 <<SQL >/dev/null
INSERT INTO fitcore_tenants(id,slug,nome,status) VALUES
('$TENANT_A','exec85-a','Exec85 A','teste'),
('$TENANT_B','exec85-b','Exec85 B','teste');
INSERT INTO fitcore_users(id,tenant_id,nome,papel,ativo) VALUES
('$ACTOR_A','$TENANT_A','Aluno A','aluno',true),
('$ACTOR_B','$TENANT_B','Aluno B','aluno',true);
SQL

run_admit() {
  local suffix="$1" action="$2"
  docker exec "$NAME" psql -U postgres -d "$DB" -AtF '|' -v ON_ERROR_STOP=1 -c "
    SET ROLE fitcore_app;
    SELECT set_config('app.tenant_id','$TENANT_A',false);
    SELECT * FROM fitcore_execution_admit(
      '$TENANT_A'::uuid,'$ACTOR_A'::uuid,
      'sub_${suffix}${suffix}${suffix}${suffix}${suffix}${suffix}${suffix}${suffix}',
      'exe_${suffix}${suffix}${suffix}${suffix}${suffix}${suffix}${suffix}${suffix}',
      'att_${suffix}${suffix}${suffix}${suffix}${suffix}${suffix}${suffix}${suffix}',
      'op_${suffix}${suffix}${suffix}${suffix}${suffix}${suffix}${suffix}${suffix}',
      '${suffix}${suffix}${suffix}${suffix}${suffix}${suffix}${suffix}${suffix}',
      '$action',1,'ui',
      '${suffix}${suffix}${suffix}${suffix}${suffix}${suffix}${suffix}${suffix}${suffix}${suffix}${suffix}${suffix}${suffix}${suffix}${suffix}${suffix}',
      'abababababababababababababababababababababababababababababababab'
    );" | tail -1
}

transition() {
  local suffix="$1" state="$2" error="${3:-NULL}" resource="${4:-NULL}"
  docker exec "$NAME" psql -U postgres -d "$DB" -AtF '|' -v ON_ERROR_STOP=1 -c "
    SET ROLE fitcore_app;
    SELECT set_config('app.tenant_id','$TENANT_A',false);
    SELECT * FROM fitcore_execution_transition(
      '$TENANT_A'::uuid,
      'exe_${suffix}${suffix}${suffix}${suffix}${suffix}${suffix}${suffix}${suffix}',
      'att_${suffix}${suffix}${suffix}${suffix}${suffix}${suffix}${suffix}${suffix}',
      'op_${suffix}${suffix}${suffix}${suffix}${suffix}${suffix}${suffix}${suffix}',
      '$state',$error,$resource,'{}'::jsonb
    );" | tail -1
}

run_admit aaaa 'fitcore.workout.execution.start' >/dev/null
transition aaaa executing >/dev/null
transition aaaa settlement_pending >/dev/null
transition aaaa succeeded NULL "'85333333-3333-4333-8333-333333333333'::uuid" >/dev/null

run_admit bbbb 'fitcore.workout.exercise.complete' >/dev/null
transition bbbb executing >/dev/null
transition bbbb retry_wait "'temporary_failure'" >/dev/null

run_admit cccc 'fitcore.workout.execution.finish' >/dev/null
transition cccc executing >/dev/null
transition cccc dead_letter "'terminal_failure'" >/dev/null

ANALYTICS="$(docker exec "$NAME" psql -U postgres -d "$DB" -At -v ON_ERROR_STOP=1 -c "
  SET ROLE fitcore_app;
  SELECT set_config('app.tenant_id','$TENANT_A',false);
  SELECT fitcore_execution_analytics('$TENANT_A'::uuid,168)::text;" | tail -1)"
node -e '
const a=JSON.parse(process.argv[1]);
const s=a.summary||{};
if(s.runs!==3||s.attempts!==3||s.operations!==3||s.succeeded!==1||s.retry_wait!==1||s.dead_letter!==1) process.exit(2);
if(!Array.isArray(a.alerts)||!a.alerts.some(x=>x.code==="execution_dead_letter")||!a.alerts.some(x=>x.code==="execution_retry_wait")) process.exit(3);
if(!Array.isArray(a.by_action)||a.by_action.length!==3) process.exit(4);
if(!Array.isArray(a.recent)||a.recent.some(x=>"actor_user_id" in x||"idempotency_hash" in x||"binding_hash" in x)) process.exit(5);
' "$ANALYTICS"
echo "OK analytics: runs/attempts/operations/settlement/alerts"

if docker exec "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -c "
  SET ROLE fitcore_app;
  SELECT set_config('app.tenant_id','$TENANT_A',false);
  SELECT fitcore_execution_analytics('$TENANT_B'::uuid,168);" >/tmp/fitcore-exec85-tenant.log 2>&1; then
  echo "ERRO: analytics cross-tenant foi aceito." >&2; exit 4
fi
grep -q 'execution_tenant_context_mismatch' /tmp/fitcore-exec85-tenant.log
echo "OK analytics cross-tenant: fail-closed"

DECISION="$(docker exec "$NAME" psql -U postgres -d "$DB" -At -v ON_ERROR_STOP=1 -c "
  SET ROLE fitcore_app;
  SELECT set_config('app.tenant_id','$TENANT_A',false);
  SELECT fitcore_execution_record_decision(
    '$TENANT_A'::uuid,'$ACTOR_A'::uuid,
    'nba_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',1,
    'fitcore.workout.execution.start','approved_workout_ready','medium',
    '85333333-3333-4333-8333-333333333333'::uuid
  )::text;" | tail -1)"
node -e 'const d=JSON.parse(process.argv[1]); if(d.state!=="proposed"||d.proposal_id!=="nba_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa") process.exit(2)' "$DECISION"

VALIDATED="$(docker exec "$NAME" psql -U postgres -d "$DB" -At -v ON_ERROR_STOP=1 -c "
  SET ROLE fitcore_app;
  SELECT set_config('app.tenant_id','$TENANT_A',false);
  SELECT fitcore_execution_validate_decision(
    '$TENANT_A'::uuid,'$ACTOR_A'::uuid,
    'nba_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'fitcore.workout.execution.start',
    '85333333-3333-4333-8333-333333333333'::uuid
  )::text;" | tail -1)"
node -e 'const d=JSON.parse(process.argv[1]); if(d.state!=="proposed") process.exit(2)' "$VALIDATED"
echo "OK NBA pre-effect validation: proposed/binding correto"

if docker exec "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -c "
  SET ROLE fitcore_app;
  SELECT set_config('app.tenant_id','$TENANT_A',false);
  SELECT fitcore_execution_validate_decision(
    '$TENANT_A'::uuid,'$ACTOR_A'::uuid,
    'nba_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'fitcore.workout.execution.start',
    '85444444-4444-4444-8444-444444444444'::uuid
  );" >/tmp/fitcore-exec85-validate-binding.log 2>&1; then
  echo "ERRO: NBA pre-effect aceitou resource divergente." >&2; exit 6
fi
grep -q 'execution_decision_binding_conflict' /tmp/fitcore-exec85-validate-binding.log
echo "OK NBA pre-effect binding conflict: fail-closed"

REPLAY="$(docker exec "$NAME" psql -U postgres -d "$DB" -At -v ON_ERROR_STOP=1 -c "
  SET ROLE fitcore_app;
  SELECT set_config('app.tenant_id','$TENANT_A',false);
  SELECT fitcore_execution_record_decision(
    '$TENANT_A'::uuid,'$ACTOR_A'::uuid,
    'nba_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',1,
    'fitcore.workout.execution.start','approved_workout_ready','medium',
    '85333333-3333-4333-8333-333333333333'::uuid
  )::text;" | tail -1)"
[[ "$REPLAY" == "$DECISION" ]]
echo "OK NBA proposal: idempotent"

if docker exec "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -c "
  SET ROLE fitcore_app;
  SELECT set_config('app.tenant_id','$TENANT_A',false);
  SELECT fitcore_execution_record_decision(
    '$TENANT_A'::uuid,'$ACTOR_A'::uuid,
    'nba_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',1,
    'fitcore.workout.execution.start','different_reason','medium',
    '85333333-3333-4333-8333-333333333333'::uuid
  );" >/tmp/fitcore-exec85-binding.log 2>&1; then
  echo "ERRO: NBA binding divergente foi aceito." >&2; exit 5
fi
grep -q 'execution_decision_binding_conflict' /tmp/fitcore-exec85-binding.log
echo "OK NBA binding conflict: fail-closed"

EXECUTED="$(docker exec "$NAME" psql -U postgres -d "$DB" -At -v ON_ERROR_STOP=1 -c "
  SET ROLE fitcore_app;
  SELECT set_config('app.tenant_id','$TENANT_A',false);
  SELECT fitcore_execution_transition_decision(
    '$TENANT_A'::uuid,'nba_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','executed',
    'exe_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  )::text;" | tail -1)"
node -e 'const d=JSON.parse(process.argv[1]); if(d.state!=="executed"||!d.execution_id||!d.trace_id) process.exit(2)' "$EXECUTED"
echo "OK NBA decision→execution correlation"

VALIDATED_REPLAY="$(docker exec "$NAME" psql -U postgres -d "$DB" -At -v ON_ERROR_STOP=1 -c "
  SET ROLE fitcore_app;
  SELECT set_config('app.tenant_id','$TENANT_A',false);
  SELECT fitcore_execution_validate_decision(
    '$TENANT_A'::uuid,'$ACTOR_A'::uuid,
    'nba_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'fitcore.workout.execution.start',
    '85333333-3333-4333-8333-333333333333'::uuid
  )::text;" | tail -1)"
node -e 'const d=JSON.parse(process.argv[1]); if(d.state!=="executed") process.exit(2)' "$VALIDATED_REPLAY"
echo "OK NBA executed replay: mesmo binding continua idempotente"

apply_sql infra/sql/rollback-024-execution-analytics-nba.sql
MISSING="$(docker exec "$NAME" psql -U postgres -d "$DB" -AtF '|' -c "
SELECT to_regclass('public.fitcore_execution_decisions') IS NULL,
       to_regprocedure('public.fitcore_execution_analytics(uuid,integer)') IS NULL,
       to_regprocedure('public.fitcore_execution_validate_decision(uuid,uuid,text,text,uuid)') IS NULL,
       NOT EXISTS (SELECT 1 FROM fitcore_schema_migrations WHERE version='024-execution-analytics-nba');")"
[[ "$MISSING" == "t|t|t|t" ]]
apply_sql infra/sql/024-execution-analytics-nba.sql
echo "EXECUTION_ANALYTICS_DB_GATE=PASS PostgreSQL=17.6"
