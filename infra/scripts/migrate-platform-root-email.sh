#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

TARGET_EMAIL="${FITCORE_PLATFORM_ROOT_EMAIL:-}"
SECRET_FILE="${FITCORE_POSTGRES_SECRET_FILE:-/opt/fitcore-pro/storage/secrets/fitcore-postgres.env}"

if [[ ! "$TARGET_EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]; then
  echo "ERRO: FITCORE_PLATFORM_ROOT_EMAIL ausente ou inválido." >&2
  exit 2
fi
if [[ ! -f "$SECRET_FILE" ]]; then
  echo "ERRO: secrets do PostgreSQL ausentes." >&2
  exit 1
fi

set -a
. "$SECRET_FILE"
set +a
DB_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:55435/${POSTGRES_DB}?sslmode=disable"

psql "$DB_URL" -X -v ON_ERROR_STOP=1 -v target_email="$TARGET_EMAIL" <<'SQL'
BEGIN;
SELECT set_config('fitcore.target_root_email', :'target_email', true);

DO $$
DECLARE
  v_owner_count integer;
  v_owner_user uuid;
  v_hash_before text;
  v_conflicts integer;
  v_archived integer := 0;
BEGIN
  SELECT count(*), max(pa.principal_user_id::text)::uuid
    INTO v_owner_count, v_owner_user
  FROM fitcore_platform_admins pa
  WHERE pa.active = true AND pa.role = 'platform_owner';

  IF v_owner_count <> 1 THEN
    RAISE EXCEPTION 'expected_exactly_one_active_platform_owner: %', v_owner_count;
  END IF;

  SELECT credential_hash INTO v_hash_before
  FROM fitcore_users
  WHERE id = v_owner_user
  FOR UPDATE;

  IF v_hash_before IS NULL THEN
    RAISE EXCEPTION 'platform_owner_missing_credential_hash';
  END IF;

  SELECT count(*) INTO v_conflicts
  FROM fitcore_users u
  WHERE u.id <> v_owner_user
    AND lower(coalesce(u.email, u.login_identifier, '')) = lower(current_setting('fitcore.target_root_email'));

  IF EXISTS (
    SELECT 1
    FROM fitcore_users u
    JOIN fitcore_platform_admins pa ON pa.principal_user_id = u.id
    WHERE u.id <> v_owner_user
      AND pa.active = true
      AND lower(coalesce(u.email, u.login_identifier, '')) = lower(current_setting('fitcore.target_root_email'))
  ) THEN
    RAISE EXCEPTION 'target_email_belongs_to_platform_admin';
  END IF;

  UPDATE fitcore_users u
  SET email = NULL,
      login_identifier = 'archived-root-conflict-' || left(u.id::text, 12),
      ativo = false,
      credential_revoked_at = coalesce(u.credential_revoked_at, now()),
      atualizado_em = now()
  WHERE u.id <> v_owner_user
    AND lower(coalesce(u.email, u.login_identifier, '')) = lower(current_setting('fitcore.target_root_email'));
  GET DIAGNOSTICS v_archived = ROW_COUNT;

  UPDATE fitcore_users
  SET email = lower(current_setting('fitcore.target_root_email')),
      login_identifier = lower(current_setting('fitcore.target_root_email')),
      atualizado_em = now()
  WHERE id = v_owner_user;
  IF (SELECT credential_hash FROM fitcore_users WHERE id = v_owner_user) IS DISTINCT FROM v_hash_before THEN
    RAISE EXCEPTION 'credential_hash_changed';
  END IF;

  INSERT INTO fitcore_platform_admin_audit_events (
    platform_admin_id, actor_user_id, action, detail
  )
  SELECT pa.id, v_owner_user, 'root_email_migrated',
         jsonb_build_object('source','operator_script','archived_conflicts',v_archived)
  FROM fitcore_platform_admins pa
  WHERE pa.principal_user_id = v_owner_user
    AND pa.active = true
    AND pa.role = 'platform_owner';
END;
$$;

COMMIT;
SQL

echo "OK: e-mail raiz do platform_owner atualizado preservando credential_hash."
