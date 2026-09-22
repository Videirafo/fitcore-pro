import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  normalizeWorkoutBuilder,
  workoutBuilderPreview,
  WORKOUT_BUILDER_VNEXT_SCHEMA_VERSION,
} from "../services/api/security/workout-builder-vnext.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const [migration, rollback] = await Promise.all([
  read("infra/sql/031-workout-builder-vnext.sql"),
  read("infra/sql/rollback-031-workout-builder-vnext.sql"),
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

console.log("Workout Builder VNext #93 foundation contract: OK");
