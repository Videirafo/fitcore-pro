BEGIN;

DROP FUNCTION IF EXISTS fitcore_assessment_history(uuid,uuid,text,uuid,integer);
DROP FUNCTION IF EXISTS fitcore_assessment_summary(uuid,uuid,text,uuid);
DROP FUNCTION IF EXISTS fitcore_assessment_record(uuid,uuid,text,uuid,text,integer,text,jsonb,jsonb,jsonb,uuid);
DROP FUNCTION IF EXISTS fitcore_assessment_template_publish(uuid,uuid,text,text,text,text,jsonb);
DROP FUNCTION IF EXISTS fitcore_assessment_consent_record(uuid,uuid,text,uuid,text,text,text);
DROP FUNCTION IF EXISTS fitcore_assessment_current_consent(uuid,uuid,text);
DROP FUNCTION IF EXISTS fitcore_assessment_accessible_student(uuid,uuid,text,uuid);

DROP TABLE IF EXISTS fitcore_assessment_events;
DROP TABLE IF EXISTS fitcore_assessment_attachments;
DROP TABLE IF EXISTS fitcore_assessment_measurements;
DROP TABLE IF EXISTS fitcore_assessments;
DROP TABLE IF EXISTS fitcore_assessment_consents;
DROP TABLE IF EXISTS fitcore_assessment_templates;

DROP FUNCTION IF EXISTS fitcore_assessment_prevent_mutation();

DELETE FROM fitcore_schema_migrations WHERE version='028-assessments-anamnesis';

COMMIT;
