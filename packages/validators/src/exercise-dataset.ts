import { z } from "zod";

/**
 * Schema interno mínimo para normalizar dados textuais vindos de
 * hasaneyldrm/exercises-dataset.
 *
 * Política atual: textual_only.
 * Não usar imagens/GIFs em produção comercial sem licença própria da Gym visual.
 */

export const exerciseDatasetRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string().optional(),
  body_part: z.string().optional(),
  equipment: z.string().optional(),
  target: z.string().optional(),
  muscle_group: z.string().optional(),
  secondary_muscles: z.array(z.string()).optional(),
  instructions: z.record(z.string()).optional(),
  instruction_steps: z.record(z.array(z.string())).optional(),
  created_at: z.string().optional(),
});

export const normalizedFitCoreExerciseSchema = z.object({
  source: z.literal("hasaneyldrm/exercises-dataset"),
  source_id: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  body_part: z.string().nullable(),
  equipment: z.string().nullable(),
  target: z.string().nullable(),
  muscle_group: z.string().nullable(),
  secondary_muscles: z.array(z.string()),
  instructions: z.record(z.string()),
  instruction_steps: z.record(z.array(z.string())),
  media_policy: z.literal("textual_only"),
  created_at: z.string().nullable(),
});

export type ExerciseDatasetRecord = z.infer<typeof exerciseDatasetRecordSchema>;
export type NormalizedFitCoreExercise = z.infer<typeof normalizedFitCoreExerciseSchema>;

export function normalizeExerciseDatasetRecord(
  record: ExerciseDatasetRecord,
): NormalizedFitCoreExercise {
  return {
    source: "hasaneyldrm/exercises-dataset",
    source_id: record.id,
    name: record.name,
    category: record.category ?? null,
    body_part: record.body_part ?? null,
    equipment: record.equipment ?? null,
    target: record.target ?? null,
    muscle_group: record.muscle_group ?? null,
    secondary_muscles: record.secondary_muscles ?? [],
    instructions: record.instructions ?? {},
    instruction_steps: record.instruction_steps ?? {},
    media_policy: "textual_only",
    created_at: record.created_at ?? null,
  };
}
