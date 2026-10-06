-- FITCORE PRO — Trust Gate v1.1 Privacy & Recovery
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS fitcore_privacy_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  subject_user_id uuid REFERENCES fitcore_users(id) ON DELETE SET NULL,
  requested_by uuid REFERENCES fitcore_users(id) ON DELETE SET NULL,
  request_type text NOT NULL CHECK (request_type IN ('access','export','correction','deletion','restriction')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_review','approved','rejected','completed','cancelled')),
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolution_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS fitcore_privacy_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES fitcore_privacy_requests(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES fitcore_users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('created','reviewed','approved','rejected','exported','corrected','restricted','deleted','completed','cancelled')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fitcore_retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  dataset text NOT NULL,
  retain_days integer NOT NULL CHECK (retain_days BETWEEN 1 AND 3650),
  purge_mode text NOT NULL DEFAULT 'review' CHECK (purge_mode IN ('review','delete','anonymize')),
  enabled boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES fitcore_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, dataset)
);

CREATE INDEX IF NOT EXISTS idx_fitcore_privacy_requests_tenant_created
  ON fitcore_privacy_requests(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fitcore_privacy_events_request
  ON fitcore_privacy_request_events(tenant_id, request_id, created_at);
CREATE INDEX IF NOT EXISTS idx_fitcore_retention_tenant
  ON fitcore_retention_policies(tenant_id, enabled, dataset);

ALTER TABLE fitcore_privacy_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitcore_privacy_request_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitcore_retention_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON fitcore_privacy_requests;
CREATE POLICY tenant_isolation ON fitcore_privacy_requests
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation ON fitcore_privacy_request_events;
CREATE POLICY tenant_isolation ON fitcore_privacy_request_events
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation ON fitcore_retention_policies;
CREATE POLICY tenant_isolation ON fitcore_retention_policies
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

CREATE OR REPLACE FUNCTION fitcore_block_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'immutable_history';
END;
$$;

DROP TRIGGER IF EXISTS immutable_history ON fitcore_privacy_request_events;
CREATE TRIGGER immutable_history
BEFORE UPDATE OR DELETE ON fitcore_privacy_request_events
FOR EACH ROW EXECUTE FUNCTION fitcore_block_history_mutation();

DROP TRIGGER IF EXISTS immutable_history ON fitcore_audit_events;
CREATE TRIGGER immutable_history
BEFORE UPDATE OR DELETE ON fitcore_audit_events
FOR EACH ROW EXECUTE FUNCTION fitcore_block_history_mutation();

DROP TRIGGER IF EXISTS immutable_history ON fitcore_security_events;
CREATE TRIGGER immutable_history
BEFORE UPDATE OR DELETE ON fitcore_security_events
FOR EACH ROW EXECUTE FUNCTION fitcore_block_history_mutation();
