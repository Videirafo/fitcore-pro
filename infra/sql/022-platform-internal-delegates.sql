-- FITCORE PRO — #72 Internal Product Access delegates.
-- Mantém um único platform_owner raiz e delegates somente por convite.

ALTER TABLE fitcore_platform_admins
  DROP CONSTRAINT IF EXISTS fitcore_platform_admins_role_check;
ALTER TABLE fitcore_platform_admins
  ADD CONSTRAINT fitcore_platform_admins_role_check
  CHECK (role IN ('platform_owner','platform_delegate'));
ALTER TABLE fitcore_platform_admins
  ADD COLUMN IF NOT EXISTS invited_by uuid NULL REFERENCES fitcore_platform_admins(id) ON DELETE SET NULL;
ALTER TABLE fitcore_platform_admins
  ADD COLUMN IF NOT EXISTS invited_at timestamptz NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_fitcore_single_platform_owner
  ON fitcore_platform_admins ((role))
  WHERE role='platform_owner' AND active=true;

CREATE TABLE IF NOT EXISTS fitcore_platform_admin_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','revoked','expired')),
  invited_by uuid NOT NULL REFERENCES fitcore_platform_admins(id) ON DELETE RESTRICT,
  accepted_by uuid NULL REFERENCES fitcore_platform_admins(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '72 hours'),
  accepted_at timestamptz NULL,
  revoked_at timestamptz NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fitcore_platform_invite_pending_email
  ON fitcore_platform_admin_invites (lower(email))
  WHERE status='pending';
CREATE INDEX IF NOT EXISTS idx_fitcore_platform_invites_expiry
  ON fitcore_platform_admin_invites (status, expires_at);

INSERT INTO fitcore_schema_migrations (version, descricao, status)
VALUES (
  '022-platform-internal-delegates',
  'Internal Product Access: owner raiz unico, delegates por convite e auditoria',
  'aplicada'
)
ON CONFLICT (version) DO UPDATE SET
  status=EXCLUDED.status,
  descricao=EXCLUDED.descricao,
  aplicada_em=now();