-- FITCORE PRO — rollback #79 Execution Kernel V2
BEGIN;

DROP FUNCTION IF EXISTS fitcore_execution_observability(uuid);
DROP FUNCTION IF EXISTS fitcore_execution_transition(uuid,text,text,text,text,text,uuid,jsonb);
DROP FUNCTION IF EXISTS fitcore_execution_admit(uuid,uuid,text,text,text,text,text,text,integer,text,text,text);
DROP TABLE IF EXISTS fitcore_execution_events;
DROP TABLE IF EXISTS fitcore_execution_operations;
DROP TABLE IF EXISTS fitcore_execution_attempts;
DROP TABLE IF EXISTS fitcore_execution_runs;
DELETE FROM fitcore_schema_migrations WHERE version='023-execution-kernel-v2';

COMMIT;
