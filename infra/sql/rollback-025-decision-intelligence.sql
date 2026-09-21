BEGIN;
DROP FUNCTION IF EXISTS fitcore_decision_intelligence(uuid,integer);
DROP FUNCTION IF EXISTS fitcore_decision_record_outcome(uuid,uuid,text,text,text,numeric,integer);
DROP FUNCTION IF EXISTS fitcore_decision_transition(uuid,uuid,text,text,text,text,text);
DROP FUNCTION IF EXISTS fitcore_decision_validate_accepted(uuid,uuid,text,text,uuid);
DROP FUNCTION IF EXISTS fitcore_decision_track_proposal(uuid,uuid,text);
DROP TABLE IF EXISTS fitcore_execution_decision_events;

ALTER TABLE fitcore_execution_decisions DROP CONSTRAINT IF EXISTS fitcore_execution_decisions_state_check;
ALTER TABLE fitcore_execution_decisions DROP CONSTRAINT IF EXISTS fitcore_execution_decisions_outcome_code_check;
ALTER TABLE fitcore_execution_decisions DROP CONSTRAINT IF EXISTS fitcore_execution_decisions_outcome_metric_name_check;
ALTER TABLE fitcore_execution_decisions DROP CONSTRAINT IF EXISTS fitcore_execution_decisions_outcome_window_check;
ALTER TABLE fitcore_execution_decisions DROP CONSTRAINT IF EXISTS fitcore_execution_decisions_evidence_version_check;

UPDATE fitcore_execution_decisions SET state=CASE
  WHEN state IN ('accepted','executing') THEN 'proposed'
  WHEN state IN ('settled','outcome_recorded') THEN 'executed'
  WHEN state='rejected' THEN 'dismissed'
  ELSE state END;

ALTER TABLE fitcore_execution_decisions
  DROP COLUMN IF EXISTS accepted_at,
  DROP COLUMN IF EXISTS rejected_at,
  DROP COLUMN IF EXISTS execution_started_at,
  DROP COLUMN IF EXISTS settled_at,
  DROP COLUMN IF EXISTS outcome_recorded_at,
  DROP COLUMN IF EXISTS outcome_code,
  DROP COLUMN IF EXISTS outcome_metric_name,
  DROP COLUMN IF EXISTS outcome_metric_value,
  DROP COLUMN IF EXISTS outcome_window_hours,
  DROP COLUMN IF EXISTS evidence_version;

ALTER TABLE fitcore_execution_decisions
  ADD CONSTRAINT fitcore_execution_decisions_state_check
  CHECK (state IN ('proposed','executed','failed','dismissed','expired'));

DELETE FROM fitcore_schema_migrations WHERE version='025-decision-intelligence';
COMMIT;
