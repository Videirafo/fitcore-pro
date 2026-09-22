BEGIN;
ALTER TABLE fitcore_workouts DROP COLUMN IF EXISTS published_builder_version_id;
ALTER TABLE fitcore_workout_exercises
  DROP COLUMN IF EXISTS block_id,
  DROP COLUMN IF EXISTS target_load_kg,
  DROP COLUMN IF EXISTS target_rir_min,
  DROP COLUMN IF EXISTS target_rir_max,
  DROP COLUMN IF EXISTS target_rpe,
  DROP COLUMN IF EXISTS tempo,
  DROP COLUMN IF EXISTS protocol_code;
DROP TABLE IF EXISTS fitcore_workout_protocols;
DROP TABLE IF EXISTS fitcore_workout_templates;
DROP TRIGGER IF EXISTS immutable_builder_version ON fitcore_workout_builder_versions;
DROP TABLE IF EXISTS fitcore_workout_builder_versions;
DROP TABLE IF EXISTS fitcore_workout_blocks;
DROP FUNCTION IF EXISTS fitcore_workout_builder_prevent_version_mutation();
DELETE FROM fitcore_schema_migrations WHERE version='030-workout-builder-vnext';
COMMIT;
