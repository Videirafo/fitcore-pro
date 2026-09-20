BEGIN;
DROP FUNCTION IF EXISTS fitcore_execution_transition_decision(uuid,text,text,text,text);
DROP FUNCTION IF EXISTS fitcore_execution_validate_decision(uuid,uuid,text,text,uuid);
DROP FUNCTION IF EXISTS fitcore_execution_record_decision(uuid,uuid,text,integer,text,text,text,uuid);
DROP FUNCTION IF EXISTS fitcore_execution_analytics(uuid,integer);
DROP TABLE IF EXISTS fitcore_execution_decisions;
DELETE FROM fitcore_schema_migrations WHERE version='024-execution-analytics-nba';
COMMIT;
