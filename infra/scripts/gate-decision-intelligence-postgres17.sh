#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NAME="fitcore-decision89-pg17-${RANDOM}-$$"
PASS="fitcore-decision89"
DB="fitcore_decision89"
TENANT_A="89111111-1111-4111-8111-111111111111"
TENANT_B="89222222-2222-4222-8222-222222222222"
ACTOR_A="89aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
ACTOR_B="89bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
PROPOSAL_A="nba_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
PROPOSAL_B="nba_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

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
apply_sql infra/sql/025-decision-intelligence.sql
apply_sql infra/sql/025-decision-intelligence.sql

docker exec -i "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 <<SQL >/dev/null
INSERT INTO fitcore_tenants(id,slug,nome,status) VALUES
('$TENANT_A','decision89-a','Decision89 A','teste'),
('$TENANT_B','decision89-b','Decision89 B','teste');
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
record_a() {
  local proposal="$1" reason="$2" resource="$3"
  sql_a "SELECT fitcore_execution_record_decision(
    '$TENANT_A'::uuid,'$ACTOR_A'::uuid,'$proposal',1,
    'fitcore.workout.execution.start','$reason','medium','$resource'::uuid
  )::text;"
  sql_a "SELECT fitcore_decision_track_proposal('$TENANT_A'::uuid,'$ACTOR_A'::uuid,'$proposal')::text;" >/dev/null
}

RESOURCE_A="89333333-3333-4333-8333-333333333333"
RESOURCE_B="89444444-4444-4444-8444-444444444444"
DECISION="$(record_a "$PROPOSAL_A" "approved_workout_ready" "$RESOURCE_A")"
node -e 'const d=JSON.parse(process.argv[1]); if(d.state!=="proposed") process.exit(2)' "$DECISION"

if sql_a "SELECT fitcore_decision_validate_accepted(
  '$TENANT_A'::uuid,'$ACTOR_A'::uuid,'$PROPOSAL_A',
  'fitcore.workout.execution.start','$RESOURCE_A'::uuid
);" >/tmp/fitcore-decision89-accept-required.log 2>&1; then
  echo "ERRO: decisão proposta executou sem aceite." >&2; exit 4
fi
grep -q 'execution_decision_accept_required' /tmp/fitcore-decision89-accept-required.log
echo "OK accept-required: fail-closed"

ACCEPTED="$(sql_a "SELECT fitcore_decision_transition(
  '$TENANT_A'::uuid,'$ACTOR_A'::uuid,'$PROPOSAL_A','accepted',NULL,NULL,'user_accepted'
)::text;")"
node -e 'const d=JSON.parse(process.argv[1]); if(d.state!=="accepted"||!d.accepted_at) process.exit(2)' "$ACCEPTED"
VALIDATED="$(sql_a "SELECT fitcore_decision_validate_accepted(
  '$TENANT_A'::uuid,'$ACTOR_A'::uuid,'$PROPOSAL_A',
  'fitcore.workout.execution.start','$RESOURCE_A'::uuid
)::text;")"
node -e 'const d=JSON.parse(process.argv[1]); if(d.state!=="accepted") process.exit(2)' "$VALIDATED"

sql_a "SELECT fitcore_decision_transition(
  '$TENANT_A'::uuid,'$ACTOR_A'::uuid,'$PROPOSAL_A','executing',NULL,NULL,'accepted_for_execution'
)::text;" >/dev/null
SETTLED="$(sql_a "SELECT fitcore_decision_transition(
  '$TENANT_A'::uuid,'$ACTOR_A'::uuid,'$PROPOSAL_A','settled',
  'exe_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','execution_settled'
)::text;")"
node -e 'const d=JSON.parse(process.argv[1]); if(d.state!=="settled"||!d.execution_id||!d.trace_id||!d.settled_at) process.exit(2)' "$SETTLED"

OUTCOME="$(sql_a "SELECT fitcore_decision_record_outcome(
  '$TENANT_A'::uuid,'$ACTOR_A'::uuid,'$PROPOSAL_A',
  'session_started','completion',1,1
)::text;")"
node -e 'const d=JSON.parse(process.argv[1]); if(d.state!=="outcome_recorded"||d.outcome_metric_value!==1) process.exit(2)' "$OUTCOME"

OUTCOME_REPLAY="$(sql_a "SELECT fitcore_decision_record_outcome(
  '$TENANT_A'::uuid,'$ACTOR_A'::uuid,'$PROPOSAL_A',
  'session_started','completion',1,1
)::text;")"
[[ "$OUTCOME_REPLAY" == "$OUTCOME" ]]
echo "OK lifecycle: proposal→accept→execute→settle→outcome + replay"
record_a "$PROPOSAL_B" "approved_workout_ready" "$RESOURCE_B" >/dev/null
REJECTED="$(sql_a "SELECT fitcore_decision_transition(
  '$TENANT_A'::uuid,'$ACTOR_A'::uuid,'$PROPOSAL_B','rejected',NULL,NULL,'user_rejected'
)::text;")"
node -e 'const d=JSON.parse(process.argv[1]); if(d.state!=="rejected"||!d.rejected_at) process.exit(2)' "$REJECTED"

INTELLIGENCE="$(sql_a "SELECT fitcore_decision_intelligence('$TENANT_A'::uuid,720)::text;")"
node -e '
const x=JSON.parse(process.argv[1]), s=x.summary||{};
if(s.proposed!==2||s.accepted!==1||s.rejected!==1||s.execution_started!==1||s.settled!==1||s.outcomes!==1) process.exit(2);
if(!Array.isArray(x.rank_order)||x.rank_order[0]!=="outcome_count_desc") process.exit(3);
if(!Array.isArray(x.evidence)||x.evidence.length<1||x.evidence[0].rank!==1||x.evidence[0].outcome_count!==1) process.exit(4);
if("actor_user_id" in x||"raw_payload" in x) process.exit(5);
' "$INTELLIGENCE"
echo "OK intelligence: transparent funnel + deterministic evidence rank"

VERSIONS="$(docker exec "$NAME" psql -U postgres -d "$DB" -At -v ON_ERROR_STOP=1 -c "
SELECT string_agg(e.version::text,',' ORDER BY e.version)
FROM fitcore_execution_decision_events e
JOIN fitcore_execution_decisions d ON d.id=e.decision_id
WHERE d.tenant_id='$TENANT_A'::uuid AND d.proposal_id='$PROPOSAL_A';")"
[[ "$VERSIONS" == "1,2,3,4,5" ]]
echo "OK decision history: versions=$VERSIONS"
if docker exec "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -c "
  SET ROLE fitcore_app;
  SELECT set_config('app.tenant_id','$TENANT_B',false);
  SELECT fitcore_decision_intelligence('$TENANT_A'::uuid,720);" >/tmp/fitcore-decision89-cross.log 2>&1; then
  echo "ERRO: Decision Intelligence cross-tenant foi aceito." >&2; exit 6
fi
grep -q 'execution_tenant_context_mismatch' /tmp/fitcore-decision89-cross.log

if docker exec "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -c "
  SET ROLE fitcore_app;
  SELECT set_config('app.tenant_id','$TENANT_A',false);
  SELECT fitcore_decision_transition(
    '$TENANT_A'::uuid,'$ACTOR_B'::uuid,'$PROPOSAL_B','accepted',NULL,NULL,'user_accepted'
  );" >/tmp/fitcore-decision89-actor.log 2>&1; then
  echo "ERRO: ator de outro tenant alterou decisão." >&2; exit 7
fi
grep -q 'execution_decision_actor_mismatch' /tmp/fitcore-decision89-actor.log
echo "OK tenant/actor isolation: fail-closed"

apply_sql infra/sql/rollback-025-decision-intelligence.sql
MISSING="$(docker exec "$NAME" psql -U postgres -d "$DB" -AtF '|' -c "
SELECT
  to_regclass('public.fitcore_execution_decision_events') IS NULL,
  to_regprocedure('public.fitcore_decision_intelligence(uuid,integer)') IS NULL,
  NOT EXISTS (SELECT 1 FROM fitcore_schema_migrations WHERE version='025-decision-intelligence');")"
[[ "$MISSING" == "t|t|t" ]]
apply_sql infra/sql/025-decision-intelligence.sql

echo "DECISION_INTELLIGENCE_DB_GATE=PASS PostgreSQL=17.6"
