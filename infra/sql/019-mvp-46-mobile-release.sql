-- FITCORE PRO — MVP-46
-- Séries de treino idempotentes para sincronização mobile offline-first.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS fitcore_workout_execution_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  execution_id uuid NOT NULL REFERENCES fitcore_workout_executions(id) ON DELETE CASCADE,
  exercise_index integer NOT NULL CHECK (exercise_index BETWEEN 0 AND 500),
  set_index integer NOT NULL CHECK (set_index BETWEEN 0 AND 100),
  reps integer NOT NULL CHECK (reps BETWEEN 1 AND 1000),
  weight_kg numeric(8,2) NULL CHECK (weight_kg IS NULL OR weight_kg BETWEEN 0 AND 2000),
  rpe smallint NULL CHECK (rpe IS NULL OR rpe BETWEEN 1 AND 10),
  client_operation_id text NULL,
  recorded_by uuid NULL REFERENCES fitcore_users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, execution_id, exercise_index, set_index)
);
CREATE INDEX IF NOT EXISTS idx_fitcore_execution_sets_tenant_execution
  ON fitcore_workout_execution_sets (tenant_id, execution_id, exercise_index, set_index);

ALTER TABLE fitcore_workout_execution_sets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON fitcore_workout_execution_sets;
CREATE POLICY tenant_isolation ON fitcore_workout_execution_sets
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

INSERT INTO fitcore_schema_migrations (version, descricao, status)
VALUES (
  '019-mvp-46-mobile-release',
  'Séries idempotentes de execução para sincronização mobile offline-first',
  'aplicada'
)
ON CONFLICT (version) DO UPDATE SET
  status = EXCLUDED.status,
  descricao = EXCLUDED.descricao,
  aplicada_em = now();
