-- FITCORE PRO — MVP-22
-- Gestão real de usuários por tenant.
-- Idempotente: não remove usuários, convites, sessões nem credenciais.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE fitcore_user_invites
  ADD COLUMN IF NOT EXISTS login_identifier_hint text,
  ADD COLUMN IF NOT EXISTS source_mvp text DEFAULT 'mvp18',
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_fitcore_user_invites_tenant_source
  ON fitcore_user_invites (tenant_id, source_mvp, criado_em DESC);

CREATE TABLE IF NOT EXISTS fitcore_tenant_user_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES fitcore_users(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES fitcore_users(id) ON DELETE SET NULL,
  invite_id uuid REFERENCES fitcore_user_invites(id) ON DELETE SET NULL,
  evento text NOT NULL,
  status text NOT NULL DEFAULT 'ok',
  detalhe text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fitcore_tenant_user_events_tenant_created
  ON fitcore_tenant_user_events (tenant_id, criado_em DESC);

ALTER TABLE fitcore_tenant_user_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON fitcore_tenant_user_events;
CREATE POLICY tenant_isolation ON fitcore_tenant_user_events
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
