-- FITCORE PRO — MVP-31
-- Setup guiado pós-criação do negócio com progresso salvo por tenant.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS fitcore_tenant_setup_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES fitcore_users(id) ON DELETE SET NULL,
  current_step text NOT NULL DEFAULT 'professor',
  completed_steps text[] NOT NULL DEFAULT ARRAY[]::text[],
  progress_percent integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'em_andamento',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_fitcore_setup_progress_tenant
  ON fitcore_tenant_setup_progress (tenant_id, atualizado_em DESC);

CREATE TABLE IF NOT EXISTS fitcore_tenant_setup_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES fitcore_users(id) ON DELETE SET NULL,
  step text NOT NULL,
  status text NOT NULL DEFAULT 'ok',
  detalhe text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fitcore_setup_events_tenant_created
  ON fitcore_tenant_setup_events (tenant_id, criado_em DESC);

ALTER TABLE fitcore_tenant_setup_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitcore_tenant_setup_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON fitcore_tenant_setup_progress;
CREATE POLICY tenant_isolation ON fitcore_tenant_setup_progress
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
DROP POLICY IF EXISTS tenant_isolation ON fitcore_tenant_setup_events;
CREATE POLICY tenant_isolation ON fitcore_tenant_setup_events
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
