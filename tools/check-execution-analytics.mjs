import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildExecutionNextBestAction } from "../services/api/security/execution-next-best-action.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const [migration, rollback, server, runtime, agent, ui, deploy] = await Promise.all([
  read("infra/sql/024-execution-analytics-nba.sql"),
  read("infra/sql/rollback-024-execution-analytics-nba.sql"),
  read("services/api/server.mjs"),
  read("services/api/security/execution-kernel-runtime.mjs"),
  read("services/api/security/agent-assistant.mjs"),
  read("apps/site/components/FitCoreRouteClient.tsx"),
  read("infra/scripts/deploy-fitcore-by-sha.sh"),
]);

assert.match(migration, /fitcore_execution_analytics/);
assert.match(migration, /fitcore_execution_decisions/);
assert.match(migration, /fitcore_execution_validate_decision/);
assert.match(migration, /execution_dead_letter/);
assert.match(migration, /execution_retry_wait/);
assert.doesNotMatch(migration, /raw_payload|idempotency_key\s+(text|varchar)/i);
assert.match(rollback, /DROP TABLE IF EXISTS fitcore_execution_decisions/);
assert.match(server, /\/api\/mvp-25\/analytics/);
assert.match(server, /next-best-action/);
assert.match(server, /validateExecutionDecision/);
assert.match(server, /linkExecutionDecision/);
assert.match(runtime, /analytics: true/);
assert.match(runtime, /next_best_action: true/);
assert.match(agent, /capability_exposed: false/);
assert.match(agent, /Execution Analytics/);
assert.match(ui, /Next Best Action/);
assert.match(ui, /Execution Analytics/);
assert.match(ui, /const result = await api\(`\/api\/mvp-25\/analytics\?window_hours=168&v=\$\{Date\.now\(\)\}`\);/);
assert.match(ui, /const nba = await api\("\/api\/mvp-25\/analytics\/next-best-action"/);
assert.match(deploy, /apply-execution-analytics\.sh/);

const aluno = { tenant_id: "t1", actor_id: "a1", actor_role: "aluno" };
const start = buildExecutionNextBestAction({
  context: aluno,
  analytics: {},
  prescriptions: [{ id: "85333333-3333-4333-8333-333333333333", status: "aprovado" }],
  executions: [],
});
assert.equal(start.action_id, "fitcore.workout.execution.start");
assert.equal(start.governed, true);
assert.match(start.proposal_id, /^nba_[0-9a-f]{32}$/);
const sameCycle = buildExecutionNextBestAction({
  context: aluno,
  analytics: {},
  prescriptions: [{ id: "85333333-3333-4333-8333-333333333333", status: "aprovado" }],
  executions: [],
});
assert.equal(sameCycle.proposal_id, start.proposal_id);
const nextCycle = buildExecutionNextBestAction({
  context: aluno,
  analytics: {},
  prescriptions: [{ id: "85333333-3333-4333-8333-333333333333", status: "aprovado" }],
  executions: [{ id: "85999999-9999-4999-8999-999999999999", workout_id: "85333333-3333-4333-8333-333333333333", status: "concluido" }],
});
assert.notEqual(nextCycle.proposal_id, start.proposal_id);

const complete = buildExecutionNextBestAction({
  context: aluno,
  analytics: {},
  prescriptions: [],
  executions: [{ id: "85444444-4444-4444-8444-444444444444", status: "em_execucao", exercise_progress: [{ index: 0, status: "feito" }, { index: 1, status: "pendente" }] }],
});
assert.equal(complete.action_id, "fitcore.workout.exercise.complete");
assert.equal(complete.binding.index, 1);

const finish = buildExecutionNextBestAction({
  context: aluno,
  analytics: {},
  prescriptions: [],
  executions: [{ id: "85555555-5555-4555-8555-555555555555", status: "em_execucao", exercise_progress: [{ index: 0, status: "feito" }] }],
});
assert.equal(finish.action_id, "fitcore.workout.execution.finish");
assert.equal(finish.requires_input, true);

const staff = buildExecutionNextBestAction({
  context: { tenant_id: "t1", actor_id: "g1", actor_role: "gestor" },
  analytics: { alerts: [{ code: "execution_dead_letter", severity: "critical", count: 1 }] },
  prescriptions: [],
  executions: [],
});
assert.equal(staff.type, "operational_review");
assert.equal(staff.governed, false);

console.log("Execution Analytics + NBA #85: OK");
