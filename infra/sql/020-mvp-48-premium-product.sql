-- FITCORE PRO — #48 Premium product completion
-- Email-first owner identity + complete minimal business profile.

ALTER TABLE fitcore_users
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS telefone text,
  ADD COLUMN IF NOT EXISTS aceitou_termos_em timestamptz,
  ADD COLUMN IF NOT EXISTS aceitou_privacidade_em timestamptz,
  ADD COLUMN IF NOT EXISTS perfil_completo_em timestamptz;

ALTER TABLE fitcore_tenants
  ADD COLUMN IF NOT EXISTS email_contato text,
  ADD COLUMN IF NOT EXISTS telefone_contato text,
  ADD COLUMN IF NOT EXISTS cidade text,
  ADD COLUMN IF NOT EXISTS estado text,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Sao_Paulo';

UPDATE fitcore_users
SET email = lower(login_identifier)
WHERE email IS NULL
  AND login_identifier ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$';

CREATE UNIQUE INDEX IF NOT EXISTS idx_fitcore_users_tenant_email
  ON fitcore_users (tenant_id, lower(email))
  WHERE email IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fitcore_users_email_format_check') THEN
    ALTER TABLE fitcore_users
      ADD CONSTRAINT fitcore_users_email_format_check
      CHECK (email IS NULL OR email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fitcore_tenants_estado_check') THEN
    ALTER TABLE fitcore_tenants
      ADD CONSTRAINT fitcore_tenants_estado_check
      CHECK (estado IS NULL OR estado ~ '^[A-Z]{2}$');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_fitcore_users_email_active
  ON fitcore_users (lower(email), ativo)
  WHERE email IS NOT NULL;
