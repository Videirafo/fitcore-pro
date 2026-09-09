-- FITCORE PRO — MVP-23
-- Cadastro operacional de aluno real por tenant.
-- Idempotente. Não remove dados existentes.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE fitcore_students
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES fitcore_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS professor_id uuid REFERENCES fitcore_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS codigo_publico text,
  ADD COLUMN IF NOT EXISTS objetivo text,
  ADD COLUMN IF NOT EXISTS modalidade_preferida text,
  ADD COLUMN IF NOT EXISTS frequencia_semana integer CHECK (frequencia_semana IS NULL OR frequencia_semana BETWEEN 1 AND 7),
  ADD COLUMN IF NOT EXISTS etiquetas jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'mvp23_operacional',
  ADD COLUMN IF NOT EXISTS consentimento_lgpd boolean NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_fitcore_students_tenant_codigo_publico
  ON fitcore_students (tenant_id, lower(codigo_publico))
  WHERE codigo_publico IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fitcore_students_tenant_professor
  ON fitcore_students (tenant_id, professor_id, status);

CREATE TABLE IF NOT EXISTS fitcore_student_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES fitcore_users(id) ON DELETE SET NULL,
  student_id uuid REFERENCES fitcore_students(id) ON DELETE CASCADE,
  evento text NOT NULL,
  status text NOT NULL DEFAULT 'ok',
  detalhe text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fitcore_student_events_tenant_student
  ON fitcore_student_events (tenant_id, student_id, criado_em DESC);

ALTER TABLE fitcore_student_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON fitcore_student_events;
CREATE POLICY tenant_isolation ON fitcore_student_events
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

INSERT INTO fitcore_schema_migrations (version, descricao, status)
VALUES (
  '009-mvp-23-student-management',
  'Cadastro operacional de aluno real por tenant com vínculos, status, auditoria e LGPD mínima',
  'aplicada'
)
ON CONFLICT (version) DO UPDATE
SET status = EXCLUDED.status,
    descricao = EXCLUDED.descricao,
    aplicada_em = now();
