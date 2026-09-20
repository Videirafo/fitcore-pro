#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NAME="fitcore-execution79-pg17-${RANDOM}-$$"
PASS="fitcore-execution79"
DB="fitcore_execution79"
TENANT_A="11111111-1111-4111-8111-111111111111"
TENANT_B="22222222-2222-4222-8222-222222222222"
ACTOR_A="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
ACTOR_B="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
RESOURCE="33333333-3333-4333-8333-333333333333"

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
command -v docker >/dev/null || { echo "ERRO: Docker obrigatório." >&2; exit 2; }

docker run -d --rm --name "$NAME" \
  -e POSTGRES_PASSWORD="$PASS" -e POSTGRES_DB="$DB" \
  -p 127.0.0.1::5432 postgres:17.6-alpine >/dev/null
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

apply_sql() {
  docker exec -i "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 < "$ROOT/$1" >/dev/null
}
apply_sql infra/sql/001-mvp-07-core.sql
apply_sql infra/sql/002-mvp-10-postgres-store.sql
docker exec -i "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
CREATE ROLE fitcore_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE fitcore_probe NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO fitcore_app,fitcore_probe;
SQL
apply_sql infra/sql/023-execution-kernel-v2.sql
apply_sql infra/sql/023-execution-kernel-v2.sql

docker exec -i "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 <<SQL >/dev/null
INSERT INTO fitcore_tenants(id,slug,nome,status) VALUES
('$TENANT_A','exec-a','Execution A','teste'),
('$TENANT_B','exec-b','Execution B','teste')
ON CONFLICT (id) DO NOTHING;
INSERT INTO fitcore_users(id,tenant_id,nome,papel,ativo) VALUES
('$ACTOR_A','$TENANT_A','Aluno A','aluno',true),
('$ACTOR_B','$TENANT_B','Aluno B','aluno',true)
ON CONFLICT (id) DO NOTHING;
SQL

ADMIT_SQL="SELECT * FROM fitcore_execution_admit(
  '$TENANT_A'::uuid,'$ACTOR_A'::uuid,
  'sub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'exe_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  'att_cccccccccccccccccccccccccccccccc',
  'op_dddddddddddddddddddddddddddddddd',
  'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  'fitcore.workout.execution.start',1,'ui',
  'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  'abababababababababababababababababababababababababababababababab'
);"

FIRST="$(docker exec "$NAME" psql -U postgres -d "$DB" -AtF '|' -c "SET ROLE fitcore_app; SELECT set_config('app.tenant_id','$TENANT_A',false); $ADMIT_SQL" | tail -1)"
IFS='|' read -r RUN_ID RUN_STATE ATTEMPT_ROW OP_ROW CREATED REPLAYED RESOURCE_ID UPDATED_AT <<<"$FIRST"
[[ "$RUN_STATE" == "admitted" && "$CREATED" == "t" && "$REPLAYED" == "f" ]]
echo "OK admission: admitted/created"

SECOND="$(docker exec "$NAME" psql -U postgres -d "$DB" -AtF '|' -c "SET ROLE fitcore_app; SELECT set_config('app.tenant_id','$TENANT_A',false); $ADMIT_SQL" | tail -1)"
IFS='|' read -r _ STATE2 _ _ CREATED2 REPLAYED2 _ _ <<<"$SECOND"
[[ "$STATE2" == "admitted" && "$CREATED2" == "f" && "$REPLAYED2" == "t" ]]
echo "OK replay pre-effect: mesma execução"

if docker exec "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -c "
  SET ROLE fitcore_app;
  SELECT set_config('app.tenant_id','$TENANT_A',false);
  SELECT * FROM fitcore_execution_admit(
    '$TENANT_A'::uuid,'$ACTOR_A'::uuid,
    'sub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'exe_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    'att_cccccccccccccccccccccccccccccccc',
    'op_dddddddddddddddddddddddddddddddd',
    'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    'fitcore.workout.execution.start',1,'ui',
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    'cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd'
  );" >/tmp/fitcore-exec79-conflict.log 2>&1; then
  echo "ERRO: binding divergente foi aceito." >&2
  exit 4
fi
grep -q 'execution_binding_conflict' /tmp/fitcore-exec79-conflict.log
echo "OK binding conflict: fail-closed"

if docker exec "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -c "
  SET ROLE fitcore_app;
  SELECT set_config('app.tenant_id','$TENANT_A',false);
  SELECT * FROM fitcore_execution_admit(
    '$TENANT_B'::uuid,'$ACTOR_B'::uuid,
    'sub_99999999999999999999999999999999',
    'exe_88888888888888888888888888888888',
    'att_77777777777777777777777777777777',
    'op_66666666666666666666666666666666',
    '55555555555555555555555555555555',
    'fitcore.workout.execution.start',1,'ui',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  );" >/tmp/fitcore-exec79-tenant.log 2>&1; then
  echo "ERRO: SECURITY DEFINER aceitou tenant divergente." >&2
  exit 5
fi
grep -q 'execution_tenant_context_mismatch' /tmp/fitcore-exec79-tenant.log
echo "OK SECURITY DEFINER: contexto tenant fail-closed"

transition() {
  local state="$1" error="${2:-NULL}" resource="${3:-NULL}"
  docker exec "$NAME" psql -U postgres -d "$DB" -AtF '|' -v ON_ERROR_STOP=1 -c "
    SET ROLE fitcore_app;
    SELECT set_config('app.tenant_id','$TENANT_A',false);
    SELECT * FROM fitcore_execution_transition(
      '$TENANT_A'::uuid,
      'exe_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      'att_cccccccccccccccccccccccccccccccc',
      'op_dddddddddddddddddddddddddddddddd',
      '$state',$error,$resource,'{}'::jsonb
    );" | tail -1
}

[[ "$(transition executing | cut -d'|' -f2)" == "executing" ]]
[[ "$(transition settlement_pending | cut -d'|' -f2)" == "settlement_pending" ]]
[[ "$(transition succeeded NULL "'$RESOURCE'::uuid" | cut -d'|' -f2)" == "succeeded" ]]
echo "OK lifecycle: admitted → executing → settlement_pending → succeeded"

THIRD="$(docker exec "$NAME" psql -U postgres -d "$DB" -AtF '|' -c "SET ROLE fitcore_app; SELECT set_config('app.tenant_id','$TENANT_A',false); $ADMIT_SQL" | tail -1)"
IFS='|' read -r _ STATE3 _ _ CREATED3 REPLAYED3 RESOURCE3 _ <<<"$THIRD"
[[ "$STATE3" == "succeeded" && "$REPLAYED3" == "t" && "$RESOURCE3" == "$RESOURCE" ]]
echo "OK replay terminal: resource original preservado"

EVENTS="$(docker exec "$NAME" psql -U postgres -d "$DB" -Atqc "SELECT count(*) FROM fitcore_execution_events WHERE tenant_id='$TENANT_A'")"
[[ "$EVENTS" == "6" ]]
echo "OK timeline: 6 eventos canônicos"

OBS="$(docker exec "$NAME" psql -U postgres -d "$DB" -AtF '|' -c "
  SET ROLE fitcore_app;
  SELECT set_config('app.tenant_id','$TENANT_A',false);
  SELECT action_id,executions,succeeded FROM fitcore_execution_observability('$TENANT_A'::uuid);" | tail -1)"
[[ "$OBS" == "fitcore.workout.execution.start|1|1" ]]
echo "OK observability: succeeded=1"

docker exec -i "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 <<SQL >/dev/null
GRANT SELECT ON fitcore_execution_runs TO fitcore_probe;
INSERT INTO fitcore_execution_runs(
  tenant_id,actor_user_id,submission_id,execution_id,trace_id,action_id,action_version,
  source,idempotency_hash,binding_hash,state
) VALUES (
  '$TENANT_B','$ACTOR_B',
  'sub_11111111111111111111111111111111',
  'exe_22222222222222222222222222222222',
  '33333333333333333333333333333333',
  'fitcore.workout.execution.start',1,'ui',
  '4444444444444444444444444444444444444444444444444444444444444444',
  '5555555555555555555555555555555555555555555555555555555555555555',
  'admitted'
);
SQL
RLS_COUNT="$(docker exec "$NAME" psql -U postgres -d "$DB" -Atqc "
  SET ROLE fitcore_probe;
  SELECT set_config('app.tenant_id','$TENANT_A',false);
  SELECT count(*) FROM fitcore_execution_runs;" | tail -1)"
[[ "$RLS_COUNT" == "1" ]]
echo "OK RLS: tenant A não enxerga tenant B"

SCHEMA_COLS="$(docker exec "$NAME" psql -U postgres -d "$DB" -Atqc "
  SELECT count(*) FROM information_schema.columns
  WHERE table_name LIKE 'fitcore_execution_%' AND column_name='idempotency_key';")"
[[ "$SCHEMA_COLS" == "0" ]]
echo "OK secret hygiene: raw idempotency key não possui coluna persistente"

settlement_case() {
  local submission="$1" execution="$2" attempt="$3" operation="$4" trace="$5"
  local idem="$6" binding="$7" target="$8" error_code="$9"
  docker exec -i "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 >/dev/null <<SQL
SET ROLE fitcore_app;
SELECT set_config('app.tenant_id','$TENANT_A',false);
SELECT * FROM fitcore_execution_admit(
  '$TENANT_A'::uuid,'$ACTOR_A'::uuid,
  '$submission','$execution','$attempt','$operation','$trace',
  'fitcore.workout.execution.start',1,'ui','$idem','$binding'
);
SELECT * FROM fitcore_execution_transition(
  '$TENANT_A'::uuid,'$execution','$attempt','$operation',
  'executing',NULL,NULL,'{}'::jsonb
);
SQL
  local final state
  final="$(docker exec "$NAME" psql -U postgres -d "$DB" -AtF '|' -v ON_ERROR_STOP=1 -c "
    SET ROLE fitcore_app;
    SELECT set_config('app.tenant_id','$TENANT_A',false);
    SELECT * FROM fitcore_execution_transition(
      '$TENANT_A'::uuid,'$execution','$attempt','$operation',
      '$target',$error_code,NULL,'{}'::jsonb
    );" | tail -1)"
  state="$(printf '%s' "$final" | cut -d'|' -f2)"
  [[ "$state" == "$target" ]]
}

settlement_case \
  'sub_12121212121212121212121212121212' \
  'exe_34343434343434343434343434343434' \
  'att_56565656565656565656565656565656' \
  'op_78787878787878787878787878787878' \
  '90909090909090909090909090909090' \
  '1111111111111111111111111111111111111111111111111111111111111111' \
  '2222222222222222222222222222222222222222222222222222222222222222' \
  'failed' "'effect_failed'"

settlement_case \
  'sub_aaaaaaaa11111111aaaaaaaa11111111' \
  'exe_bbbbbbbb22222222bbbbbbbb22222222' \
  'att_cccccccc33333333cccccccc33333333' \
  'op_dddddddd44444444dddddddd44444444' \
  'eeeeeeee55555555eeeeeeee55555555' \
  '3333333333333333333333333333333333333333333333333333333333333333' \
  '4444444444444444444444444444444444444444444444444444444444444444' \
  'retry_wait' "'retry_scheduled'"

settlement_case \
  'sub_abcdefabcdefabcdefabcdefabcdefab' \
  'exe_bcdefabcdefabcdefabcdefabcdefabc' \
  'att_cdefabcdefabcdefabcdefabcdefabcd' \
  'op_defabcdefabcdefabcdefabcdefabcde' \
  '77777777777777777777777777777777' \
  '5555555555555555555555555555555555555555555555555555555555555555' \
  '6666666666666666666666666666666666666666666666666666666666666666' \
  'dead_letter' "'retry_exhausted'"

echo "OK settlement outcomes: failed/retry_wait/dead_letter"

REC_SUB="sub_10101010101010101010101010101010"
REC_EXE="exe_20202020202020202020202020202020"
REC_ATT="att_30303030303030303030303030303030"
REC_OP="op_40404040404040404040404040404040"
REC_TRACE="50505050505050505050505050505050"
REC_IDEM="7777777777777777777777777777777777777777777777777777777777777777"
REC_BIND="8888888888888888888888888888888888888888888888888888888888888888"
docker exec -i "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 >/dev/null <<SQL
SET ROLE fitcore_app;
SELECT set_config('app.tenant_id','$TENANT_A',false);
SELECT * FROM fitcore_execution_admit('$TENANT_A'::uuid,'$ACTOR_A'::uuid,
  '$REC_SUB','$REC_EXE','$REC_ATT','$REC_OP','$REC_TRACE',
  'fitcore.workout.execution.start',1,'ui','$REC_IDEM','$REC_BIND');
SELECT * FROM fitcore_execution_transition('$TENANT_A'::uuid,'$REC_EXE','$REC_ATT','$REC_OP','executing',NULL,NULL,'{}'::jsonb);
SQL
if docker exec "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -c "
  SET ROLE fitcore_app;
  SELECT set_config('app.tenant_id','$TENANT_A',false);
  SELECT * FROM fitcore_execution_recover('$TENANT_A'::uuid,'$REC_EXE','$REC_ATT','$REC_OP','admitted',now()-interval '30 seconds');
" >/tmp/fitcore-exec79-recovery-fresh.log 2>&1; then
  echo "ERRO: recovery aceitou execução ainda fresca." >&2
  exit 6
fi
grep -q 'execution_recovery_not_stale' /tmp/fitcore-exec79-recovery-fresh.log
docker exec "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -c "
  UPDATE fitcore_execution_runs SET atualizado_em=now()-interval '2 minutes' WHERE tenant_id='$TENANT_A'::uuid AND execution_id='$REC_EXE';
  UPDATE fitcore_execution_attempts SET atualizado_em=now()-interval '2 minutes' WHERE tenant_id='$TENANT_A'::uuid AND attempt_id='$REC_ATT';
  UPDATE fitcore_execution_operations SET atualizado_em=now()-interval '2 minutes' WHERE tenant_id='$TENANT_A'::uuid AND operation_id='$REC_OP';
" >/dev/null
RECOVERED="$(docker exec "$NAME" psql -U postgres -d "$DB" -AtF '|' -v ON_ERROR_STOP=1 -c "
  SET ROLE fitcore_app;
  SELECT set_config('app.tenant_id','$TENANT_A',false);
  SELECT * FROM fitcore_execution_recover('$TENANT_A'::uuid,'$REC_EXE','$REC_ATT','$REC_OP','admitted',now()-interval '30 seconds');
" | tail -1)"
[[ "$(printf '%s' "$RECOVERED" | cut -d'|' -f2)" == "admitted" ]]
echo "OK stale recovery: fresh bloqueado e stale retomado para admitted"

apply_sql infra/sql/rollback-023-execution-kernel-v2.sql
ABSENT="$(docker exec "$NAME" psql -U postgres -d "$DB" -Atqc "SELECT to_regclass('public.fitcore_execution_runs') IS NULL")"
[[ "$ABSENT" == "t" ]]
apply_sql infra/sql/023-execution-kernel-v2.sql
PRESENT="$(docker exec "$NAME" psql -U postgres -d "$DB" -Atqc "SELECT to_regclass('public.fitcore_execution_runs') IS NOT NULL")"
[[ "$PRESENT" == "t" ]]
echo "OK rollback/reapply: PASS"

echo "EXECUTION_KERNEL_V2_DB_GATE=PASS PostgreSQL=17.6"
