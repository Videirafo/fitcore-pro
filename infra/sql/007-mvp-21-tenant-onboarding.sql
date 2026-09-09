-- FITCORE PRO — MVP-21
-- Onboarding real do tenant: academia, estúdio, box ou personal com gestor proprietário.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE fitcore_tenants
  ADD COLUMN IF NOT EXISTS tipo_negocio text,
  ADD COLUMN IF NOT EXISTS internal_domain text,
  ADD COLUMN IF NOT EXISTS owner_user_id uuid,
  ADD COLUMN IF NOT EXISTS onboarding_status text NOT NULL DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS plano text NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'mvp21_onboarding';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fitcore_tenants_tipo_negocio_check') THEN
    ALTER TABLE fitcore_tenants
      ADD CONSTRAINT fitcore_tenants_tipo_negocio_check
      CHECK (tipo_negocio IS NULL OR tipo_negocio IN ('academia','estudio','box','personal'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fitcore_tenants_onboarding_status_check') THEN
    ALTER TABLE fitcore_tenants
      ADD CONSTRAINT fitcore_tenants_onboarding_status_check
      CHECK (onboarding_status IN ('ativo','pendente','suspenso'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_fitcore_tenants_internal_domain
  ON fitcore_tenants (lower(internal_domain))
  WHERE internal_domain IS NOT NULL;

CREATE TABLE IF NOT EXISTS fitcore_tenant_onboarding_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES fitcore_users(id) ON DELETE SET NULL,
  evento text NOT NULL,
  status text NOT NULL DEFAULT 'ok',
  detalhe text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fitcore_onboarding_events_tenant_created
  ON fitcore_tenant_onboarding_events (tenant_id, criado_em DESC);

ALTER TABLE fitcore_tenant_onboarding_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON fitcore_tenant_onboarding_events;
CREATE POLICY tenant_isolation ON fitcore_tenant_onboarding_events
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

UPDATE fitcore_tenants
SET tipo_negocio = COALESCE(tipo_negocio, 'academia'),
    internal_domain = COALESCE(internal_domain, slug || '.fitcore.local'),
    onboarding_status = COALESCE(onboarding_status, 'ativo'),
    plano = COALESCE(plano, 'trial'),
    origem = COALESCE(origem, 'legacy_demo'),
    atualizado_em = now()
WHERE slug = 'demo';
