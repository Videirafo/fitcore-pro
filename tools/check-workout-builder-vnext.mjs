import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  normalizeWorkoutBuilder,
  workoutBuilderPreview,
  WORKOUT_BUILDER_VNEXT_SCHEMA_VERSION,
} from "../services/api/security/workout-builder-vnext.mjs";
import { createWorkoutBuilderManager } from "../services/api/security/workout-builder-manager.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const [migration, rollback, publishMigration, publishRollback, managerSource, serverSource, uiSource, uiPage, trainingPage] = await Promise.all([
  read("infra/sql/031-workout-builder-vnext.sql"),
  read("infra/sql/rollback-031-workout-builder-vnext.sql"),
  read("infra/sql/032-workout-builder-vnext-publish.sql"),
  read("infra/sql/rollback-032-workout-builder-vnext-publish.sql"),
  read("services/api/security/workout-builder-manager.mjs"),
  read("services/api/server.mjs"),
  read("apps/site/components/WorkoutBuilderVNextClient.tsx"),
  read("apps/site/app/treinos/builder/page.tsx"),
  read("apps/site/app/treinos/page.tsx"),
]);

for (const token of [
  "fitcore_workout_templates",
  "fitcore_workout_blocks",
  "fitcore_workout_set_targets",
  "prescription_version",
  "builder_schema_version",
  "protocol_code",
  "periodization",
  "source_template_id",
  "rir_target",
  "rpe_target",
]) assert.match(migration, new RegExp(token));

assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /current_setting\('app\.tenant_id',true\)/);
assert.match(migration, /UNIQUE \(tenant_id,template_key,version\)/);
assert.match(migration, /UNIQUE \(workout_exercise_id,set_order\)/);
assert.match(migration, /031-workout-builder-vnext/);
assert.match(rollback, /DROP TABLE IF EXISTS fitcore_workout_set_targets/);
assert.match(rollback, /DROP TABLE IF EXISTS fitcore_workout_blocks/);
assert.match(rollback, /DROP TABLE IF EXISTS fitcore_workout_templates/);
assert.match(rollback, /DROP COLUMN IF EXISTS prescription_version/);
assert.match(publishMigration, /fitcore_workout_builder_publish/);
assert.match(publishMigration, /workout_builder_tenant_context_mismatch/);
assert.match(publishMigration, /workout_builder_role_forbidden/);
assert.match(publishMigration, /fitcore_workout_prescription_events/);
assert.match(publishMigration, /workout_builder_published/);
assert.match(publishMigration, /pg_advisory_xact_lock/);
assert.match(publishRollback, /DROP FUNCTION IF EXISTS fitcore_workout_builder_publish/);

const input = {
  title: "Hipertrofia A/B",
  objective: "hipertrofia",
  frequency_per_week: 4,
  protocol_code: "hypertrophy",
  periodization: { type: "undulating", weeks: 6 },
  days: [
    {
      title: "A — Superior",
      focus: "upper",
      blocks: [
        {
          title: "Peito",
          type: "main",
          exercises: [
            {
              name: "Supino reto",
              slug: "supino-reto",
              progression: { kind: "load", step: 2.5, unit: "kg" },
              sets: [
                { reps: "8", load: "70kg", rest_seconds: 120, rir_target: 2, rpe_target: 8 },
                { reps: "8", load: "70kg", rest_seconds: 120, rir_target: 2, rpe_target: 8 },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const normalized = normalizeWorkoutBuilder(input);
assert.equal(WORKOUT_BUILDER_VNEXT_SCHEMA_VERSION, 1);
assert.equal(normalized.protocol_code, "hypertrophy");
assert.equal(normalized.periodization.type, "undulating");
assert.equal(normalized.periodization.weeks, 6);
assert.equal(normalized.days.length, 1);
assert.equal(normalized.days[0].blocks.length, 1);
assert.equal(normalized.days[0].blocks[0].exercises.length, 1);
assert.equal(normalized.days[0].blocks[0].exercises[0].sets.length, 2);
assert.equal(normalized.days[0].blocks[0].exercises[0].sets[0].rir_target, 2);
assert.equal(normalized.days[0].blocks[0].exercises[0].sets[0].rpe_target, 8);

const preview = workoutBuilderPreview(input);
assert.equal(preview.publishable, true);
assert.deepEqual(preview.summary, {
  days: 1,
  blocks: 1,
  exercises: 1,
  sets: 2,
  frequency_per_week: 4,
  periodization_type: "undulating",
  periodization_weeks: 6,
  protocol_code: "hypertrophy",
});

const bounded = normalizeWorkoutBuilder({
  protocol_code: "unsupported",
  periodization: { type: "magic", weeks: 999 },
  days: Array.from({ length: 20 }, () => ({
    blocks: Array.from({ length: 20 }, () => ({
      exercises: Array.from({ length: 40 }, () => ({ name: "X", series: 99 })),
    })),
  })),
});
assert.equal(bounded.protocol_code, "general");
assert.equal(bounded.periodization.type, "none");
assert.equal(bounded.periodization.weeks, 52);
assert.equal(bounded.days.length, 7);
assert.equal(bounded.days[0].blocks.length, 12);
assert.equal(bounded.days[0].blocks[0].exercises.length, 20);
assert.equal(bounded.days[0].blocks[0].exercises[0].sets.length, 12);

const manager = createWorkoutBuilderManager({});
const anonymousPreview = manager.preview({}, input);
assert.equal(anonymousPreview.guard.statusCode, 401);
const studentPreview = manager.preview({
  session_signed: true,
  tenant_id: "tenant-a",
  actor_id: "actor-a",
  actor_role: "aluno",
}, input);
assert.equal(studentPreview.guard.statusCode, 403);
const coachPreview = manager.preview({
  session_signed: true,
  tenant_id: "tenant-a",
  tenant_slug: "tenant-a",
  actor_id: "coach-a",
  actor_role: "professor",
}, input);
assert.equal(coachPreview.ok, true);
assert.equal(coachPreview.publishable, true);

for (const route of [
  "/api/vnext/workout-builder/status",
  "/api/vnext/workout-builder/preview",
  "/api/vnext/workout-builder/templates",
  "/api/vnext/workout-builder/prescriptions",
  "workout-builder/templates\\/([^/]+)\\/clone",
]) assert.match(serverSource, new RegExp(route));

assert.match(managerSource, /pg_advisory_xact_lock/);
assert.match(managerSource, /hashtextextended/);
assert.match(managerSource, /workout_builder_role_forbidden/);
assert.match(managerSource, /publishPrescription/);
assert.match(managerSource, /fitcore_workout_builder_publish/);
assert.match(managerSource, /workout_builder_student_id_invalid/);
assert.doesNotMatch(managerSource, /response: \{ erro: clean\(error\?\.message/);
assert.doesNotMatch(managerSource, /phone|email|raw_payload|provider_payload/i);

for (const token of [
  "Workout Builder VNext",
  "RIR alvo",
  "RPE alvo",
  "Adicionar exercício",
  "Enviar para revisão",
  "/api/vnext/workout-builder/preview",
  "/api/vnext/workout-builder/prescriptions",
]) assert.match(uiSource, new RegExp(token));

assert.match(uiPage, /WorkoutBuilderVNextClient/);
assert.match(uiPage, /periodização/i);
assert.match(trainingPage, /\/treinos\/builder/);
assert.match(trainingPage, /Abrir Workout Builder VNext/);

console.log("Workout Builder VNext #93 foundation + API contract: OK");
