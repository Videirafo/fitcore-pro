import { buildFitCoreAgencyPlan, FITCORE_AGENCY_MAX_ACTIVE } from "./agency.ts";
import { evaluateFitCoreExecution } from "./execution-boundary.ts";
import { canAutoExecuteFitCorePattern, fitcoreAutomationPatterns } from "./automation-patterns.ts";
import { suggestFitCoreCommandCorrection } from "./command-assist.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const agencyPlan = buildFitCoreAgencyPlan();
assert(agencyPlan.length <= FITCORE_AGENCY_MAX_ACTIVE, "capability_agency_budget_exceeded");

const privileged = evaluateFitCoreExecution({ risk: "privileged", approved: true });
assert(!privileged.allowed, "capability_privileged_execution_must_be_denied");
assert(privileged.policy.hostFilesystemAllowed === false, "capability_host_filesystem_must_be_denied");

const pendingWrite = evaluateFitCoreExecution({ risk: "workspace-write", workspaceId: "ws-1" });
assert(!pendingWrite.allowed && pendingWrite.requiresApproval, "capability_workspace_write_requires_approval");

const approvedWrite = evaluateFitCoreExecution({ risk: "workspace-write", workspaceId: "ws-1", approved: true });
assert(approvedWrite.allowed, "capability_approved_workspace_write_should_pass");

for (const pattern of fitcoreAutomationPatterns) {
  assert(!canAutoExecuteFitCorePattern(pattern), `capability_pattern_unexpected_autoexec:${pattern.id}`);
}

const upstreamFix = suggestFitCoreCommandCorrection(
  "git push",
  "fatal: no upstream branch\ngit push --set-upstream origin feat/capability-layer",
);
assert(upstreamFix.matchedRule === "git-missing-upstream", "capability_command_assist_git_rule");
assert(upstreamFix.suggestion === "git push --set-upstream origin feat/capability-layer", "capability_command_assist_git_suggestion");
assert(upstreamFix.autoExecute === false && upstreamFix.requiresApproval, "capability_command_assist_must_require_review");

const permission = suggestFitCoreCommandCorrection("npm run build", "Permission denied");
assert(permission.risk === "blocked" && permission.suggestion === null, "capability_permission_escalation_must_be_blocked");

const dangerous = suggestFitCoreCommandCorrection("git reset --hard HEAD~1", "failed");
assert(dangerous.risk === "blocked" && dangerous.autoExecute === false, "capability_destructive_command_must_be_blocked");

console.log("FITCORE OPEN-SOURCE CAPABILITY CHECK: PASS");
console.log("upstreams=6");
console.log("agency=curated<=7");
console.log("execution=workspace+approval+no-host-fs");
console.log("automation=concept-only+no-autoexec");
console.log("command-assist=suggest-only");
