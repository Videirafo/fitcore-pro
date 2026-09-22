// FITCORE PRO — #93 Workout Builder VNext foundation.
// Pure normalization/preview contract. Persistence and publication remain server-side.

const PERIODIZATION_TYPES = new Set(["none","linear","undulating","block"]);
const PROTOCOL_CODES = new Set(["general","strength","hypertrophy","conditioning","mobility"]);

function clean(value, fallback = "", max = 180) {
  const text = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return text || fallback;
}
function integer(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(Math.max(safe, min), max);
}
function decimal(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}
function code(value, fallback, max = 80) {
  const raw = clean(value, fallback, max).toLowerCase().replace(/[^a-z0-9_.:-]+/g, "_");
  return raw || fallback;
}
function normalizeSet(input = {}, index = 0) {
  return {
    order: index + 1,
    reps: clean(input.reps ?? input.repeticoes, "8-12", 40),
    load: clean(input.load ?? input.carga, "", 40) || null,
    rest_seconds: integer(input.rest_seconds ?? input.descanso_segundos, 90, 0, 900),
    rir_target: decimal(input.rir_target ?? input.rir, null, 0, 10),
    rpe_target: decimal(input.rpe_target ?? input.rpe, null, 1, 10),
    tempo: clean(input.tempo, "", 30) || null,
  };
}
function normalizeExercise(input = {}, index = 0) {
  const setsInput = Array.isArray(input.sets) ? input.sets.slice(0, 12) : [];
  const fallbackSets = integer(input.series, 3, 1, 12);
  const sets = setsInput.length
    ? setsInput.map(normalizeSet)
    : Array.from({ length: fallbackSets }, (_, setIndex) => normalizeSet(input, setIndex));
  return {
    order: index + 1,
    source_id: clean(input.source_id ?? input.sourceId, "", 120) || null,
    slug: code(input.slug ?? input.nome ?? input.name, `exercise_${index + 1}`, 120),
    name: clean(input.name ?? input.nome, `Exercício ${index + 1}`, 160),
    category: clean(input.category ?? input.categoria, "", 80) || null,
    equipment: clean(input.equipment ?? input.equipamento, "", 80) || null,
    focus: clean(input.focus ?? input.foco, "", 120) || null,
    notes: clean(input.notes ?? input.observacao, "", 320) || null,
    progression: {
      kind: code(input.progression?.kind ?? input.progression_kind, "none", 40),
      step: decimal(input.progression?.step ?? input.progression_step, 0, 0, 1000),
      unit: clean(input.progression?.unit ?? input.progression_unit, "", 30) || null,
    },
    sets,
  };
}
function normalizeBlock(input = {}, index = 0) {
  const exercises = Array.isArray(input.exercises ?? input.exercicios)
    ? (input.exercises ?? input.exercicios).slice(0, 20).map(normalizeExercise)
    : [];
  return {
    order: index + 1,
    code: code(input.code ?? input.codigo, `block_${index + 1}`, 80),
    title: clean(input.title ?? input.titulo, `Bloco ${index + 1}`, 120),
    type: code(input.type ?? input.tipo, "main", 40),
    exercises,
  };
}
function normalizeDay(input = {}, index = 0) {
  const blocks = Array.isArray(input.blocks ?? input.blocos)
    ? (input.blocks ?? input.blocos).slice(0, 12).map(normalizeBlock)
    : [];
  return {
    order: index + 1,
    code: code(input.code ?? input.codigo, `day_${index + 1}`, 80),
    title: clean(input.title ?? input.titulo, `Dia ${index + 1}`, 120),
    focus: clean(input.focus ?? input.foco, "", 120) || null,
    warmup: clean(input.warmup ?? input.aquecimento, "", 320) || null,
    guidance: clean(input.guidance ?? input.orientacao, "", 320) || null,
    blocks,
  };
}

export function normalizeWorkoutBuilder(input = {}) {
  const days = Array.isArray(input.days ?? input.dias)
    ? (input.days ?? input.dias).slice(0, 7).map(normalizeDay)
    : [];
  const periodization = code(input.periodization?.type ?? input.periodization_type, "none", 40);
  const protocol = code(input.protocol_code ?? input.protocol, "general", 80);
  return {
    schema_version: 1,
    title: clean(input.title ?? input.nome_treino, "Treino VNext", 160),
    objective: clean(input.objective ?? input.objetivo, "progressão", 160),
    frequency_per_week: integer(input.frequency_per_week ?? input.dias_semana, Math.max(days.length, 1), 1, 7),
    protocol_code: PROTOCOL_CODES.has(protocol) ? protocol : "general",
    periodization: {
      type: PERIODIZATION_TYPES.has(periodization) ? periodization : "none",
      weeks: integer(input.periodization?.weeks ?? input.periodization_weeks, 4, 1, 52),
    },
    days,
  };
}

export function workoutBuilderPreview(input = {}) {
  const workout = normalizeWorkoutBuilder(input);
  const blocks = workout.days.flatMap((day) => day.blocks);
  const exercises = blocks.flatMap((block) => block.exercises);
  const sets = exercises.flatMap((exercise) => exercise.sets);
  return {
    workout,
    summary: {
      days: workout.days.length,
      blocks: blocks.length,
      exercises: exercises.length,
      sets: sets.length,
      frequency_per_week: workout.frequency_per_week,
      periodization_type: workout.periodization.type,
      periodization_weeks: workout.periodization.weeks,
      protocol_code: workout.protocol_code,
    },
    publishable: workout.days.length > 0 && exercises.length > 0 && sets.length > 0,
  };
}

export const WORKOUT_BUILDER_VNEXT_SCHEMA_VERSION = 1;
