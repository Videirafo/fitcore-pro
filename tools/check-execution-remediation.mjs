import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const [migration, rollback, runtime, server, agent, ui, deploy] = await Promise.all([
  read("infra/sql/026-execution-remediation.sql"),
  read("infra/sql/rollback-026-execution-remediation.sql"),
  read("services/api/security/execution-kernel-runtime.mjs"),
  read("services/api/server.mjs"),
  read("services/api/security/agent-assistant.mjs"),
  read("apps/site/components/FitCoreRouteClient.tsx"),
  read("infra/scripts/deploy-fitcore-by-sha.sh"),
]);

for (const token of [
  "fitcore_execution_remediations",
  "fitcore_execution_remediation_events",
  "fitcore_execution_remediation_preview",
  "fitcore_execution_prepare_remediation_retry",
  "fitcore_execution_remediation_dashboard",
  "ops_critical",
  "ops_retry",
  "avg_mttr_ms",
  "backoff_seconds",
  "retry_count",
  "max_attempts",
]) assert.match(migration, new RegExp(token));

assert.doesNotMatch(migration, /raw_payload|request_payload|response_payload/i);
assert.match(migration, /execution_remediation_binding_conflict/);
assert.match(migration, /execution_remediation_actor_mismatch/);
assert.match(migration, /retry_exhausted/);
assert.match(rollback, /DROP TABLE IF EXISTS fitcore_execution_remediations/);

assert.match(runtime, /remediation_policy: "bounded-retry-backoff-dead-letter"/);
assert.match(runtime, /remediation_authority: "execution-kernel"/);
assert.match(runtime, /remediation_payload_persistence: false/);
assert.match(runtime, /function retryRemediation/);
assert.match(runtime, /issueCapability\(context, prepared, "remediation"\)/);
assert.match(runtime, /exhausted \? "dead_letter" : "retry_wait"/);

assert.match(server, /\/api\/mvp-25\/remediation/);
assert.match(server, /runExecutionRemediation/);
assert.match(server, /payload_persisted: false/);
assert.match(server, /side_effect_authority: "execution-kernel"/);
assert.match(server, /execution_remediation: executionRemediation/);

assert.match(agent, /Execution Remediation é apenas contexto explicativo para Hermes/);
assert.match(agent, /remediation_mutation: false/);
assert.match(agent, /execution_remediation: operationalContext\.executionRemediation/);
assert.doesNotMatch(agent, /fitcore_execution_prepare_remediation_retry|fitcore_execution_remediation_action/);

assert.match(ui, /Execution Remediation/);
assert.match(ui, /Roteamento de remediation/);
assert.match(ui, /Fila de remediation/);
assert.match(deploy, /apply-execution-remediation\.sh/);

console.log("Execution Remediation #90 contract: OK");
