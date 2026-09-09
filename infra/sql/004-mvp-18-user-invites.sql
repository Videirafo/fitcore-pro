-- FITCORE PRO — MVP-18
-- Perfis reais e convite de usuário.
-- Idempotente. Não remove sessões nem usuários existentes.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS fitcore_user_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  criado_por uuid REFERENCES fitcore_users(id) ON DELETE SET NULL,
  nome_convidado text NOT NULL,
  papel text NOT NULL CHECK (papel IN ('professor', 'aluno')),
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aceito', 'revogado', 'expirado')),
  expires_at timestamptz NOT NULL,
  aceito_por uuid REFERENCES fitcore_users(id) ON DELETE SET NULL,
  aceito_em timestamptz,
  revogado_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fitcore_user_invites_tenant_status
  ON fitcore_user_invites (tenant_id, status, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_fitcore_user_invites_token_hash
  ON fitcore_user_invites (token_hash);

ALTER TABLE fitcore_user_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON fitcore_user_invites;
CREATE POLICY tenant_isolation ON fitcore_user_invites
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
