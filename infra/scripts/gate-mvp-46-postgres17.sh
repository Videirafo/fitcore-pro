#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NAME="fitcore-mvp46-pg17-${RANDOM}-$$"
PASS="fitcore-mvp46-gate"
DB="fitcore_mvp46"
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

command -v docker >/dev/null || { echo "ERRO: Docker obrigatório para gate PostgreSQL 17." >&2; exit 2; }

docker run -d --rm --name "$NAME" \
  -e POSTGRES_PASSWORD="$PASS" \
  -e POSTGRES_DB="$DB" \
  -p 127.0.0.1::5432 \
  postgres:17.6-alpine >/dev/null

for _ in $(seq 1 40); do
  if docker exec "$NAME" pg_isready -U postgres -d "$DB" >/dev/null 2>&1; then break; fi
  sleep 0.5
done
docker exec "$NAME" pg_isready -U postgres -d "$DB" >/dev/null

apply_sql() {
  local file="$1"
  docker exec -i "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 < "$ROOT/$file" >/dev/null
}

for file in \
  infra/sql/001-mvp-07-core.sql \
  infra/sql/002-mvp-10-postgres-store.sql \
  infra/sql/009-mvp-23-student-management.sql \
  infra/sql/010-mvp-24-workout-prescription.sql \
  infra/sql/011-mvp-25-workout-execution.sql \
  infra/sql/019-mvp-46-mobile-release.sql; do
  apply_sql "$file"
done

# Reapply proves the migration is idempotent.
apply_sql infra/sql/019-mvp-46-mobile-release.sql

docker exec -i "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
INSERT INTO fitcore_tenants (id, slug, nome, status) VALUES
('11111111-1111-4111-8111-111111111111','tenant-a','Tenant A','teste'),
('22222222-2222-4222-8222-222222222222','tenant-b','Tenant B','teste')
ON CONFLICT (id) DO NOTHING;
SQL
docker exec -i "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
INSERT INTO fitcore_users (id, tenant_id, nome, papel, ativo) VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','Aluno A','aluno',true),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','Aluno B','aluno',true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO fitcore_students (id, tenant_id, nome_publico, status, user_id) VALUES
('cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111','Aluno A','ativo','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
('dddddddd-dddd-4ddd-8ddd-dddddddddddd','22222222-2222-4222-8222-222222222222','Aluno B','ativo','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
ON CONFLICT (id) DO NOTHING;

INSERT INTO fitcore_workouts (id, tenant_id, student_id, objetivo, status) VALUES
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','11111111-1111-4111-8111-111111111111','cccccccc-cccc-4ccc-8ccc-cccccccccccc','Força','aprovado'),
('ffffffff-ffff-4fff-8fff-ffffffffffff','22222222-2222-4222-8222-222222222222','dddddddd-dddd-4ddd-8ddd-dddddddddddd','Força','aprovado')
ON CONFLICT (id) DO NOTHING;
SQL
docker exec -i "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
INSERT INTO fitcore_workout_executions (
  id, tenant_id, workout_id, student_id, status, exercise_progress
) VALUES
('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','cccccccc-cccc-4ccc-8ccc-cccccccccccc','em_execucao','[{"index":0},{"index":1}]'::jsonb),
('44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222','ffffffff-ffff-4fff-8fff-ffffffffffff','dddddddd-dddd-4ddd-8ddd-dddddddddddd','em_execucao','[{"index":0}]'::jsonb)
ON CONFLICT (id) DO NOTHING;
SQL

HOST_PORT="$(docker port "$NAME" 5432/tcp | awk -F: 'NR==1{print $NF}')"
export FITCORE_MVP46_TEST_DATABASE_URL="postgresql://postgres:${PASS}@127.0.0.1:${HOST_PORT}/${DB}?sslmode=disable"
node "$ROOT/tools/test-mvp-46-set-sync.mjs"
docker exec -i "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 <<'SQL' >/tmp/fitcore-mvp46-rls.txt
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fitcore_mvp46_app') THEN
    CREATE ROLE fitcore_mvp46_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO fitcore_mvp46_app;
GRANT SELECT, INSERT, UPDATE ON fitcore_workout_execution_sets TO fitcore_mvp46_app;
SET ROLE fitcore_mvp46_app;
SELECT set_config('app.tenant_id','11111111-1111-4111-8111-111111111111',false);
SELECT count(*) FROM fitcore_workout_execution_sets;
RESET ROLE;
SQL
RLS_COUNT="$(grep -E '^[[:space:]]*[0-9]+[[:space:]]*$' /tmp/fitcore-mvp46-rls.txt | tail -1 | tr -d '[:space:]')"
[[ "$RLS_COUNT" == "1" ]] || { echo "ERRO: RLS esperado=1 observado=$RLS_COUNT" >&2; exit 4; }

echo "OK: API idempotente, ownership e RLS validados em PostgreSQL 17.6."

# Rollback/reapply somente neste banco descartável.
apply_sql infra/sql/rollback-019-mvp-46-mobile-release.sql
apply_sql infra/sql/019-mvp-46-mobile-release.sql
docker exec "$NAME" psql -U postgres -d "$DB" -Atqc \
  "SELECT to_regclass('public.fitcore_workout_execution_sets') IS NOT NULL" | grep -qx t

echo "OK: rollback destrutivo descartável + reapply verificados."
