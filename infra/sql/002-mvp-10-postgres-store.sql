-- FITCORE PRO — MVP-10
-- PostgresStore controlado
-- Objetivo: permitir que o adapter persista os registros dos MVPs em PostgreSQL
-- sem remover o fallback JSON local.

CREATE TABLE IF NOT EXISTS fitcore_schema_migrations (
  version text PRIMARY KEY,
  descricao text NOT NULL,
  status text NOT NULL DEFAULT 'aplicada',
  aplicada_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE fitcore_students
  ADD COLUMN IF NOT EXISTS source_mvp_id text,
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE fitcore_workouts
  ADD COLUMN IF NOT EXISTS source_mvp_id text,
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE fitcore_professor_reviews
  ADD COLUMN IF NOT EXISTS source_mvp_id text,
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE fitcore_workout_executions
  ADD COLUMN IF NOT EXISTS source_mvp_id text,
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE fitcore_audit_events
  ADD COLUMN IF NOT EXISTS source_mvp_id text,
  ADD COLUMN IF NOT EXISTS external_resource_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_fitcore_students_tenant_source_mvp
  ON fitcore_students (tenant_id, source_mvp_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fitcore_workouts_tenant_source_mvp
  ON fitcore_workouts (tenant_id, source_mvp_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fitcore_reviews_tenant_source_mvp
  ON fitcore_professor_reviews (tenant_id, source_mvp_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fitcore_executions_tenant_source_mvp
  ON fitcore_workout_executions (tenant_id, source_mvp_id);

CREATE INDEX IF NOT EXISTS idx_fitcore_audit_tenant_source_mvp
  ON fitcore_audit_events (tenant_id, source_mvp_id, criado_em DESC);

INSERT INTO fitcore_tenants (slug, nome, status)
VALUES ('demo', 'FitCore Demo', 'teste')
ON CONFLICT (slug) DO UPDATE SET atualizado_em = now();

INSERT INTO fitcore_schema_migrations (version, descricao, status)
VALUES (
  '002-mvp-10-postgres-store',
  'PostgresStore controlado com source_mvp_id e payload JSONB para fallback reversível',
  'aplicada'
)
ON CONFLICT (version) DO UPDATE
SET status = EXCLUDED.status,
    descricao = EXCLUDED.descricao,
    aplicada_em = now();
