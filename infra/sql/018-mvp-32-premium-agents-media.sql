-- FITCORE PRO — MVP-32
-- Premium workspace, agent assistant and exercise media audit foundation.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS fitcore_agent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES fitcore_users(id) ON DELETE SET NULL,
  actor_role text NOT NULL,
  module text NOT NULL,
  prompt text NOT NULL,
  response text NOT NULL,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'ok',
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fitcore_agent_events_tenant_created
  ON fitcore_agent_events (tenant_id, criado_em DESC);

ALTER TABLE fitcore_agent_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON fitcore_agent_events;
CREATE POLICY tenant_isolation ON fitcore_agent_events
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
