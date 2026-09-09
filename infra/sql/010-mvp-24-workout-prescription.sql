-- FITCORE PRO — MVP-24
-- Prescrição real de treino vinculada ao aluno, professor, tenant e auditoria.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE fitcore_workouts
  ADD COLUMN IF NOT EXISTS professor_responsavel_id uuid REFERENCES fitcore_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fitcore_workouts_tenant_student_status
  ON fitcore_workouts (tenant_id, student_id, status, atualizado_em DESC);

CREATE INDEX IF NOT EXISTS idx_fitcore_workouts_tenant_professor
  ON fitcore_workouts (tenant_id, professor_responsavel_id, atualizado_em DESC);

CREATE TABLE IF NOT EXISTS fitcore_workout_prescription_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES fitcore_users(id) ON DELETE SET NULL,
  workout_id uuid REFERENCES fitcore_workouts(id) ON DELETE CASCADE,
  student_id uuid REFERENCES fitcore_students(id) ON DELETE SET NULL,
  evento text NOT NULL,
  status text NOT NULL DEFAULT 'ok',
  detalhe text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fitcore_workout_prescription_events_tenant_workout
  ON fitcore_workout_prescription_events (tenant_id, workout_id, criado_em DESC);

ALTER TABLE fitcore_workout_prescription_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON fitcore_workout_prescription_events;
CREATE POLICY tenant_isolation ON fitcore_workout_prescription_events
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

INSERT INTO fitcore_schema_migrations (version, descricao, status)
VALUES (
  '010-mvp-24-workout-prescription',
  'Prescrição real de treino vinculada a aluno, professor, tenant e auditoria',
  'aplicada'
)
ON CONFLICT (version) DO UPDATE
SET status = EXCLUDED.status,
    descricao = EXCLUDED.descricao,
    aplicada_em = now();
