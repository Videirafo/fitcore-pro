#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NAME="fitcore-builder93-publish-pg17-${RANDOM}-$$"
PASS="fitcore-builder93-publish"
DB="fitcore_builder93_publish"

TENANT_A="93a11111-1111-4111-8111-111111111111"
TENANT_B="93b22222-2222-4222-8222-222222222222"
COACH_A="93aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
ALUNO_A="93cccccc-cccc-4ccc-8ccc-cccccccccccc"
STUDENT_A="93d33333-3333-4333-8333-333333333333"
BUILDER='{"schema_version":1,"title":"Hipertrofia A","objective":"hipertrofia","frequency_per_week":4,"protocol_code":"hypertrophy","periodization":{"type":"undulating","weeks":6},"days":[{"code":"day_1","title":"A - Superior","focus":"upper","blocks":[{"code":"chest_main","title":"Peito","type":"main","exercises":[{"slug":"supino-reto","name":"Supino reto","progression":{"kind":"load","step":2.5,"unit":"kg"},"sets":[{"order":1,"reps":"8","load":"70kg","rest_seconds":120,"rir_target":2,"rpe_target":8},{"order":2,"reps":"8","load":"70kg","rest_seconds":120,"rir_target":2,"rpe_target":8}]}]}]}]}'

cleanup(){ docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

command -v docker >/dev/null || { echo "ERRO: Docker obrigatório." >&2; exit 2; }
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
apply_sql infra/sql/010-mvp-24-workout-prescription.sql

docker exec -i "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
CREATE ROLE fitcore_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
SQL

apply_sql infra/sql/031-workout-builder-vnext.sql
apply_sql infra/sql/032-workout-builder-vnext-publish.sql
apply_sql infra/sql/032-workout-builder-vnext-publish.sql

docker exec -i "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 <<SQL >/dev/null
INSERT INTO fitcore_tenants(id,slug,nome,status) VALUES
('$TENANT_A','builder93-publish-a','Builder93 Publish A','teste'),
('$TENANT_B','builder93-publish-b','Builder93 Publish B','teste');

INSERT INTO fitcore_users(id,tenant_id,nome,papel,ativo) VALUES
('$COACH_A','$TENANT_A','Coach A','professor',true),
('$ALUNO_A','$TENANT_A','Aluno A','aluno',true);

INSERT INTO fitcore_students(
  id,tenant_id,nome_publico,nivel,status,user_id,professor_id,codigo_publico,objetivo,
  modalidade_preferida,frequencia_semana,etiquetas,consentimento_lgpd
) VALUES (
  '$STUDENT_A','$TENANT_A','Atleta A','intermediario','ativo','$ALUNO_A','$COACH_A',
  'A-93','hipertrofia','academia',4,'[]'::jsonb,true
);
SQL

PUBLISHED="$(docker exec "$NAME" psql -U postgres -d "$DB" -At -v ON_ERROR_STOP=1 -c "
SET ROLE fitcore_app;
SELECT set_config('app.tenant_id','$TENANT_A',false);
SELECT fitcore_workout_builder_publish(
  '$TENANT_A'::uuid,
  '$COACH_A'::uuid,
  '$STUDENT_A'::uuid,
  '$BUILDER'::jsonb,
  NULL
)::text;
" | tail -1)"

WORKOUT_ID="$(node -e '
const x=JSON.parse(process.argv[1]);
if(x.status!=="em_revisao"||x.prescription_version!==1||x.days!==1||x.blocks!==1||x.exercises!==1||x.sets!==2) process.exit(2);
console.log(x.workout_id);
' "$PUBLISHED")"
echo "OK publish: workout=$WORKOUT_ID"

COUNTS="$(docker exec "$NAME" psql -U postgres -d "$DB" -AtF '|' -c "
SELECT
  (SELECT count(*) FROM fitcore_workouts WHERE id='$WORKOUT_ID'::uuid AND tenant_id='$TENANT_A'::uuid),
  (SELECT count(*) FROM fitcore_workout_days WHERE workout_id='$WORKOUT_ID'::uuid),
  (SELECT count(*) FROM fitcore_workout_blocks b JOIN fitcore_workout_days d ON d.id=b.workout_day_id WHERE d.workout_id='$WORKOUT_ID'::uuid),
  (SELECT count(*) FROM fitcore_workout_exercises e JOIN fitcore_workout_days d ON d.id=e.workout_day_id WHERE d.workout_id='$WORKOUT_ID'::uuid),
  (SELECT count(*) FROM fitcore_workout_set_targets st JOIN fitcore_workout_exercises e ON e.id=st.workout_exercise_id JOIN fitcore_workout_days d ON d.id=e.workout_day_id WHERE d.workout_id='$WORKOUT_ID'::uuid),
  (SELECT count(*) FROM fitcore_professor_reviews WHERE workout_id='$WORKOUT_ID'::uuid),
  (SELECT count(*) FROM fitcore_workout_prescription_events WHERE workout_id='$WORKOUT_ID'::uuid AND evento='workout_builder_published'),
  (SELECT count(*) FROM fitcore_audit_events WHERE recurso_id='$WORKOUT_ID'::uuid AND acao='workout_builder_published');
")"
[[ "$COUNTS" == "1|1|1|1|2|1|1|1" ]]
echo "OK materialization: workout/day/block/exercise/sets/review/event/audit"

if docker exec "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -c "
SET ROLE fitcore_app;
SELECT set_config('app.tenant_id','$TENANT_B',false);
SELECT fitcore_workout_builder_publish(
  '$TENANT_A'::uuid,'$COACH_A'::uuid,'$STUDENT_A'::uuid,'$BUILDER'::jsonb,NULL
);
" >/tmp/fitcore-builder93-cross.log 2>&1; then
  echo "ERRO: publicação cross-tenant foi aceita." >&2
  exit 4
fi
grep -q 'workout_builder_tenant_context_mismatch' /tmp/fitcore-builder93-cross.log
echo "OK cross-tenant: fail-closed"

if docker exec "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -c "
SET ROLE fitcore_app;
SELECT set_config('app.tenant_id','$TENANT_A',false);
SELECT fitcore_workout_builder_publish(
  '$TENANT_A'::uuid,'$ALUNO_A'::uuid,'$STUDENT_A'::uuid,'$BUILDER'::jsonb,NULL
);
" >/tmp/fitcore-builder93-role.log 2>&1; then
  echo "ERRO: aluno publicou prescrição." >&2
  exit 5
fi
grep -q 'workout_builder_role_forbidden' /tmp/fitcore-builder93-role.log
echo "OK RBAC: aluno fail-closed"

apply_sql infra/sql/rollback-032-workout-builder-vnext-publish.sql
MISSING="$(docker exec "$NAME" psql -U postgres -d "$DB" -AtF '|' -c "
SELECT
  to_regprocedure('public.fitcore_workout_builder_publish(uuid,uuid,uuid,jsonb,uuid)') IS NULL,
  NOT EXISTS (SELECT 1 FROM fitcore_schema_migrations WHERE version='032-workout-builder-vnext-publish'),
  to_regclass('public.fitcore_workout_templates') IS NOT NULL;
")"
[[ "$MISSING" == "t|t|t" ]]
apply_sql infra/sql/032-workout-builder-vnext-publish.sql

echo "WORKOUT_BUILDER_VNEXT_PUBLISH_DB_GATE=PASS PostgreSQL=17.6"
