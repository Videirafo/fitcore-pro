#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NAME="fitcore-privacy-gate-$RANDOM-$$"
PASS="fitcore-privacy-gate"
DB="fitcore_privacy_gate"
cleanup(){ docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD="$PASS" -e POSTGRES_DB="$DB" postgres:17.6-alpine >/dev/null
ready=0
for _ in $(seq 1 120); do
  if docker exec "$NAME" pg_isready -U postgres -d "$DB" >/dev/null 2>&1; then
    ready=$((ready + 1))
    [[ "$ready" -ge 2 ]] && break
  else
    ready=0
  fi
  sleep .25
done
[[ "$ready" -ge 2 ]] || { echo "privacy gate postgres not stable" >&2; docker logs "$NAME" >&2 || true; exit 3; }

for f in "$ROOT"/infra/sql/[0-9][0-9][0-9]-*.sql; do
  docker exec -i "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 < "$f" >/dev/null
done

docker exec -i "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO fitcore_tenants(id,slug,nome,status) VALUES
 ('11111111-1111-4111-8111-111111111111','privacy-a','Privacy A','teste'),
 ('22222222-2222-4222-8222-222222222222','privacy-b','Privacy B','teste')
ON CONFLICT (id) DO NOTHING;

INSERT INTO fitcore_users(id,tenant_id,nome,papel,externo_id) VALUES
 ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','Gestor A','gestor','privacy-a')
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fitcore_app_test') THEN
    CREATE ROLE fitcore_app_test NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO fitcore_app_test;
GRANT SELECT,INSERT,UPDATE,DELETE ON
  fitcore_privacy_requests,
  fitcore_privacy_request_events,
  fitcore_retention_policies,
  fitcore_audit_events,
  fitcore_security_events
TO fitcore_app_test;

SET ROLE fitcore_app_test;
SELECT set_config('app.tenant_id','11111111-1111-4111-8111-111111111111',false);

INSERT INTO fitcore_privacy_requests(
  id,tenant_id,subject_user_id,requested_by,request_type,scope
) VALUES (
  '44444444-4444-4444-8444-444444444444',
  '11111111-1111-4111-8111-111111111111',
  '33333333-3333-4333-8333-333333333333',
  '33333333-3333-4333-8333-333333333333',
  'export','{"source":"gate"}'
);

INSERT INTO fitcore_privacy_request_events(
  id,tenant_id,request_id,actor_id,event_type
) VALUES (
  '55555555-5555-4555-8555-555555555555',
  '11111111-1111-4111-8111-111111111111',
  '44444444-4444-4444-8444-444444444444',
  '33333333-3333-4333-8333-333333333333',
  'created'
);

INSERT INTO fitcore_retention_policies(
  tenant_id,dataset,retain_days,purge_mode,enabled,updated_by
) VALUES (
  '11111111-1111-4111-8111-111111111111',
  'security_events',400,'review',true,
  '33333333-3333-4333-8333-333333333333'
);

INSERT INTO fitcore_audit_events(
  id,tenant_id,actor_id,actor_role,recurso_tipo,acao,status
) VALUES (
  '66666666-6666-4666-8666-666666666666',
  '11111111-1111-4111-8111-111111111111',
  '33333333-3333-4333-8333-333333333333',
  'gestor','privacy_request','created','ok'
);

INSERT INTO fitcore_security_events(
  id,tenant_id,actor_id,actor_role,acao,status
) VALUES (
  '77777777-7777-4777-8777-777777777777',
  '11111111-1111-4111-8111-111111111111',
  '33333333-3333-4333-8333-333333333333',
  'gestor','privacy_gate','ok'
);

DO $$
BEGIN
  BEGIN
    UPDATE fitcore_privacy_request_events
      SET details='{"tamper":true}'
      WHERE id='55555555-5555-4555-8555-555555555555';
    RAISE EXCEPTION 'immutable privacy history unexpectedly allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'immutable_history' THEN RAISE; END IF;
  END;

  BEGIN
    DELETE FROM fitcore_audit_events
      WHERE id='66666666-6666-4666-8666-666666666666';
    RAISE EXCEPTION 'immutable audit history unexpectedly allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'immutable_history' THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE fitcore_security_events SET status='tampered'
      WHERE id='77777777-7777-4777-8777-777777777777';
    RAISE EXCEPTION 'immutable security history unexpectedly allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'immutable_history' THEN RAISE; END IF;
  END;
END $$;

SELECT set_config('app.tenant_id','22222222-2222-4222-8222-222222222222',false);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM fitcore_privacy_requests
    WHERE id='44444444-4444-4444-8444-444444444444'
  ) THEN
    RAISE EXCEPTION 'cross tenant privacy leak';
  END IF;
END $$;
RESET ROLE;
SQL

echo "FITCORE_PRIVACY_RECOVERY_DB_GATE=PASS PostgreSQL=17.6"
