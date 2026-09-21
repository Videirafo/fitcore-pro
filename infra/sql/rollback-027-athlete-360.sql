BEGIN;
DROP FUNCTION IF EXISTS fitcore_athlete_goal_update(uuid,uuid,text,uuid,numeric,text,text);
DROP FUNCTION IF EXISTS fitcore_athlete_goal_create(uuid,uuid,text,uuid,text,text,numeric,text,date,text);
DROP FUNCTION IF EXISTS fitcore_athlete_360_snapshot(uuid,uuid,text,uuid);
DROP FUNCTION IF EXISTS fitcore_athlete_360_accessible_student(uuid,uuid,text,uuid);
DROP TABLE IF EXISTS fitcore_athlete_goal_events;
DROP TABLE IF EXISTS fitcore_athlete_goals;
DELETE FROM fitcore_schema_migrations WHERE version='027-athlete-360';
COMMIT;
