CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS fitcore_student_evolution_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  student_id uuid REFERENCES fitcore_students(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES fitcore_users(id) ON DELETE SET NULL,
  evento text NOT NULL,
  status text NOT NULL DEFAULT 'ok',
  detalhe text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fitcore_student_evolution_events_tenant_student
  ON fitcore_student_evolution_events (tenant_id, student_id, criado_em DESC);

ALTER TABLE fitcore_student_evolution_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON fitcore_student_evolution_events;
CREATE POLICY tenant_isolation ON fitcore_student_evolution_events
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

INSERT INTO fitcore_schema_migrations (version, descricao, status)
VALUES ('012-mvp-26-student-evolution', 'MVP-26 histórico e evolução do aluno', 'aplicada')
ON CONFLICT (version) DO NOTHING;
