#!/usr/bin/env node

/**
 * FITCORE PRO - Normalize Exercises Dataset
 *
 * Converts storage/exercises-dataset/exercises.raw.json into a safer
 * FitCore internal textual catalog file.
 *
 * Media policy:
 * - Do not copy image/gif_url/media files into the normalized output.
 * - Keep media_policy=textual_only until FitCore has its own media license.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(process.cwd());
const inputPath = resolve(root, "storage/exercises-dataset/exercises.raw.json");
const outputPath = resolve(root, "storage/exercises-dataset/exercises.normalized.json");
const summaryPath = resolve(root, "storage/exercises-dataset/NORMALIZE_SUMMARY.txt");
const sourcePath = resolve(root, "storage/exercises-dataset/SOURCE.txt");

function fail(message) {
  console.error(`ERRO: ${message}`);
  process.exit(1);
}

function asString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

function asStringRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => typeof item === "string" && item.trim().length > 0)
      .map(([key, item]) => [key, item.trim()]),
  );
}

function asStepsRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const out = {};
  for (const [lang, steps] of Object.entries(value)) {
    const cleanSteps = asStringArray(steps);
    if (cleanSteps.length > 0) out[lang] = cleanSteps;
  }
  return out;
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function normalizeSearchText(parts) {
  return parts
    .flatMap((part) => {
      if (!part) return [];
      if (Array.isArray(part)) return part;
      if (typeof part === "object") return Object.values(part).flat();
      return [part];
    })
    .filter((item) => typeof item === "string" && item.trim().length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeRecord(record) {
  const sourceId = asString(record.id);
  const name = asString(record.name);

  if (!sourceId || !name) return null;

  const category = asString(record.category);
  const bodyPart = asString(record.body_part) ?? category;
  const equipment = asString(record.equipment);
  const target = asString(record.target);
  const muscleGroup = asString(record.muscle_group);
  const secondaryMuscles = asStringArray(record.secondary_muscles);
  const instructions = asStringRecord(record.instructions);
  const instructionSteps = asStepsRecord(record.instruction_steps);

  return {
    source: "hasaneyldrm/exercises-dataset",
    source_id: sourceId,
    name,
    slug: `${sourceId}-${slugify(name)}`,
    category,
    body_part: bodyPart,
    equipment,
    target,
    primary_muscle: target ?? muscleGroup,
    muscle_group: muscleGroup,
    secondary_muscles: secondaryMuscles,
    instructions_en: instructions.en ?? null,
    instructions_pt_br: null,
    instructions,
    instruction_steps: instructionSteps,
    difficulty: null,
    safety_notes: [],
    search_text: normalizeSearchText([
      name,
      category,
      bodyPart,
      equipment,
      target,
      muscleGroup,
      secondaryMuscles,
      instructions.en,
    ]),
    media_policy: "textual_only",
    created_at: asString(record.created_at),
    normalized_at: new Date().toISOString(),
  };
}

if (!existsSync(inputPath)) {
  fail(`arquivo não encontrado: ${inputPath}. Rode antes: bash infra/scripts/exercises-dataset-sync.sh`);
}

mkdirSync(dirname(outputPath), { recursive: true });

const raw = JSON.parse(readFileSync(inputPath, "utf8"));
if (!Array.isArray(raw)) fail("exercises.raw.json deve ser um array JSON");

const normalized = [];
let skipped = 0;

for (const record of raw) {
  const item = normalizeRecord(record);
  if (item) normalized.push(item);
  else skipped += 1;
}

normalized.sort((a, b) => a.source_id.localeCompare(b.source_id));

const byBodyPart = new Map();
const byEquipment = new Map();

for (const item of normalized) {
  const bodyPart = item.body_part ?? "unknown";
  const equipment = item.equipment ?? "unknown";
  byBodyPart.set(bodyPart, (byBodyPart.get(bodyPart) ?? 0) + 1);
  byEquipment.set(equipment, (byEquipment.get(equipment) ?? 0) + 1);
}

const sourceText = existsSync(sourcePath) ? readFileSync(sourcePath, "utf8").trim() : "source=unknown";
const summary = [
  "FitCore Pro - Exercises Normalization Summary",
  "",
  sourceText,
  "",
  `input=${inputPath}`,
  `output=${outputPath}`,
  `total_raw=${raw.length}`,
  `total_normalized=${normalized.length}`,
  `total_skipped=${skipped}`,
  "media_policy=textual_only",
  "",
  "Top body parts:",
  ...[...byBodyPart.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([key, value]) => `- ${key}: ${value}`),
  "",
  "Top equipment:",
  ...[...byEquipment.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([key, value]) => `- ${key}: ${value}`),
  "",
].join("\n");

writeFileSync(outputPath, `${JSON.stringify(normalized, null, 2)}\n`);
writeFileSync(summaryPath, summary);

console.log(summary);
