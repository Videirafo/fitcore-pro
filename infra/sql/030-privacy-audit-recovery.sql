-- FITCORE PRO — VIDEIRA TRUST GATE v1.1
-- Privacy / DSAR / retention + immutable audit.
-- Additive and idempotent. Does not delete production data on migration.

CREATE TABLE IF NOT EXISTS fitcore_privacy_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  request_key text NOT NULL,
  subject_ref text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('access','correction','deletion','portability')),
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received','verified','processing','completed','rejected')),
  requested_by uuid REFERENCES fitcore_users(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES fitcore_users(id) ON DELETE SET NULL,
  reason text,
  due_at timestamptz,
  completed_at timestamptz,
  evidence_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, request_key),
  CHECK (
    subject_ref ~ '^sha256:[a-f0-9]{64}$'
    OR subject_ref ~ '^(student|user):[0-9a-fA-F-]{36}$'
  ),
  CHECK (
    status <> 'completed'
    OR (
      evidence_ref IS NOT NULL
      AND evidence_ref ~ '^[A-Za-z0-9:_./-]{8,240}$'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_fitcore_privacy_requests_tenant_status
  ON fitcore_privacy_requests(tenant_id,status,criado_em DESC);

CREATE TABLE IF NOT EXISTS fitcore_privacy_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES fitcore_privacy_requests(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES fitcore_users(id) ON DELETE SET NULL,
  actor_role text NOT NULL CHECK (actor_role IN ('gestor','sistema')),
  event_type text NOT NULL
    CHECK (event_type IN ('created','verified','processing_started','completed','rejected','note')),
  from_status text,
  to_status text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fitcore_privacy_events_request
  ON fitcore_privacy_events(tenant_id,request_id,criado_em,id);

CREATE TABLE IF NOT EXISTS fitcore_retention_policies (
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  dataset text NOT NULL,
  retention_days integer NOT NULL CHECK (retention_days BETWEEN 7 AND 3650),
  action text NOT NULL CHECK (action IN ('delete','anonymize','retain_evidence')),
  legal_hold boolean NOT NULL DEFAULT false,
  legal_basis text,
  enabled boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES fitcore_users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,dataset),
  CHECK (dataset ~ '^[a-z0-9][a-z0-9_.-]{1,63}$')
);

ALTER TABLE fitcore_privacy_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitcore_privacy_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitcore_retention_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON fitcore_privacy_requests;
CREATE POLICY tenant_isolation ON fitcore_privacy_requests
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation ON fitcore_privacy_events;
CREATE POLICY tenant_isolation ON fitcore_privacy_events
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation ON fitcore_retention_policies;
CREATE POLICY tenant_isolation ON fitcore_retention_policies
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

CREATE OR REPLACE FUNCTION fitcore_privacy_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.atualizado_em=now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fitcore_privacy_requests_touch ON fitcore_privacy_requests;
CREATE TRIGGER fitcore_privacy_requests_touch
BEFORE UPDATE ON fitcore_privacy_requests
FOR EACH ROW EXECUTE FUNCTION fitcore_privacy_touch_updated_at();

DROP TRIGGER IF EXISTS fitcore_retention_policies_touch ON fitcore_retention_policies;
CREATE TRIGGER fitcore_retention_policies_touch
BEFORE UPDATE ON fitcore_retention_policies
FOR EACH ROW EXECUTE FUNCTION fitcore_privacy_touch_updated_at();

CREATE OR REPLACE FUNCTION fitcore_privacy_event_immutable_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'fitcore_privacy_events_append_only';
END;
$$;

DROP TRIGGER IF EXISTS fitcore_privacy_events_immutable ON fitcore_privacy_events;
CREATE TRIGGER fitcore_privacy_events_immutable
BEFORE UPDATE ON fitcore_privacy_events
FOR EACH ROW EXECUTE FUNCTION fitcore_privacy_event_immutable_guard();

CREATE OR REPLACE FUNCTION fitcore_privacy_request_audit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  event_name text;
  actor uuid;
  actor_role_name text;
BEGIN
  actor := NULLIF(current_setting('app.actor_id',true),'')::uuid;
  actor_role_name := COALESCE(NULLIF(current_setting('app.actor_role',true),''),'sistema');

  IF TG_OP='INSERT' THEN
    INSERT INTO fitcore_privacy_events(
      tenant_id,request_id,actor_id,actor_role,event_type,from_status,to_status,metadata
    ) VALUES (
      NEW.tenant_id,NEW.id,COALESCE(actor,NEW.requested_by),
      CASE WHEN actor_role_name='gestor' THEN 'gestor' ELSE 'sistema' END,
      'created',NULL,NEW.status,
      jsonb_build_object('kind',NEW.kind)
    );
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    event_name := CASE NEW.status
      WHEN 'verified' THEN 'verified'
      WHEN 'processing' THEN 'processing_started'
      WHEN 'completed' THEN 'completed'
      WHEN 'rejected' THEN 'rejected'
      ELSE 'note'
    END;
    INSERT INTO fitcore_privacy_events(
      tenant_id,request_id,actor_id,actor_role,event_type,from_status,to_status,metadata
    ) VALUES (
      NEW.tenant_id,NEW.id,actor,
      CASE WHEN actor_role_name='gestor' THEN 'gestor' ELSE 'sistema' END,
      event_name,OLD.status,NEW.status,
      jsonb_build_object('has_evidence',NEW.evidence_ref IS NOT NULL)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fitcore_privacy_request_audit ON fitcore_privacy_requests;
CREATE TRIGGER fitcore_privacy_request_audit
AFTER INSERT OR UPDATE OF status ON fitcore_privacy_requests
FOR EACH ROW EXECUTE FUNCTION fitcore_privacy_request_audit();

-- Existing security audit becomes immutable for ordinary application paths.
-- Governed retention deletion requires a transaction-local capability set only
-- by the SECURITY DEFINER purge function below.
CREATE OR REPLACE FUNCTION fitcore_audit_immutable_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    RAISE EXCEPTION 'fitcore_audit_events_append_only';
  END IF;
  IF TG_OP='DELETE'
     AND current_setting('app.audit_retention_purge',true) IS DISTINCT FROM 'on'
  THEN
    RAISE EXCEPTION 'fitcore_audit_delete_requires_retention_purge';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS fitcore_audit_events_immutable ON fitcore_audit_events;
CREATE TRIGGER fitcore_audit_events_immutable
BEFORE UPDATE OR DELETE ON fitcore_audit_events
FOR EACH ROW EXECUTE FUNCTION fitcore_audit_immutable_guard();

CREATE OR REPLACE FUNCTION fitcore_audit_retention_purge(
  p_tenant_id uuid,
  p_actor_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  actor_ok boolean := false;
  policy_row fitcore_retention_policies%ROWTYPE;
  cutoff timestamptz;
  removed integer := 0;
BEGIN
  IF NULLIF(current_setting('app.tenant_id',true),'') IS DISTINCT FROM p_tenant_id::text THEN
    RAISE EXCEPTION 'privacy_tenant_context_mismatch';
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM fitcore_users u
    WHERE u.id=p_actor_id
      AND u.tenant_id=p_tenant_id
      AND u.ativo=true
      AND u.papel='gestor'
  ) INTO actor_ok;
  IF NOT actor_ok THEN
    RAISE EXCEPTION 'privacy_gestor_required';
  END IF;

  SELECT * INTO policy_row
  FROM fitcore_retention_policies
  WHERE tenant_id=p_tenant_id
    AND dataset='security_audit'
    AND enabled=true
  FOR UPDATE;

  IF policy_row.tenant_id IS NULL THEN
    RAISE EXCEPTION 'security_audit_retention_policy_required';
  END IF;
  IF policy_row.legal_hold THEN
    RAISE EXCEPTION 'security_audit_legal_hold';
  END IF;
  IF policy_row.action NOT IN ('delete','anonymize') THEN
    RAISE EXCEPTION 'security_audit_retention_action_invalid';
  END IF;

  cutoff := now() - make_interval(days=>policy_row.retention_days);
  PERFORM set_config('app.audit_retention_purge','on',true);

  DELETE FROM fitcore_audit_events
  WHERE tenant_id=p_tenant_id
    AND criado_em<cutoff;
  GET DIAGNOSTICS removed = ROW_COUNT;

  INSERT INTO fitcore_audit_events(
    tenant_id,actor_id,actor_role,recurso_tipo,acao,status,detalhe,politica_lgpd
  ) VALUES (
    p_tenant_id,p_actor_id,'gestor','security_audit','retention_purge','ok',
    'eventos removidos='||removed::text||'; política='||policy_row.retention_days::text||' dias',
    'evento_minimo_sem_payload_pessoal'
  );

  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION fitcore_audit_retention_purge(uuid,uuid) FROM PUBLIC;

DO $grant$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fitcore_app') THEN
    GRANT EXECUTE ON FUNCTION fitcore_audit_retention_purge(uuid,uuid) TO fitcore_app;
  END IF;
END
$grant$;

INSERT INTO fitcore_schema_migrations(version,descricao,status)
VALUES('030-privacy-audit-recovery','Trust Gate v1.1 privacy ledger, retention and immutable audit','aplicada')
ON CONFLICT (version) DO UPDATE SET
  descricao=EXCLUDED.descricao,status=EXCLUDED.status,aplicada_em=now();
