#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NAME="fitcore-privacy-gate-$RANDOM-$$"
PASS="fitcore-privacy-gate"
DB="fitcore_privacy_gate"
cleanup(){ docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD="$PASS" -e POSTGRES_DB="$DB" postgres:17.6-alpine >/dev/null
for _ in $(seq 1 80); do
  docker exec "$NAME" pg_isready -U postgres -d "$DB" >/dev/null 2>&1 && break
  sleep .25
done
for f in "$ROOT"/infra/sql/[0-9][0-9][0-9]-*.sql; do
  docker exec -i "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 < "$f" >/dev/null
done
docker exec -i "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE t1 uuid; t2 uuid; u1 uuid; r uuid;
BEGIN
  INSERT INTO fitcore_tenants(slug,nome,status) VALUES ('privacy-a','Privacy A','teste') RETURNING id INTO t1;
  INSERT INTO fitcore_tenants(slug,nome,status) VALUES ('privacy-b','Privacy B','teste') RETURNING id INTO t2;
  INSERT INTO fitcore_users(tenant_id,nome,papel,externo_id) VALUES (t1,'Gestor A','gestor','privacy-a') RETURNING id INTO u1;
  PERFORM set_config('app.tenant_id', t1::text, false);
  INSERT INTO fitcore_privacy_requests(tenant_id,subject_user_id,requested_by,request_type,scope)
    VALUES(t1,u1,u1,'export','{"source":"gate"}') RETURNING id INTO r;
  INSERT INTO fitcore_privacy_request_events(tenant_id,request_id,actor_id,event_type)
    VALUES(t1,r,u1,'created');
  INSERT INTO fitcore_retention_policies(tenant_id,dataset,retain_days,purge_mode,enabled,updated_by)
    VALUES(t1,'security_events',400,'review',true,u1);

  BEGIN
    UPDATE fitcore_privacy_request_events SET details='{"tamper":true}' WHERE request_id=r;
    RAISE EXCEPTION 'immutable event update unexpectedly allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'immutable_history' THEN RAISE; END IF;
  END;

  BEGIN
    DELETE FROM fitcore_audit_events WHERE tenant_id=t1;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'immutable_history' THEN RAISE; END IF;
  END;

  PERFORM set_config('app.tenant_id', t2::text, false);
  IF EXISTS (SELECT 1 FROM fitcore_privacy_requests WHERE tenant_id=t1) THEN
    RAISE EXCEPTION 'cross tenant privacy leak';
  END IF;
END $$;
SQL
echo "FITCORE_PRIVACY_RECOVERY_DB_GATE=PASS PostgreSQL=17.6"
