-- FITCORE PRO — rollback #93 Workout Builder VNext publish
BEGIN;

DROP FUNCTION IF EXISTS fitcore_workout_builder_publish(uuid,uuid,uuid,jsonb,uuid);

DELETE FROM fitcore_schema_migrations
WHERE version='032-workout-builder-vnext-publish';

COMMIT;
