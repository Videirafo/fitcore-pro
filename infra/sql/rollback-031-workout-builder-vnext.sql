-- FITCORE PRO — rollback #93 Workout Builder VNext foundation
BEGIN;

DELETE FROM fitcore_schema_migrations
WHERE version='031-workout-builder-vnext';

ALTER TABLE fitcore_workouts
  DROP CONSTRAINT IF EXISTS fitcore_workouts_prescription_version_check,
  DROP CONSTRAINT IF EXISTS fitcore_workouts_builder_schema_version_check,
  DROP COLUMN IF EXISTS source_template_id,
  DROP COLUMN IF EXISTS periodization,
  DROP COLUMN IF EXISTS protocol_code,
  DROP COLUMN IF EXISTS builder_schema_version,
  DROP COLUMN IF EXISTS prescription_version;

DROP TABLE IF EXISTS fitcore_workout_set_targets;

ALTER TABLE fitcore_workout_exercises
  DROP COLUMN IF EXISTS progression,
  DROP COLUMN IF EXISTS block_id;

DROP TABLE IF EXISTS fitcore_workout_blocks;
DROP TABLE IF EXISTS fitcore_workout_templates;

DROP INDEX IF EXISTS uq_fitcore_workout_exercises_tenant_id;
DROP INDEX IF EXISTS uq_fitcore_workout_days_tenant_id;

COMMIT;
