import {
  FITCORE_AGENCY_MAX_ACTIVE,
  buildFitCoreAgencyPlan,
  fitcoreDefaultAgencyCycle,
  hasFitCoreEngineeringGates,
  materializeFitCoreAgentContext,
  validateFitCoreAgencySelection,
} from "./agency.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectFailure(run: () => unknown, expectedCode: string) {
  try {
    run();
  } catch (error) {
    assert(error instanceof Error, "agency_check_non_error_failure");
    assert(error.message.includes(expectedCode), `agency_check_wrong_error:${error.message}`);
    return;
  }

  throw new Error(`agency_check_expected_failure:${expectedCode}`);
}

const plan = buildFitCoreAgencyPlan();

assert(FITCORE_AGENCY_MAX_ACTIVE === 7, "agency_check_max_active_changed");
assert(plan.length === 7, "agency_check_default_cycle_size");
assert(plan[0]?.agent === "agents-orchestrator", "agency_check_orchestrator_must_coordinate_first");
assert(
  plan.find((step) => step.agent === "reality-checker")?.gate === "reality",
  "agency_check_missing_reality_gate",
);
assert(
  plan.find((step) => step.agent === "ai-code-auditor")?.gate === "security",
  "agency_check_missing_security_gate",
);
assert(
  hasFitCoreEngineeringGates(["frontend-developer", "reality-checker", "ai-code-auditor"]),
  "agency_check_required_engineering_gates",
);
assert(
  !hasFitCoreEngineeringGates(["frontend-developer", "reality-checker"]),
  "agency_check_security_gate_should_be_required",
);
assert(
  materializeFitCoreAgentContext("reality-checker").id === "reality-checker",
  "agency_check_single_agent_materialization",
);

expectFailure(
  () => validateFitCoreAgencySelection([...fitcoreDefaultAgencyCycle, "frontend-developer"]),
  "fitcore_agency_context_budget_exceeded",
);
expectFailure(
  () => validateFitCoreAgencySelection(["frontend-developer", "frontend-developer"]),
  "fitcore_agency_duplicate_agent",
);
expectFailure(
  () => validateFitCoreAgencySelection(["unknown-agent"]),
  "fitcore_agency_unknown_agent",
);

console.log("FITCORE AGENCY CHECK: PASS");
console.log(`active_limit=${FITCORE_AGENCY_MAX_ACTIVE}`);
console.log(`default_cycle=${plan.map((step) => step.agent).join(" -> ")}`);
console.log("engineering_gates=reality+security");
