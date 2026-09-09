-- FITCORE PRO — MVP-20
-- Hardening de autenticação: rate limit, logs por tenant e apoio à revogação/limpeza de sessões.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS fitcore_auth_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  bucket_key text NOT NULL,
  acao text NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  window_start timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, bucket_key, acao)
);

CREATE TABLE IF NOT EXISTS fitcore_security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES fitcore_users(id) ON DELETE SET NULL,
  actor_role text NOT NULL DEFAULT 'sistema' CHECK (actor_role IN ('gestor', 'professor', 'aluno', 'sistema')),
  acao text NOT NULL,
  status text NOT NULL DEFAULT 'ok',
  detalhe text,
  ip_hash text,
  user_agent_hash text,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fitcore_auth_rate_limits_tenant_action ON fitcore_auth_rate_limits (tenant_id, acao, atualizado_em DESC);
CREATE INDEX IF NOT EXISTS idx_fitcore_security_events_tenant_created ON fitcore_security_events (tenant_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_fitcore_signed_sessions_expiry ON fitcore_signed_sessions (tenant_id, expires_at, revoked_at);
CREATE INDEX IF NOT EXISTS idx_fitcore_users_login_active ON fitcore_users (tenant_id, lower(login_identifier), ativo) WHERE login_identifier IS NOT NULL;

ALTER TABLE fitcore_auth_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitcore_security_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON fitcore_auth_rate_limits;
CREATE POLICY tenant_isolation ON fitcore_auth_rate_limits
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation ON fitcore_security_events;
CREATE POLICY tenant_isolation ON fitcore_security_events
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
