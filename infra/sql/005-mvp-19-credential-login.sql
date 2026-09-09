-- FITCORE PRO — MVP-19
-- Credencial mínima, recuperação e revogação controlada.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE fitcore_users
  ADD COLUMN IF NOT EXISTS login_identifier text,
  ADD COLUMN IF NOT EXISTS credential_kind text,
  ADD COLUMN IF NOT EXISTS credential_hash text,
  ADD COLUMN IF NOT EXISTS credential_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS credential_revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fitcore_users_credential_kind_check'
  ) THEN
    ALTER TABLE fitcore_users
      ADD CONSTRAINT fitcore_users_credential_kind_check
      CHECK (credential_kind IS NULL OR credential_kind IN ('password', 'access_code'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_fitcore_users_tenant_login_identifier
  ON fitcore_users (tenant_id, lower(login_identifier))
  WHERE login_identifier IS NOT NULL;

CREATE TABLE IF NOT EXISTS fitcore_user_recovery_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES fitcore_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'usado', 'revogado', 'expirado')),
  expires_at timestamptz NOT NULL,
  usado_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fitcore_recovery_tenant_user
  ON fitcore_user_recovery_tokens (tenant_id, user_id, status);
CREATE INDEX IF NOT EXISTS idx_fitcore_recovery_token_status
  ON fitcore_user_recovery_tokens (token_hash, status, expires_at);

ALTER TABLE fitcore_user_recovery_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON fitcore_user_recovery_tokens;
CREATE POLICY tenant_isolation ON fitcore_user_recovery_tokens
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
