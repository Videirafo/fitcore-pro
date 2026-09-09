-- FITCORE PRO — MVP-25
-- Execução real do treino pelo aluno.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE fitcore_workout_executions
  ADD COLUMN IF NOT EXISTS exercise_progress jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS started_by uuid NULL,
  ADD COLUMN IF NOT EXISTS finished_by uuid NULL,
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_fitcore_executions_tenant_student_workout
  ON fitcore_workout_executions (tenant_id, student_id, workout_id, status);

CREATE TABLE IF NOT EXISTS fitcore_workout_execution_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  execution_id uuid NOT NULL REFERENCES fitcore_workout_executions(id) ON DELETE CASCADE,
  workout_id uuid NOT NULL REFERENCES fitcore_workouts(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES fitcore_students(id) ON DELETE CASCADE,
  actor_id uuid NULL REFERENCES fitcore_users(id) ON DELETE SET NULL,
  evento text NOT NULL,
  status text NOT NULL DEFAULT 'ok',
  exercise_index integer NULL,
  detalhe text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fitcore_execution_events_tenant_execution
  ON fitcore_workout_execution_events (tenant_id, execution_id, criado_em DESC);

ALTER TABLE fitcore_workout_execution_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON fitcore_workout_execution_events;
CREATE POLICY tenant_isolation ON fitcore_workout_execution_events
  USING (tenant_id::text = current_setting('app.tenant_id', true));

INSERT INTO fitcore_schema_migrations (version, descricao, status)
VALUES ('011-mvp-25-workout-execution', 'Execução real do treino pelo aluno com progresso por exercício e auditoria por tenant', 'aplicada')
ON CONFLICT (version) DO UPDATE SET status = EXCLUDED.status, descricao = EXCLUDED.descricao, aplicada_em = now();
