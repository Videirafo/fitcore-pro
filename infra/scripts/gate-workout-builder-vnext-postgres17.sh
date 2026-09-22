#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NAME="fitcore-builder93-pg17-${RANDOM}-$$"
PASS="fitcore-builder93"
DB="fitcore_builder93"
TENANT_A="93111111-1111-4111-8111-111111111111"
TENANT_B="93222222-2222-4222-8222-222222222222"
GESTOR_A="93aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
PROF_A="93bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
ALUNO_A="93cccccc-cccc-4ccc-8ccc-cccccccccccc"
STUDENT_A="93333333-3333-4333-8333-333333333333"
WORKOUT_A="93444444-4444-4444-8444-444444444444"

cleanup(){ docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD="$PASS" -e POSTGRES_DB="$DB" -p 127.0.0.1::5432 postgres:17.6-alpine >/dev/null
for _ in $(seq 1 80); do
  docker exec "$NAME" psql -U postgres -d "$DB" -Atqc 'select 1' 2>/dev/null | grep -qx 1 && break
  sleep 0.4
done

apply_sql(){ docker exec -i "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 < "$ROOT/$1" >/dev/null; }
apply_sql infra/sql/001-mvp-07-core.sql
apply_sql infra/sql/002-mvp-10-postgres-store.sql
apply_sql infra/sql/009-mvp-23-student-management.sql
apply_sql infra/sql/010-mvp-24-workout-prescription.sql
docker exec -i "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
CREATE ROLE fitcore_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
SQL
apply_sql infra/sql/030-workout-builder-vnext.sql
apply_sql infra/sql/030-workout-builder-vnext.sql

docker exec -i "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 <<SQL >/dev/null
INSERT INTO fitcore_tenants(id,slug,nome,status) VALUES
('$TENANT_A','builder93-a','Builder93 A','teste'),
('$TENANT_B','builder93-b','Builder93 B','teste');

INSERT INTO fitcore_users(id,tenant_id,nome,papel,ativo) VALUES
('$GESTOR_A','$TENANT_A','Gestor Builder','gestor',true),
('$PROF_A','$TENANT_A','Professor Builder','professor',true),
('$ALUNO_A','$TENANT_A','Aluno Builder','aluno',true);

INSERT INTO fitcore_students(
  id,tenant_id,nome_publico,nivel,status,user_id,professor_id,codigo_publico,objetivo,
  modalidade_preferida,frequencia_semana,etiquetas,consentimento_lgpd
) VALUES (
  '$STUDENT_A','$TENANT_A','Atleta Builder','intermediario','ativo','$ALUNO_A','$PROF_A',
  'B93','força','academia',4,'[]'::jsonb,true
);

INSERT INTO fitcore_workouts(
  id,tenant_id,source_mvp_id,student_id,objetivo,modalidade,foco,dias_semana,status,criado_por,
  professor_responsavel_id,payload
) VALUES (
  '$WORKOUT_A','$TENANT_A','builder93-source','$STUDENT_A','força','academia','superior',4,
  'rascunho','$GESTOR_A','$PROF_A','{"nome_treino":"Builder 93"}'::jsonb
);
SQL

VERSION_ID="$(docker exec "$NAME" psql -U postgres -d "$DB" -At -v ON_ERROR_STOP=1 -c "
SET ROLE fitcore_app;
SELECT set_config('app.tenant_id','$TENANT_A',false);
INSERT INTO fitcore_workout_builder_versions(
  tenant_id,workout_id,version,state,snapshot,periodization,created_by
) VALUES (
  '$TENANT_A','$WORKOUT_A',1,'draft',
  '{"name":"Upper A","days":[{"order":1,"title":"A","blocks":[{"order":1,"title":"Principal","exercises":[{"order":1,"name":"Supino","slug":"supino","sets":4,"reps":"8","rest_seconds":120,"target_rir_min":1,"target_rir_max":2,"target_rpe":8}]}]}]}'::jsonb,
  '{"model":"linear","weeks":[{"week":1,"load_delta_pct":0},{"week":2,"load_delta_pct":2.5}]}'::jsonb,
  '$GESTOR_A'
) RETURNING id;
" | tail -1)"
test -n "$VERSION_ID"

docker exec "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -c "
SET ROLE fitcore_app;
SELECT set_config('app.tenant_id','$TENANT_A',false);
UPDATE fitcore_workout_builder_versions SET state='published',published_at=now() WHERE id='$VERSION_ID';
" >/dev/null

if docker exec "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -c "
SET ROLE fitcore_app;
SELECT set_config('app.tenant_id','$TENANT_A',false);
UPDATE fitcore_workout_builder_versions SET snapshot='{}'::jsonb WHERE id='$VERSION_ID';
" >/tmp/fitcore-builder93-immutable.log 2>&1; then
  echo "ERRO: snapshot de versão pôde ser alterado." >&2; exit 7
fi
grep -q 'workout_builder_version_immutable' /tmp/fitcore-builder93-immutable.log
echo "OK builder version content: immutable"

docker exec "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -c "
SET ROLE fitcore_app;
SELECT set_config('app.tenant_id','$TENANT_A',false);
INSERT INTO fitcore_workout_templates(tenant_id,template_code,nome,source_version_id,created_by)
VALUES('$TENANT_A','upper_strength','Upper Strength','$VERSION_ID','$GESTOR_A');
INSERT INTO fitcore_workout_protocols(tenant_id,protocol_code,nome,defaults,created_by)
VALUES('$TENANT_A','strength_4x8','Strength 4x8','{"sets":4,"reps":"8","rest_seconds":120,"target_rir_min":1,"target_rir_max":2}'::jsonb,'$GESTOR_A');
" >/dev/null

if docker exec "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -c "
SET ROLE fitcore_app;
SELECT set_config('app.tenant_id','$TENANT_B',false);
SELECT count(*) FROM fitcore_workout_builder_versions WHERE tenant_id='$TENANT_A';
" >/tmp/fitcore-builder93-cross.log 2>&1; then
  VISIBLE="$(tail -1 /tmp/fitcore-builder93-cross.log | tr -d '[:space:]')"
else
  VISIBLE=""
fi
[[ "$VISIBLE" == "0" || -z "$VISIBLE" ]]
echo "OK builder RLS: cross-tenant hidden"

ROW="$(docker exec "$NAME" psql -U postgres -d "$DB" -AtF '|' -c "
SELECT
  (SELECT count(*) FROM fitcore_workout_builder_versions WHERE tenant_id='$TENANT_A'),
  (SELECT count(*) FROM fitcore_workout_templates WHERE tenant_id='$TENANT_A'),
  (SELECT count(*) FROM fitcore_workout_protocols WHERE tenant_id='$TENANT_A'),
  COALESCE((SELECT status FROM fitcore_schema_migrations WHERE version='030-workout-builder-vnext'),'missing');
")"
[[ "$ROW" == "1|1|1|aplicada" ]]

apply_sql infra/sql/rollback-030-workout-builder-vnext.sql
MISSING="$(docker exec "$NAME" psql -U postgres -d "$DB" -AtF '|' -c "
SELECT
  to_regclass('public.fitcore_workout_builder_versions') IS NULL,
  to_regclass('public.fitcore_workout_blocks') IS NULL,
  NOT EXISTS (SELECT 1 FROM fitcore_schema_migrations WHERE version='030-workout-builder-vnext');
")"
[[ "$MISSING" == "t|t|t" ]]
apply_sql infra/sql/030-workout-builder-vnext.sql

echo "WORKOUT_BUILDER_VNEXT_DB_GATE=PASS PostgreSQL=17.6"
