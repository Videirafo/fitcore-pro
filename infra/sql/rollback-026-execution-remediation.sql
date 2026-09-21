BEGIN;

DROP TRIGGER IF EXISTS fitcore_execution_remediation_sync ON fitcore_execution_runs;
DROP FUNCTION IF EXISTS fitcore_execution_remediation_sync_trigger();
DROP TRIGGER IF EXISTS fitcore_execution_remediation_event_audit ON fitcore_execution_remediations;
DROP FUNCTION IF EXISTS fitcore_execution_remediation_event_trigger();

DROP FUNCTION IF EXISTS fitcore_execution_remediation_dashboard(uuid,integer);
DROP FUNCTION IF EXISTS fitcore_execution_remediation_action(uuid,uuid,text,text,text);
DROP FUNCTION IF EXISTS fitcore_execution_prepare_remediation_retry(uuid,uuid,text,text);
DROP FUNCTION IF EXISTS fitcore_execution_remediation_preview(uuid,uuid,text,text);
DROP FUNCTION IF EXISTS fitcore_execution_remediation_policy(text,text,integer);

DROP TABLE IF EXISTS fitcore_execution_remediation_events;
DROP TABLE IF EXISTS fitcore_execution_remediations;

DELETE FROM fitcore_schema_migrations WHERE version='026-execution-remediation';

COMMIT;
