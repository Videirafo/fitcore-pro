-- FITCORE PRO — rollback #92 hardening 029
-- Reapplies the complete 028 baseline so every function, trigger, policy and privilege
-- replaced by 029 is restored before the 029 migration marker is removed.
\ir 028-assessments-anamnesis.sql

BEGIN;
DELETE FROM fitcore_schema_migrations WHERE version='029-assessments-hardening';
COMMIT;
