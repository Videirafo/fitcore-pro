export type FitCoreAutomationRisk = "low" | "medium" | "high";

export type FitCoreAutomationPattern = Readonly<{
  id: string;
  intent: string;
  trigger: string;
  actions: readonly string[];
  risk: FitCoreAutomationRisk;
  approval: "none" | "before-external-write" | "always";
  provenance: string;
}>;

/**
 * Concepts adapted from audited public n8n workflow collections.
 * No third-party workflow JSON is copied into the FitCore runtime.
 */
export const fitcoreAutomationPatterns: readonly FitCoreAutomationPattern[] = Object.freeze([
  {
    id: "training-reminder",
    intent: "Remind a member about an approved scheduled workout.",
    trigger: "scheduled_workout_due",
    actions: ["load-tenant-member-context", "render-approved-template", "queue-notification"],
    risk: "medium",
    approval: "before-external-write",
    provenance: "concept-only:enescingoz/awesome-n8n-templates",
  },
  {
    id: "coach-review-draft",
    intent: "Draft a coach follow-up from tenant-scoped execution evidence.",
    trigger: "coach_review_requested",
    actions: ["load-evidence-pack", "draft-message", "require-human-review"],
    risk: "medium",
    approval: "always",
    provenance: "concept-only:enescingoz/awesome-n8n-templates",
  },
]);
export const fitcoreAutomationPatternIndex = Object.freeze(
  new Map(fitcoreAutomationPatterns.map((pattern) => [pattern.id, pattern])),
);

export function getFitCoreAutomationPattern(id: string): FitCoreAutomationPattern | null {
  return fitcoreAutomationPatternIndex.get(id) || null;
}

export function canAutoExecuteFitCorePattern(pattern: FitCoreAutomationPattern): boolean {
  return pattern.risk === "low" && pattern.approval === "none";
}
