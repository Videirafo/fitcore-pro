-- FITCORE PRO — MVP-46 disposable database rollback.
-- Destrutivo por definição: usar apenas em gate descartável/staging vazio.
-- Produção usa infra/scripts/rollback-mvp-46-mobile-release.sh, que preserva dados.

DROP TABLE IF EXISTS fitcore_workout_execution_sets;
DELETE FROM fitcore_schema_migrations
WHERE version = '019-mvp-46-mobile-release';
