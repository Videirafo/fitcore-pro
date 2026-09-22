import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const [migration, rollback, manager, server, deploy, ui] = await Promise.all([
  read("infra/sql/030-workout-builder-vnext.sql"),
  read("infra/sql/rollback-030-workout-builder-vnext.sql"),
  read("services/api/security/workout-builder-vnext.mjs"),
  read("services/api/server.mjs"),
  read("infra/scripts/deploy-fitcore-by-sha.sh"),
  read("apps/site/components/FitCoreRouteClient.tsx"),
]);

for (const token of [
  "fitcore_workout_blocks",
  "fitcore_workout_builder_versions",
  "fitcore_workout_templates",
  "fitcore_workout_protocols",
  "target_load_kg",
  "target_rir_min",
  "target_rir_max",
  "target_rpe",
  "published_builder_version_id",
  "workout_builder_version_immutable",
]) assert.ok(migration.includes(token), token);

assert.match(migration, /snapshot IS DISTINCT FROM OLD\.snapshot/);
assert.match(migration, /state IN \('draft','published','superseded'\)/);
assert.match(rollback, /DROP TABLE IF EXISTS fitcore_workout_builder_versions/);

for (const token of [
  "normalizeSnapshot",
  "normalizePeriodization",
  "createVersion",
  "publishVersion",
  "saveTemplate",
  "cloneTemplate",
  "upsertProtocol",
  "publish_materializes_canonical_tables",
]) assert.ok(manager.includes(token), token);

for (const route of [
  "/api/vnext/workout-builder/status",
  "/api/vnext/workout-builder/templates",
  "/api/vnext/workout-builder/templates/clone",
  "/api/vnext/workout-builder/protocols",
]) assert.ok(server.includes(route), route);

assert.match(server, /builderVersionsMatch/);
assert.match(server, /builderPublishMatch/);
assert.match(deploy, /apply-workout-builder-vnext\.sh/);

for (const token of [
  "Workout Builder VNext",
  "Preview da versão",
  "Publicar versão",
  "Salvar como template",
  "Periodização planejada",
]) assert.ok(ui.includes(token), token);

console.log("Workout Builder VNext #93 contract: OK");
