import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  attachDecisionEvidence,
  outcomeForExecutionAction,
  rankDecisionEvidence,
  terminalDecisionState,
} from "../services/api/security/decision-intelligence.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const [migration, rollback, runtime, server, agent, ui, deploy] = await Promise.all([
  read("infra/sql/025-decision-intelligence.sql"),
  read("infra/sql/rollback-025-decision-intelligence.sql"),
  read("services/api/security/execution-kernel-runtime.mjs"),
  read("services/api/server.mjs"),
  read("services/api/security/agent-assistant.mjs"),
  read("apps/site/components/FitCoreRouteClient.tsx"),
  read("infra/scripts/deploy-fitcore-by-sha.sh"),
]);

for (const token of [
  "fitcore_execution_decision_events",
  "fitcore_decision_validate_accepted",
  "fitcore_decision_transition",
  "fitcore_decision_record_outcome",
  "fitcore_decision_intelligence",
  "outcome_count_desc",
  "accepted_at",
  "outcome_recorded_at",
]) assert.match(migration, new RegExp(token));
assert.doesNotMatch(migration, /raw_payload|medical_data|health_payload/i);
assert.match(rollback, /DROP TABLE IF EXISTS fitcore_execution_decision_events/);
assert.match(runtime, /decision_lifecycle: "proposal-accept-execution-settlement-outcome"/);
assert.match(runtime, /fitcore_decision_validate_accepted/);
assert.match(runtime, /fitcore_decision_record_outcome/);
assert.match(server, /decision-intelligence/);
assert.match(server, /accept\|reject/);
assert.match(server, /accept_required: true/);
assert.match(server, /executeDecisionBound/);
assert.match(server, /side_effect_authority: "execution-kernel"/);
assert.match(agent, /Decision Intelligence é apenas contexto explicativo para Hermes/);
assert.match(agent, /decision_mutation: false/);
assert.match(agent, /decision_intelligence: operationalContext\.decisionIntelligence/);
assert.doesNotMatch(agent, /fitcore_decision_transition|fitcore_decision_record_outcome/);
assert.match(ui, /Rejeitar recomendação/);
assert.match(ui, /Ranking transparente/);
assert.match(ui, /Decision Intelligence/);
assert.match(deploy, /apply-decision-intelligence\.sh/);

const ranked = rankDecisionEvidence([
  { reason_code: "b", action_id: "action.b", accepted_count: 9, settled_count: 4, outcome_count: 2, positive_outcome_count: 1 },
  { reason_code: "a", action_id: "action.a", accepted_count: 2, settled_count: 2, outcome_count: 3, positive_outcome_count: 3 },
  { reason_code: "c", action_id: "action.c", accepted_count: 12, settled_count: 8, outcome_count: 2, positive_outcome_count: 2 },
]);
assert.equal(ranked[0].reason_code, "a");
assert.equal(ranked[1].reason_code, "c");
assert.equal(ranked[2].reason_code, "b");
assert.deepEqual(ranked.map((item) => item.rank), [1, 2, 3]);
assert.equal(ranked[0].tier, "moderate");
const proposal = attachDecisionEvidence(
  { proposal_id: "nba_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", reason_code: "a", action_id: "action.a" },
  { evidence: ranked },
);
assert.equal(proposal.evidence.rank, 1);
assert.equal(proposal.evidence_policy.opaque_score, false);
assert.equal(proposal.evidence_policy.authority, "execution-kernel");

const success = outcomeForExecutionAction("fitcore.workout.execution.finish", true);
assert.deepEqual(success, {
  outcome_code: "workout_completed",
  metric_name: "completion",
  metric_value: 1,
  window_hours: 1,
});
const failed = outcomeForExecutionAction("fitcore.workout.execution.start", false);
assert.equal(failed.outcome_code, "action_failed");
assert.equal(failed.metric_value, 0);

assert.equal(terminalDecisionState("rejected"), true);
assert.equal(terminalDecisionState("outcome_recorded"), true);
assert.equal(terminalDecisionState("accepted"), false);

console.log("Decision Intelligence #89 contract: OK");
