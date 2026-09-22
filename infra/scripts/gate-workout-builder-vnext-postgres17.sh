#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NAME="fitcore-builder93-pg17-${RANDOM}-$$"
PASS="fitcore-builder93"
DB="fitcore_builder93"

TENANT_A="93111111-1111-4111-8111-111111111111"
TENANT_B="93222222-2222-4222-8222-222222222222"
COACH_A="93aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
STUDENT_A="93333333-3333-4333-8333-333333333333"
WORKOUT_A="93444444-4444-4444-8444-444444444444"
DAY_A="93555555-5555-4555-8555-555555555555"
EXERCISE_A="93666666-6666-4666-8666-666666666666"
BLOCK_A="93777777-7777-4777-8777-777777777777"

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
apply_sql infra/sql/031-workout-builder-vnext.sql
apply_sql infra/sql/031-workout-builder-vnext.sql

docker exec -i "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 <<SQL >/dev/null
CREATE ROLE fitcore_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT SELECT ON fitcore_workout_templates,fitcore_workout_blocks,fitcore_workout_set_targets TO fitcore_app;

INSERT INTO fitcore_tenants(id,slug,nome,status) VALUES
('$TENANT_A','builder93-a','Builder93 A','teste'),
('$TENANT_B','builder93-b','Builder93 B','teste');

INSERT INTO fitcore_users(id,tenant_id,nome,papel,ativo) VALUES
('$COACH_A','$TENANT_A','Coach A','professor',true);

INSERT INTO fitcore_students(id,tenant_id,nome_publico,nivel,status,criado_por) VALUES
('$STUDENT_A','$TENANT_A','Aluno A','intermediario','ativo','$COACH_A');

INSERT INTO fitcore_workouts(
  id,tenant_id,student_id,objetivo,modalidade,foco,dias_semana,status,criado_por,
  prescription_version,builder_schema_version,protocol_code,periodization
) VALUES (
  '$WORKOUT_A','$TENANT_A','$STUDENT_A','hipertrofia','academia','upper',4,'em_revisao','$COACH_A',
  1,1,'hypertrophy','{"type":"undulating","weeks":6}'::jsonb
);

INSERT INTO fitcore_workout_days(id,tenant_id,workout_id,ordem,titulo,foco)
VALUES ('$DAY_A','$TENANT_A','$WORKOUT_A',1,'A - Superior','upper');

INSERT INTO fitcore_workout_blocks(id,tenant_id,workout_day_id,ordem,block_code,title,block_type)
VALUES ('$BLOCK_A','$TENANT_A','$DAY_A',1,'chest_main','Peito','main');

INSERT INTO fitcore_workout_exercises(
  id,tenant_id,workout_day_id,block_id,ordem,slug,nome,series,repeticoes,descanso_segundos,progression
) VALUES (
  '$EXERCISE_A','$TENANT_A','$DAY_A','$BLOCK_A',1,'supino-reto','Supino reto',2,'8',120,
  '{"kind":"load","step":2.5,"unit":"kg"}'::jsonb
);

INSERT INTO fitcore_workout_set_targets(
  tenant_id,workout_exercise_id,set_order,reps,load_target,rest_seconds,rir_target,rpe_target,tempo
) VALUES
('$TENANT_A','$EXERCISE_A',1,'8','70kg',120,2,8,'3-1-1'),
('$TENANT_A','$EXERCISE_A',2,'8','70kg',120,2,8,'3-1-1');

INSERT INTO fitcore_workout_templates(
  tenant_id,template_key,version,title,objective,protocol_code,periodization,builder,status,created_by_user_id,published_at
) VALUES (
  '$TENANT_A','hypertrophy_ab',1,'Hipertrofia A/B','hipertrofia','hypertrophy',
  '{"type":"undulating","weeks":6}'::jsonb,
  '{"schema_version":1,"days":[{"code":"day_1"}]}'::jsonb,
  'published','$COACH_A',now()
);
SQL

COUNT_A="$(docker exec "$NAME" psql -U postgres -d "$DB" -Atqc "
SET ROLE fitcore_app;
SELECT set_config('app.tenant_id','$TENANT_A',false);
SELECT count(*) FROM fitcore_workout_templates;
")"
[[ "$(echo "$COUNT_A" | tail -1)" == "1" ]]

COUNT_B="$(docker exec "$NAME" psql -U postgres -d "$DB" -Atqc "
SET ROLE fitcore_app;
SELECT set_config('app.tenant_id','$TENANT_B',false);
SELECT count(*) FROM fitcore_workout_templates;
")"
[[ "$(echo "$COUNT_B" | tail -1)" == "0" ]]
echo "OK tenant isolation: templates fail-closed"

if docker exec "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -c "
INSERT INTO fitcore_workout_set_targets(
  tenant_id,workout_exercise_id,set_order,reps,rest_seconds,rpe_target
) VALUES ('$TENANT_A','$EXERCISE_A',3,'8',90,11);
" >/tmp/fitcore-builder93-invalid.log 2>&1; then
  echo "ERRO: rpe_target inválido foi aceito." >&2
  exit 4
fi
grep -q 'fitcore_workout_set_targets_rpe_target_check' /tmp/fitcore-builder93-invalid.log
echo "OK target bounds: fail-closed"

SUMMARY="$(docker exec "$NAME" psql -U postgres -d "$DB" -AtF '|' -c "
SELECT
  (SELECT count(*) FROM fitcore_workout_templates WHERE tenant_id='$TENANT_A'::uuid),
  (SELECT count(*) FROM fitcore_workout_blocks WHERE tenant_id='$TENANT_A'::uuid),
  (SELECT count(*) FROM fitcore_workout_set_targets WHERE tenant_id='$TENANT_A'::uuid),
  (SELECT protocol_code FROM fitcore_workouts WHERE id='$WORKOUT_A'::uuid),
  (SELECT periodization->>'type' FROM fitcore_workouts WHERE id='$WORKOUT_A'::uuid);
")"
[[ "$SUMMARY" == "1|1|2|hypertrophy|undulating" ]]
echo "OK builder schema: template + block + set targets + periodization"

apply_sql infra/sql/rollback-031-workout-builder-vnext.sql
MISSING="$(docker exec "$NAME" psql -U postgres -d "$DB" -AtF '|' -c "
SELECT
  to_regclass('public.fitcore_workout_templates') IS NULL,
  to_regclass('public.fitcore_workout_blocks') IS NULL,
  to_regclass('public.fitcore_workout_set_targets') IS NULL,
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='fitcore_workouts' AND column_name='prescription_version'
  ),
  NOT EXISTS (SELECT 1 FROM fitcore_schema_migrations WHERE version='031-workout-builder-vnext');
")"
[[ "$MISSING" == "t|t|t|t|t" ]]
apply_sql infra/sql/031-workout-builder-vnext.sql

echo "WORKOUT_BUILDER_VNEXT_DB_GATE=PASS PostgreSQL=17.6"
