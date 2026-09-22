#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NAME="fitcore-assess92-pg17-${RANDOM}-$$"
PASS="fitcore-assess92"
DB="fitcore_assess92"

TENANT_A="92111111-1111-4111-8111-111111111111"
TENANT_B="92222222-2222-4222-8222-222222222222"
GESTOR_A="92aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
COACH_A="92bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
ALUNO_A="92cccccc-cccc-4ccc-8ccc-cccccccccccc"
ALUNO_B="92dddddd-dddd-4ddd-8ddd-dddddddddddd"
STUDENT_A="92333333-3333-4333-8333-333333333333"
STUDENT_B="92444444-4444-4444-8444-444444444444"

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
apply_sql infra/sql/028-assessments-anamnesis.sql
apply_sql infra/sql/028-assessments-anamnesis.sql

docker exec -i "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 <<SQL >/dev/null
INSERT INTO fitcore_tenants(id,slug,nome,status) VALUES
('$TENANT_A','assess92-a','Assess92 A','teste'),
('$TENANT_B','assess92-b','Assess92 B','teste');

INSERT INTO fitcore_users(id,tenant_id,nome,papel,ativo) VALUES
('$GESTOR_A','$TENANT_A','Gestor A','gestor',true),
('$COACH_A','$TENANT_A','Coach A','professor',true),
('$ALUNO_A','$TENANT_A','Aluno A','aluno',true),
('$ALUNO_B','$TENANT_B','Aluno B','aluno',true);

INSERT INTO fitcore_students(
  id,tenant_id,nome_publico,nivel,status,user_id,professor_id,codigo_publico,objetivo,
  modalidade_preferida,frequencia_semana,etiquetas,consentimento_lgpd
) VALUES
('$STUDENT_A','$TENANT_A','Atleta A','intermediario','ativo','$ALUNO_A','$COACH_A','A-92','força','academia',3,'[]'::jsonb,true),
('$STUDENT_B','$TENANT_B','Atleta B','iniciante','ativo','$ALUNO_B',NULL,'B-92','condicionamento','academia',2,'[]'::jsonb,false);
SQL

sql_a() {
  docker exec "$NAME" psql -U postgres -d "$DB" -At -v ON_ERROR_STOP=1 -c "
    SET ROLE fitcore_app;
    SELECT set_config('app.tenant_id','$TENANT_A',false);
    $1" | tail -1
}

ANAM_V1="$(sql_a "SELECT fitcore_assessment_template_publish(
  '$TENANT_A'::uuid,'$GESTOR_A'::uuid,'gestor',
  'anamnesis_standard','Anamnese inicial','anamnesis',
  jsonb_build_object('fields',jsonb_build_array('training_history','declared_restrictions','routine'))
)::text;")"
node -e 'const x=JSON.parse(process.argv[1]); if(x.version!==1||x.assessment_kind!=="anamnesis") process.exit(2)' "$ANAM_V1"

ANAM_V2="$(sql_a "SELECT fitcore_assessment_template_publish(
  '$TENANT_A'::uuid,'$GESTOR_A'::uuid,'gestor',
  'anamnesis_standard','Anamnese inicial v2','anamnesis',
  jsonb_build_object('fields',jsonb_build_array('training_history','declared_restrictions','routine','sleep_quality'))
)::text;")"
node -e 'const x=JSON.parse(process.argv[1]); if(x.version!==2) process.exit(2)' "$ANAM_V2"

PHYS_V1="$(sql_a "SELECT fitcore_assessment_template_publish(
  '$TENANT_A'::uuid,'$GESTOR_A'::uuid,'gestor',
  'physical_standard','Avaliação física','physical',
  jsonb_build_object('measurements',jsonb_build_array('body_weight','waist_circumference'))
)::text;")"
node -e 'const x=JSON.parse(process.argv[1]); if(x.version!==1||x.assessment_kind!=="physical") process.exit(2)' "$PHYS_V1"
echo "OK templates: versionados e append-only"

CONSENT_ASSESS="$(sql_a "SELECT fitcore_assessment_consent_record(
  '$TENANT_A'::uuid,'$ALUNO_A'::uuid,'aluno','$STUDENT_A'::uuid,
  'assessment_data','granted','v1'
)::text;")"
CONSENT_AI="$(sql_a "SELECT fitcore_assessment_consent_record(
  '$TENANT_A'::uuid,'$ALUNO_A'::uuid,'aluno','$STUDENT_A'::uuid,
  'ai_coach_derived_signals','granted','v1'
)::text;")"
node -e 'for(const s of process.argv.slice(1)){const x=JSON.parse(s); if(x.state!=="granted") process.exit(2)}' "$CONSENT_ASSESS" "$CONSENT_AI"
echo "OK consent: assessment_data + ai_coach_derived_signals"

ANAM="$(sql_a "SELECT fitcore_assessment_record(
  '$TENANT_A'::uuid,'$ALUNO_A'::uuid,'aluno','$STUDENT_A'::uuid,
  'anamnesis_standard',2,'anamnesis',
  jsonb_build_object('training_history','1 ano','declared_restrictions','nenhuma declarada','routine','3x semana','sleep_quality','regular'),
  '[]'::jsonb,'[]'::jsonb,NULL
)::text;")"
ANAM_ID="$(node -e 'const x=JSON.parse(process.argv[1]); if(x.assessment_kind!=="anamnesis"||x.measurement_count!==0) process.exit(2); console.log(x.id)' "$ANAM")"
echo "OK student anamnesis: $ANAM_ID"

if sql_a "SELECT fitcore_assessment_record(
  '$TENANT_A'::uuid,'$ALUNO_A'::uuid,'aluno','$STUDENT_A'::uuid,
  'physical_standard',1,'physical','{}'::jsonb,
  jsonb_build_array(jsonb_build_object('code','body_weight','value',80,'unit','kg')),
  '[]'::jsonb,NULL
)::text;" >/tmp/fitcore-assess92-student-physical.log 2>&1; then
  echo "ERRO: aluno criou avaliação física." >&2; exit 5
fi
grep -q 'assessment_student_write_forbidden' /tmp/fitcore-assess92-student-physical.log
echo "OK aluno physical write: fail-closed"

OBJ1="private/$TENANT_A/students/$STUDENT_A/assessments/front-v1.jpg"
PHYS1="$(sql_a "SELECT fitcore_assessment_record(
  '$TENANT_A'::uuid,'$COACH_A'::uuid,'professor','$STUDENT_A'::uuid,
  'physical_standard',1,'physical',
  jsonb_build_object('notes','registro profissional sem diagnóstico'),
  jsonb_build_array(jsonb_build_object('code','body_weight','value',80,'unit','kg','method','scale'),jsonb_build_object('code','waist_circumference','value',90,'unit','cm','method','tape')),
  jsonb_build_array(jsonb_build_object('label','Foto frontal','object_key','$OBJ1','media_type','image/jpeg','sha256','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','size_bytes',123456)),
  NULL
)::text;")"
PHYS1_ID="$(node -e 'const x=JSON.parse(process.argv[1]); if(x.measurement_count!==2||x.attachment_count!==1) process.exit(2); console.log(x.id)' "$PHYS1")"

sleep 0.05
PHYS2="$(sql_a "SELECT fitcore_assessment_record(
  '$TENANT_A'::uuid,'$COACH_A'::uuid,'professor','$STUDENT_A'::uuid,
  'physical_standard',1,'physical',
  jsonb_build_object('notes','reavaliação descritiva'),
  jsonb_build_array(jsonb_build_object('code','body_weight','value',79,'unit','kg','method','scale'),jsonb_build_object('code','waist_circumference','value',88.5,'unit','cm','method','tape')),
  '[]'::jsonb,NULL
)::text;")"
PHYS2_ID="$(node -e 'const x=JSON.parse(process.argv[1]); if(x.measurement_count!==2) process.exit(2); console.log(x.id)' "$PHYS2")"
echo "OK physical records: $PHYS1_ID -> $PHYS2_ID"

SUMMARY="$(sql_a "SELECT fitcore_assessment_summary(
  '$TENANT_A'::uuid,'$ALUNO_A'::uuid,'aluno',NULL
)::text;")"
node -e '
const s=JSON.parse(process.argv[1]);
if(s.assessment_count!==3||s.anamnesis_count!==1||s.physical_count!==2) process.exit(2);
if(s.assessment_data_consent!=="granted"||s.ai_coach_allowed!==true) process.exit(3);
if(s.signals_policy.server_side_only!==true||s.signals_policy.clinical_inference!==false) process.exit(4);
const w=s.measurement_trends.find(x=>x.measurement_code==="body_weight");
const c=s.measurement_trends.find(x=>x.measurement_code==="waist_circumference");
if(Number(w.latest_value)!==79||Number(w.previous_value)!==80||Number(w.delta)!==-1) process.exit(5);
if(Number(c.latest_value)!==88.5||Number(c.previous_value)!==90||Number(c.delta)!==-1.5) process.exit(6);
' "$SUMMARY"
echo "OK summary: temporal deltas + descriptive server-side signals"

HISTORY="$(sql_a "SELECT fitcore_assessment_history(
  '$TENANT_A'::uuid,'$COACH_A'::uuid,'professor','$STUDENT_A'::uuid,20
)::text;")"
node -e '
const h=JSON.parse(process.argv[1]);
if(h.records.length!==3) process.exit(2);
const p=h.records.find(x=>x.id===process.argv[2]);
if(!p||p.measurements.length!==2||p.attachments.length!==1) process.exit(3);
if("object_key" in p.attachments[0]) process.exit(4);
const raw=JSON.stringify(h.summary);
if(raw.includes("declared_restrictions")||raw.includes("training_history")) process.exit(5);
' "$HISTORY" "$PHYS1_ID"
echo "OK history: raw only in authorized records; summary excludes raw responses/object keys"

if docker exec "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -c "
  UPDATE fitcore_assessments SET responses='{}'::jsonb WHERE id='$ANAM_ID'::uuid;
" >/tmp/fitcore-assess92-immutable.log 2>&1; then
  echo "ERRO: histórico de assessment mutável." >&2; exit 7
fi
grep -q 'assessment_history_immutable' /tmp/fitcore-assess92-immutable.log
echo "OK immutable history"

CONSENT_REVOKE_AI="$(sql_a "SELECT fitcore_assessment_consent_record(
  '$TENANT_A'::uuid,'$ALUNO_A'::uuid,'aluno','$STUDENT_A'::uuid,
  'ai_coach_derived_signals','revoked','v1'
)::text;")"
SUMMARY_REVOKED="$(sql_a "SELECT fitcore_assessment_summary(
  '$TENANT_A'::uuid,'$ALUNO_A'::uuid,'aluno',NULL
)::text;")"
node -e 'const s=JSON.parse(process.argv[1]); if(s.ai_coach_allowed!==false) process.exit(2)' "$SUMMARY_REVOKED"

sql_a "SELECT fitcore_assessment_consent_record(
  '$TENANT_A'::uuid,'$ALUNO_A'::uuid,'aluno','$STUDENT_A'::uuid,
  'assessment_data','revoked','v1'
)::text;" >/dev/null

if sql_a "SELECT fitcore_assessment_record(
  '$TENANT_A'::uuid,'$ALUNO_A'::uuid,'aluno','$STUDENT_A'::uuid,
  'anamnesis_standard',2,'anamnesis','{}'::jsonb,'[]'::jsonb,'[]'::jsonb,NULL
)::text;" >/tmp/fitcore-assess92-consent.log 2>&1; then
  echo "ERRO: assessment criado após revogação." >&2; exit 8
fi
grep -q 'assessment_consent_required' /tmp/fitcore-assess92-consent.log
echo "OK consent revoke: fail-closed"

if docker exec "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -c "
  SET ROLE fitcore_app;
  SELECT set_config('app.tenant_id','$TENANT_B',false);
  SELECT fitcore_assessment_summary('$TENANT_A'::uuid,'$GESTOR_A'::uuid,'gestor','$STUDENT_A'::uuid);
" >/tmp/fitcore-assess92-cross.log 2>&1; then
  echo "ERRO: cross-tenant assessment aceito." >&2; exit 9
fi
grep -Eq 'athlete360_tenant_context_mismatch|assessment_tenant_context_mismatch' /tmp/fitcore-assess92-cross.log
echo "OK tenant isolation: fail-closed"

apply_sql infra/sql/rollback-028-assessments-anamnesis.sql
MISSING="$(docker exec "$NAME" psql -U postgres -d "$DB" -AtF '|' -c "
SELECT
  to_regclass('public.fitcore_assessments') IS NULL,
  to_regclass('public.fitcore_assessment_measurements') IS NULL,
  to_regprocedure('public.fitcore_assessment_summary(uuid,uuid,text,uuid)') IS NULL,
  NOT EXISTS (SELECT 1 FROM fitcore_schema_migrations WHERE version='028-assessments-anamnesis');")"
[[ "$MISSING" == "t|t|t|t" ]]
apply_sql infra/sql/028-assessments-anamnesis.sql

echo "ASSESSMENTS_ANAMNESIS_DB_GATE=PASS PostgreSQL=17.6"
