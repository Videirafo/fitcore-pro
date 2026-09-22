-- Rollback 029 intentionally restores 028 behavior only in disposable/test environments.
BEGIN;
DELETE FROM fitcore_schema_migrations WHERE version='029-assessments-hardening';
COMMIT;
