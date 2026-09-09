export const fitcoreAgencyAgentIds = [
  "frontend-developer",
  "ui-designer",
  "reality-checker",
  "ai-code-auditor",
  "community-builder",
  "creative-strategist",
  "agents-orchestrator",
] as const;

export type FitCoreAgencyAgentId = (typeof fitcoreAgencyAgentIds)[number];

export type FitCoreAgencyGate = "reality" | "security";

export type FitCoreAgencyAgent = Readonly<{
  id: FitCoreAgencyAgentId;
  division:
    | "engineering"
    | "design"
    | "testing"
    | "security"
    | "marketing"
    | "paid-media"
    | "specialized";
  role: string;
  process: readonly string[];
  deliverable: string;
  doesNot: readonly string[];
  gate?: FitCoreAgencyGate;
}>;

/**
 * Curated, first-party contracts adapted from the audited Agency pattern.
 * FitCore never loads the external 273-agent catalog into runtime context.
 */
export const fitcoreAgencyCatalog = {
  "frontend-developer": {
    id: "frontend-developer",
    division: "engineering",
    role: "Implement an approved FitCore product slice using the existing monorepo and tenant boundaries.",
    process: [
      "Inspect the existing app/service/package before creating files.",
      "Reuse shared contracts and preserve wger as the internal exercise engine.",
      "Implement the smallest end-to-end slice that can be exercised.",
      "Hand off changed files, run instructions and acceptance criteria to verification.",
    ],
    deliverable: "Runnable FitCore product slice with bounded changed-file scope and run instructions.",
    doesNot: [
      "Create a parallel FitCore core.",
      "Duplicate wger functionality without an explicit product reason.",
      "Declare completion before real verification.",
    ],
  },
  "ui-designer": {
    id: "ui-designer",
    division: "design",
    role: "Improve the working FitCore experience for mobile and web after functionality exists.",
    process: [
      "Inspect the working flow on mobile-sized and desktop surfaces.",
      "Improve hierarchy, spacing, typography, touch targets and state clarity.",
      "Preserve the existing design system and component reuse.",
      "Return concrete deltas instead of a disconnected redesign.",
    ],
    deliverable: "Reviewable UI refinements attached to an existing working FitCore flow.",
    doesNot: [
      "Replace working architecture for cosmetic reasons.",
      "Hide business-critical state behind decorative UI.",
      "Introduce a second design system without migration approval.",
    ],
  },
  "reality-checker": {
    id: "reality-checker",
    division: "testing",
    role: "Verify observable FitCore behavior and reject unsupported completion claims.",
    process: [
      "Turn acceptance criteria into observable checks.",
      "Exercise the real path against the intended app/service boundary.",
      "Include failure, tenant isolation and mobile-relevant states when applicable.",
      "Record pass/fail evidence and return failures to the responsible stage.",
    ],
    deliverable: "Evidence-backed verification report with reproducible failures.",
    doesNot: [
      "Treat generated text as proof.",
      "Silently downgrade warnings to passes.",
      "Approve a path that was not exercised.",
    ],
    gate: "reality",
  },
  "ai-code-auditor": {
    id: "ai-code-auditor",
    division: "security",
    role: "Audit AI-assisted FitCore changes for security, validation, dependencies and multi-tenant mistakes.",
    process: [
      "Read the real diff and dependency changes.",
      "Check auth, authorization, tenant isolation, secrets and validation.",
      "Check service boundaries and unsafe defaults.",
      "Separate blocking findings from non-blocking hardening work.",
    ],
    deliverable: "Security/quality audit with evidence and remediation status.",
    doesNot: [
      "Approve code without reading the changed scope.",
      "Expose secrets to client applications.",
      "Grant permissions implicitly.",
    ],
    gate: "security",
  },
  "community-builder": {
    id: "community-builder",
    division: "marketing",
    role: "Turn verified FitCore capabilities into useful community distribution.",
    process: [
      "Start from verified product behavior.",
      "Choose a relevant trainer/gym/student community and its norms.",
      "Lead with useful proof, workflow or learning instead of generic promotion.",
      "Capture feedback as evidence for product discovery.",
    ],
    deliverable: "Community distribution brief grounded in verified FitCore behavior.",
    doesNot: [
      "Invent health, performance or business outcomes.",
      "Publish private tenant/member information.",
      "Convert feedback directly into roadmap commitments.",
    ],
  },
  "creative-strategist": {
    id: "creative-strategist",
    division: "paid-media",
    role: "Define the ad angle and experiment before producing FitCore campaign assets.",
    process: [
      "Select an explicit audience and problem.",
      "Use only verified FitCore capabilities and permitted claims.",
      "Define hook, promise, proof, hypothesis and success signal.",
      "Hand off a bounded creative brief for production and measurement.",
    ],
    deliverable: "Paid-media strategy with claim boundaries, hypothesis and measurement signal.",
    doesNot: [
      "Fabricate member results or medical claims.",
      "Skip product verification gates.",
      "Auto-publish generated assets without the appropriate approval flow.",
    ],
  },
  "agents-orchestrator": {
    id: "agents-orchestrator",
    division: "specialized",
    role: "Choose the minimum useful specialist set and coordinate sequential FitCore handoffs.",
    process: [
      "Classify the work before activating specialists.",
      "Select only the roles needed for the current task.",
      "Materialize one specialist contract at a time.",
      "Carry prior results as handoff evidence and require gates for executable product changes.",
    ],
    deliverable: "Minimal sequential plan with specialist stages, gates and handoffs.",
    doesNot: [
      "Load the whole external catalog into context.",
      "Run overlapping specialists concurrently by default.",
      "Bypass FitCore authorization, service boundaries or human approval requirements.",
    ],
  },
} satisfies Record<FitCoreAgencyAgentId, FitCoreAgencyAgent>;

export const FITCORE_AGENCY_MAX_ACTIVE = 7;

export const fitcoreDefaultAgencyCycle = [
  "agents-orchestrator",
  "frontend-developer",
  "ui-designer",
  "reality-checker",
  "ai-code-auditor",
  "community-builder",
  "creative-strategist",
] as const satisfies readonly FitCoreAgencyAgentId[];

export type FitCoreAgencyPlanStep = Readonly<{
  order: number;
  agent: FitCoreAgencyAgentId;
  gate?: FitCoreAgencyGate;
}>;

export function validateFitCoreAgencySelection(ids: readonly string[]): FitCoreAgencyAgentId[] {
  if (ids.length === 0) throw new Error("fitcore_agency_empty_selection");
  if (ids.length > FITCORE_AGENCY_MAX_ACTIVE) throw new Error("fitcore_agency_context_budget_exceeded");

  const allowed = new Set<string>(fitcoreAgencyAgentIds);
  const seen = new Set<string>();

  for (const id of ids) {
    if (!allowed.has(id)) throw new Error(`fitcore_agency_unknown_agent:${id}`);
    if (seen.has(id)) throw new Error(`fitcore_agency_duplicate_agent:${id}`);
    seen.add(id);
  }

  return [...ids] as FitCoreAgencyAgentId[];
}

export function buildFitCoreAgencyPlan(
  ids: readonly string[] = fitcoreDefaultAgencyCycle,
): FitCoreAgencyPlanStep[] {
  const selected = validateFitCoreAgencySelection(ids);

  return selected.map((agent, index) => ({
    order: index + 1,
    agent,
    ...(fitcoreAgencyCatalog[agent].gate ? { gate: fitcoreAgencyCatalog[agent].gate } : {}),
  }));
}

export function materializeFitCoreAgentContext(agent: FitCoreAgencyAgentId): FitCoreAgencyAgent {
  return fitcoreAgencyCatalog[agent];
}

export function hasFitCoreEngineeringGates(ids: readonly string[]): boolean {
  const selected = new Set(validateFitCoreAgencySelection(ids));
  const changesExecutableProduct = selected.has("frontend-developer");

  if (!changesExecutableProduct) return true;
  return selected.has("reality-checker") && selected.has("ai-code-auditor");
}
