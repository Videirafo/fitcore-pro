-- FITCORE PRO — MVP-15
-- Sessões assinadas e RBAC vindo do banco.

CREATE TABLE IF NOT EXISTS fitcore_signed_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES fitcore_tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES fitcore_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  user_agent_hash text,
  ip_hash text,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fitcore_signed_sessions_tenant_user
  ON fitcore_signed_sessions (tenant_id, user_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_fitcore_signed_sessions_active
  ON fitcore_signed_sessions (tenant_id, expires_at DESC)
  WHERE revoked_at IS NULL;

ALTER TABLE fitcore_signed_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON fitcore_signed_sessions;
CREATE POLICY tenant_isolation ON fitcore_signed_sessions
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

WITH tenant AS (
  SELECT id FROM fitcore_tenants WHERE slug='demo' LIMIT 1
), scope AS (
  SELECT set_config('app.tenant_id', (SELECT id::text FROM tenant), true)
)
INSERT INTO fitcore_users (tenant_id, nome, papel, externo_id, ativo, atualizado_em)
SELECT tenant.id, seed.nome, seed.papel, seed.externo_id, true, now()
FROM tenant, scope, (VALUES
  ('Gestor Demo', 'gestor', 'mvp15-gestor'),
  ('Professor Demo', 'professor', 'mvp15-professor'),
  ('Aluno Demo', 'aluno', 'mvp15-aluno')
) AS seed(nome, papel, externo_id)
WHERE tenant.id IS NOT NULL
ON CONFLICT (tenant_id, externo_id) DO UPDATE SET
  nome = EXCLUDED.nome,
  papel = EXCLUDED.papel,
  ativo = true,
  atualizado_em = now();

INSERT INTO fitcore_schema_migrations (version, descricao, status)
VALUES (
  '003-mvp-15-signed-sessions',
  'Sessões assinadas com usuário vinculado ao tenant e papel vindo do banco',
  'aplicada'
)
ON CONFLICT (version) DO UPDATE
SET status = EXCLUDED.status,
    descricao = EXCLUDED.descricao,
    aplicada_em = now();
