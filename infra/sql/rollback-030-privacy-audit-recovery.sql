-- Rollback for Trust Gate v1.1 additive privacy tables.
-- Existing fitcore_audit_events rows are never removed by rollback.
DROP TRIGGER IF EXISTS fitcore_audit_events_immutable ON fitcore_audit_events;
DROP FUNCTION IF EXISTS fitcore_audit_retention_purge(uuid,uuid);
DROP FUNCTION IF EXISTS fitcore_audit_immutable_guard();
DROP TRIGGER IF EXISTS fitcore_privacy_request_audit ON fitcore_privacy_requests;
DROP TRIGGER IF EXISTS fitcore_privacy_events_immutable ON fitcore_privacy_events;
DROP TRIGGER IF EXISTS fitcore_privacy_requests_touch ON fitcore_privacy_requests;
DROP TRIGGER IF EXISTS fitcore_retention_policies_touch ON fitcore_retention_policies;
DROP FUNCTION IF EXISTS fitcore_privacy_request_audit();
DROP FUNCTION IF EXISTS fitcore_privacy_event_immutable_guard();
DROP FUNCTION IF EXISTS fitcore_privacy_touch_updated_at();
DROP TABLE IF EXISTS fitcore_privacy_events;
DROP TABLE IF EXISTS fitcore_privacy_requests;
DROP TABLE IF EXISTS fitcore_retention_policies;
DELETE FROM fitcore_schema_migrations WHERE version='030-privacy-audit-recovery';
