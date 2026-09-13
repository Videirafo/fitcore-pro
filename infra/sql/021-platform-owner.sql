-- FITCORE PRO — #62 Platform owner global.
-- Identidade da plataforma separada de fitcore_users.papel e dos tenants operacionais.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS fitcore_platform_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_user_id uuid NOT NULL UNIQUE REFERENCES fitcore_users(id) ON DELETE RESTRICT,
  role text NOT NULL DEFAULT 'platform_owner' CHECK (role = 'platform_owner'),
  active boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fitcore_platform_admin_bridges (
  platform_admin_id uuid NOT NULL REFERENCES fitcore_platform_admins(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL UNIQUE REFERENCES fitcore_users(id) ON DELETE CASCADE,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (platform_admin_id, tenant_id)
);

CREATE TABLE IF NOT EXISTS fitcore_platform_admin_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_admin_id uuid NOT NULL REFERENCES fitcore_platform_admins(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES fitcore_users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_tenant_id uuid REFERENCES fitcore_tenants(id) ON DELETE SET NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fitcore_platform_admins_active
  ON fitcore_platform_admins (active, principal_user_id);
CREATE INDEX IF NOT EXISTS idx_fitcore_platform_admin_audit_created
  ON fitcore_platform_admin_audit_events (platform_admin_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_fitcore_platform_admin_audit_tenant
  ON fitcore_platform_admin_audit_events (target_tenant_id, criado_em DESC)
  WHERE target_tenant_id IS NOT NULL;

INSERT INTO fitcore_tenants (slug, nome, status)
VALUES ('platform-control', 'FitCore Platform Control', 'ativo')
ON CONFLICT (slug) DO UPDATE SET
  nome = EXCLUDED.nome,
  status = 'ativo',
  atualizado_em = now();

INSERT INTO fitcore_schema_migrations (version, descricao, status)
VALUES (
  '021-platform-owner',
  'Platform owner global separado dos papeis tenant-scoped, com bridges e auditoria',
  'aplicada'
)
ON CONFLICT (version) DO UPDATE SET
  status = EXCLUDED.status,
  descricao = EXCLUDED.descricao,
  aplicada_em = now();
