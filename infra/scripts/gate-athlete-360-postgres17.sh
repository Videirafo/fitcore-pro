#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NAME="fitcore-athlete91-pg17-${RANDOM}-$$"
PASS="fitcore-athlete91"
DB="fitcore_athlete91"

TENANT_A="91111111-1111-4111-8111-111111111111"
TENANT_B="91222222-2222-4222-8222-222222222222"
GESTOR_A="91aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
COACH_A="91bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
ALUNO_A="91cccccc-cccc-4ccc-8ccc-cccccccccccc"
ALUNO_B="91dddddd-dddd-4ddd-8ddd-dddddddddddd"
STUDENT_A="91333333-3333-4333-8333-333333333333"
STUDENT_B="91444444-4444-4444-8444-444444444444"
WORKOUT_A="91555555-5555-4555-8555-555555555555"
EXEC_A="91666666-6666-4666-8666-666666666666"

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
apply_sql infra/sql/009-mvp-23-student-management.sql
docker exec -i "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
CREATE ROLE fitcore_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
SQL
apply_sql infra/sql/023-execution-kernel-v2.sql
apply_sql infra/sql/024-execution-analytics-nba.sql
apply_sql infra/sql/025-decision-intelligence.sql
apply_sql infra/sql/026-execution-remediation.sql
apply_sql infra/sql/027-athlete-360.sql
apply_sql infra/sql/027-athlete-360.sql

docker exec -i "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 <<SQL >/dev/null
INSERT INTO fitcore_tenants(id,slug,nome,status) VALUES
('$TENANT_A','athlete91-a','Athlete91 A','teste'),
('$TENANT_B','athlete91-b','Athlete91 B','teste');
INSERT INTO fitcore_users(id,tenant_id,nome,papel,ativo) VALUES
('$GESTOR_A','$TENANT_A','Gestor A','gestor',true),
('$COACH_A','$TENANT_A','Coach A','professor',true),
('$ALUNO_A','$TENANT_A','Aluno A','aluno',true),
('$ALUNO_B','$TENANT_B','Aluno B','aluno',true);
INSERT INTO fitcore_students(
  id,tenant_id,nome_publico,nivel,status,user_id,professor_id,codigo_publico,objetivo,
  modalidade_preferida,frequencia_semana,etiquetas,consentimento_lgpd
) VALUES
('$STUDENT_A','$TENANT_A','Atleta A','intermediario','ativo','$ALUNO_A','$COACH_A','A-91','ganho de força','academia',3,'["forca","consistente"]'::jsonb,true),
('$STUDENT_B','$TENANT_B','Atleta B','iniciante','ativo','$ALUNO_B',NULL,'B-91','condicionamento','academia',2,'[]'::jsonb,false);
INSERT INTO fitcore_workouts(
  id,tenant_id,student_id,objetivo,modalidade,foco,dias_semana,status,criado_por,aprovado_por,aprovado_em
) VALUES (
  '$WORKOUT_A','$TENANT_A','$STUDENT_A','ganho de força','academia','full body',3,'aprovado','$COACH_A','$COACH_A',now()-interval '3 days'
);
INSERT INTO fitcore_workout_executions(
  id,tenant_id,workout_id,student_id,status,percepcao_esforco,duracao_minutos,iniciado_em,concluido_em,criado_por
) VALUES
('$EXEC_A','$TENANT_A','$WORKOUT_A','$STUDENT_A','concluido',7,48,now()-interval '1 day 50 minutes',now()-interval '1 day','$ALUNO_A'),
(gen_random_uuid(),'$TENANT_A','$WORKOUT_A','$STUDENT_A','concluido',8,52,now()-interval '3 days 55 minutes',now()-interval '3 days','$ALUNO_A'),
(gen_random_uuid(),'$TENANT_A','$WORKOUT_A','$STUDENT_A','concluido',7,46,now()-interval '6 days 50 minutes',now()-interval '6 days','$ALUNO_A');
INSERT INTO fitcore_execution_decisions(
  tenant_id,actor_user_id,proposal_id,rule_version,action_id,reason_code,priority,state,resource_id,
  accepted_at,execution_started_at,settled_at,outcome_recorded_at,outcome_code,outcome_metric_name,outcome_metric_value
) VALUES (
  '$TENANT_A','$ALUNO_A','nba_91919191919191919191919191919191',1,
  'fitcore.workout.execution.start','approved_workout_ready','medium','outcome_recorded','$WORKOUT_A',
  now()-interval '2 days',now()-interval '2 days',now()-interval '2 days',now()-interval '2 days',
  'session_started','completion',1
);
SQL

sql_a() {
  docker exec "$NAME" psql -U postgres -d "$DB" -At -v ON_ERROR_STOP=1 -c "
    SET ROLE fitcore_app;
    SELECT set_config('app.tenant_id','$TENANT_A',false);
    $1" | tail -1
}

GOAL="$(sql_a "SELECT fitcore_athlete_goal_create(
  '$TENANT_A'::uuid,'$ALUNO_A'::uuid,'aluno','$STUDENT_A'::uuid,
  'Treinar 3 vezes por semana','weekly_frequency',3,'treinos/semana',(current_date+interval '60 days')::date,'high'
)::text;")"
GOAL_ID="$(node -e 'const g=JSON.parse(process.argv[1]); if(g.status!=="active"||g.goal_code!=="weekly_frequency") process.exit(2); console.log(g.id)' "$GOAL")"
echo "OK goal create: $GOAL_ID"

UPDATED="$(sql_a "SELECT fitcore_athlete_goal_update(
  '$TENANT_A'::uuid,'$ALUNO_A'::uuid,'aluno','$GOAL_ID'::uuid,2,NULL,'weekly_progress'
)::text;")"
node -e 'const g=JSON.parse(process.argv[1]); if(Number(g.progress_value)!==2||g.status!=="active") process.exit(2)' "$UPDATED"
echo "OK goal progress update"

SNAP="$(sql_a "SELECT fitcore_athlete_360_snapshot(
  '$TENANT_A'::uuid,'$ALUNO_A'::uuid,'aluno',NULL
)::text;")"
node -e '
const x=JSON.parse(process.argv[1]);
if(x.student_id!==process.argv[2]) process.exit(2);
if(x.profile.name!=="Atleta A"||x.profile.weekly_frequency_target!==3) process.exit(3);
if(x.relationships.coach_name!=="Coach A"||x.relationships.tenant_slug!=="athlete91-a") process.exit(4);
if(!Array.isArray(x.goals)||x.goals.length!==1||Number(x.goals[0].progress_value)!==2) process.exit(5);
if(x.training.approved_workouts!==1) process.exit(6);
if(x.adherence.completed_7d!==3||Number(x.adherence.adherence_28d_pct)!==25) process.exit(7);
if(!Array.isArray(x.timeline)||x.timeline.length<5) process.exit(8);
if(!Array.isArray(x.decisions)||x.decisions.length!==1||x.decisions[0].outcome_code!=="session_started") process.exit(9);
if(x.availability.physical_assessments!==false||x.availability.pr_engine!==false) process.exit(10);
if(x.privacy.medical_data_included!==false||x.privacy.tenant_scoped!==true) process.exit(11);
const raw=JSON.stringify(x);
for(const bad of ["email","telefone","observacoes_minimas","payload"]) if(raw.includes(bad)) process.exit(12);
' "$SNAP" "$STUDENT_A"
echo "OK snapshot: profile + coach + goals + adherence + timeline + decisions + privacy"

COACH="$(sql_a "SELECT fitcore_athlete_360_snapshot(
  '$TENANT_A'::uuid,'$COACH_A'::uuid,'professor','$STUDENT_A'::uuid
)::text;")"
node -e 'const x=JSON.parse(process.argv[1]); if(x.student_id!==process.argv[2]||x.relationships.coach_id!==process.argv[3]) process.exit(2)' "$COACH" "$STUDENT_A" "$COACH_A"
echo "OK coach access: linked athlete"

GESTOR="$(sql_a "SELECT fitcore_athlete_360_snapshot(
  '$TENANT_A'::uuid,'$GESTOR_A'::uuid,'gestor','$STUDENT_A'::uuid
)::text;")"
node -e 'const x=JSON.parse(process.argv[1]); if(x.student_id!==process.argv[2]) process.exit(2)' "$GESTOR" "$STUDENT_A"
echo "OK gestor access"

if sql_a "SELECT fitcore_athlete_360_snapshot(
  '$TENANT_A'::uuid,'$ALUNO_A'::uuid,'aluno','$STUDENT_B'::uuid
)::text;" >/tmp/fitcore-ath91-other.log 2>&1; then
  echo "ERRO: aluno acessou outro atleta." >&2; exit 5
fi
grep -q 'athlete360_student_not_found_or_forbidden' /tmp/fitcore-ath91-other.log

if docker exec "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -c "
  SET ROLE fitcore_app;
  SELECT set_config('app.tenant_id','$TENANT_B',false);
  SELECT fitcore_athlete_360_snapshot('$TENANT_A'::uuid,'$GESTOR_A'::uuid,'gestor','$STUDENT_A'::uuid);
" >/tmp/fitcore-ath91-cross.log 2>&1; then
  echo "ERRO: cross-tenant Athlete 360 aceito." >&2; exit 6
fi
grep -q 'athlete360_tenant_context_mismatch' /tmp/fitcore-ath91-cross.log
echo "OK tenant/RBAC isolation: fail-closed"

EVENTS="$(docker exec "$NAME" psql -U postgres -d "$DB" -Atqc "
SELECT count(*) FROM fitcore_athlete_goal_events WHERE tenant_id='$TENANT_A'::uuid AND student_id='$STUDENT_A'::uuid;")"
[[ "$EVENTS" = "2" ]]
echo "OK goal audit events=$EVENTS"

apply_sql infra/sql/rollback-027-athlete-360.sql
MISSING="$(docker exec "$NAME" psql -U postgres -d "$DB" -AtF '|' -c "
SELECT
  to_regclass('public.fitcore_athlete_goals') IS NULL,
  to_regclass('public.fitcore_athlete_goal_events') IS NULL,
  to_regprocedure('public.fitcore_athlete_360_snapshot(uuid,uuid,text,uuid)') IS NULL,
  NOT EXISTS (SELECT 1 FROM fitcore_schema_migrations WHERE version='027-athlete-360');")"
[[ "$MISSING" == "t|t|t|t" ]]
apply_sql infra/sql/027-athlete-360.sql

echo "ATHLETE_360_DB_GATE=PASS PostgreSQL=17.6"
