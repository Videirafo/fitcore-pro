// FITCORE PRO — #79 Execution Kernel V2 runtime.
// Server-only authority for admission, capability, settlement and replay.

import { execFileSync } from "node:child_process";
import {
  buildExecutionIdentity,
  hashExecutionBinding,
} from "../../../packages/execution-core/index.mjs";

export const WORKOUT_EXECUTION_ACTIONS = Object.freeze({
  START: "fitcore.workout.execution.start",
  EXERCISE_COMPLETE: "fitcore.workout.exercise.complete",
  FINISH: "fitcore.workout.execution.finish",
});

const ACTION_DEFINITIONS = Object.freeze({
  [WORKOUT_EXECUTION_ACTIONS.START]: Object.freeze({
    id: WORKOUT_EXECUTION_ACTIONS.START,
    version: 1,
    policy: "automatic",
    risk: "medium",
    sideEffect: "database",
  }),
  [WORKOUT_EXECUTION_ACTIONS.EXERCISE_COMPLETE]: Object.freeze({
    id: WORKOUT_EXECUTION_ACTIONS.EXERCISE_COMPLETE,
    version: 1,
    policy: "automatic",
    risk: "low",
    sideEffect: "database",
  }),
  [WORKOUT_EXECUTION_ACTIONS.FINISH]: Object.freeze({
    id: WORKOUT_EXECUTION_ACTIONS.FINISH,
    version: 1,
    policy: "automatic",
    risk: "medium",
    sideEffect: "database",
  }),
});

const capabilityBindings = new WeakMap();
const consumedCapabilities = new WeakSet();

function clean(value, fallback = "", max = 240) {
  const text = String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
  return text || fallback;
}
function sqlText(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}
function dbConnection(env = process.env) {
  const dbUrl = clean(env.FITCORE_DATABASE_URL || env.DATABASE_URL || "", "", 900);
  if (!dbUrl) throw new ExecutionKernelError("execution_database_required", 503);
  const parsed = new URL(dbUrl);
  return {
    args: [
      "-h", parsed.hostname,
      "-p", parsed.port || "5432",
      "-U", decodeURIComponent(parsed.username),
      "-d", decodeURIComponent(parsed.pathname.replace(/^\//, "")),
    ],
    env: {
      PGPASSWORD: decodeURIComponent(parsed.password || ""),
      PGCONNECT_TIMEOUT: "5",
      PGSSLMODE: parsed.searchParams.get("sslmode") || "disable",
    },
  };
}
function runSql(env, sql) {
  const connection = dbConnection(env);
  return execFileSync(clean(env.FITCORE_PSQL_BIN || "psql", "psql", 120), [
    ...connection.args,
    "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql,
  ], {
    encoding: "utf8",
    env: { ...process.env, ...connection.env },
    timeout: 25000,
    maxBuffer: 10 * 1024 * 1024,
  }).trim();
}
function scalar(env, sql) {
  return runSql(env, sql)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1) || "";
}
function jsonScalar(env, sql) {
  const value = scalar(env, sql);
  return value ? JSON.parse(value) : null;
}
function requireContext(context = {}) {
  if (!context?.session_signed || !context?.tenant_id || !context?.actor_id) {
    throw new ExecutionKernelError("execution_signed_context_required", 401);
  }
}
function definitionFor(actionId) {
  const definition = ACTION_DEFINITIONS[actionId];
  if (!definition) throw new ExecutionKernelError("execution_action_unknown", 404);
  return definition;
}
function validIdempotencyKey(value) {
  const key = clean(value, "", 200);
  return key.length >= 8 && key.length <= 160 ? key : null;
}
function dbFailure(error) {
  const errorText = String(error?.stderr || "") + "\n" + String(error?.message || "");
  const codes = [
    "execution_binding_conflict",
    "execution_attempt_binding_conflict",
    "execution_operation_binding_conflict",
    "execution_resource_conflict",
    "execution_state_conflict",
    "execution_transition_forbidden",
    "execution_transition_binding_invalid",
    "execution_transition_resource_required",
    "execution_actor_forbidden",
    "execution_actor_required",
    "execution_not_found",
    "execution_identity_invalid",
    "execution_action_invalid",
    "execution_source_invalid",
    "execution_transition_invalid",
    "execution_transition_metadata_invalid",
    "execution_tenant_context_mismatch",
    "execution_recovery_invalid",
    "execution_recovery_binding_invalid",
    "execution_recovery_not_stale",
    "execution_recovery_state_invalid",
  ];
  const code = codes.find((candidate) => errorText.includes(candidate));
  if (!code) return new ExecutionKernelError("execution_kernel_database_failed", 503);
  if (code === "execution_not_found") return new ExecutionKernelError(code, 404);
  if (code.includes("forbidden") || code === "execution_tenant_context_mismatch") return new ExecutionKernelError(code, 403);
  if (code.startsWith("execution_recovery_")) return new ExecutionKernelError(code, 409);
  if (code.includes("conflict") || code.includes("binding") || code === "execution_transition_resource_required") {
    return new ExecutionKernelError(code, 409);
  }
  return new ExecutionKernelError(code, 400);
}
function sqlContext(tenantId) {
  return `SELECT set_config('app.tenant_id', ${sqlText(tenantId)}, false);`;
}
function executionEnvelope(identity, admission, state, replayed) {
  return {
    product: "fitcore",
    submission_id: identity.submissionId,
    execution_id: identity.logicalExecutionId,
    attempt_id: identity.attemptId,
    operation_id: identity.operationId,
    trace_id: identity.traceId,
    state,
    replayed: Boolean(replayed),
    admission_run_id: admission.run_id,
  };
}

export class ExecutionKernelError extends Error {
  constructor(code, statusCode = 400) {
    super(code);
    this.name = "ExecutionKernelError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function resolveExecutionIdempotencyKey(req) {
  const supplied = req?.headers?.["idempotency-key"] || req?.headers?.["x-idempotency-key"] || "";
  if (!supplied) throw new ExecutionKernelError("missing_idempotency_key", 400);
  const key = validIdempotencyKey(supplied);
  if (!key) throw new ExecutionKernelError("invalid_idempotency_key", 400);
  return key;
}

export function createExecutionKernelRuntime(env = process.env) {
  const enabled = true;

  function admit(context, { actionId, source, idempotencyKey, binding }) {
    requireContext(context);
    const definition = definitionFor(actionId);
    const key = validIdempotencyKey(idempotencyKey);
    if (!key) throw new ExecutionKernelError("invalid_idempotency_key", 400);
    const identity = buildExecutionIdentity({
      tenantId: context.tenant_id,
      actionId,
      actionVersion: definition.version,
      source,
      idempotencyKey: key,
    });
    const bindingHash = hashExecutionBinding(binding);
    try {
      const admission = jsonScalar(env, `
        ${sqlContext(context.tenant_id)}
        SELECT row_to_json(x)::text
        FROM fitcore_execution_admit(
          ${sqlText(context.tenant_id)}::uuid,
          ${sqlText(context.actor_id)}::uuid,
          ${sqlText(identity.submissionId)},
          ${sqlText(identity.logicalExecutionId)},
          ${sqlText(identity.attemptId)},
          ${sqlText(identity.operationId)},
          ${sqlText(identity.traceId)},
          ${sqlText(actionId)},
          ${definition.version},
          ${sqlText(source)},
          ${sqlText(identity.idempotencyHash)},
          ${sqlText(bindingHash)}
        ) x;
      `);
      if (!admission) throw new ExecutionKernelError("execution_admission_failed", 503);
      return { definition, identity, bindingHash, admission };
    } catch (error) {
      if (error instanceof ExecutionKernelError) throw error;
      throw dbFailure(error);
    }
  }

  function transition(context, identity, toState, options = {}) {
    try {
      const resourceSql = options.resourceId ? `${sqlText(options.resourceId)}::uuid` : "NULL";
      const errorSql = options.errorCode ? sqlText(clean(options.errorCode, "execution_effect_failed", 120)) : "NULL";
      const result = jsonScalar(env, `
        ${sqlContext(context.tenant_id)}
        SELECT row_to_json(x)::text
        FROM fitcore_execution_transition(
          ${sqlText(context.tenant_id)}::uuid,
          ${sqlText(identity.logicalExecutionId)},
          ${sqlText(identity.attemptId)},
          ${sqlText(identity.operationId)},
          ${sqlText(toState)},
          ${errorSql},
          ${resourceSql},
          '{}'::jsonb
        ) x;
      `);
      if (!result) throw new ExecutionKernelError("execution_transition_failed", 503);
      return result;
    } catch (error) {
      if (error instanceof ExecutionKernelError) throw error;
      throw dbFailure(error);
    }
  }

  function recoverState(context, prepared, toState) {
    const staleMs = Math.min(Math.max(Number(env.FITCORE_EXECUTION_STALE_MS) || 30_000, 5_000), 300_000);
    const staleBefore = new Date(Date.now() - staleMs).toISOString();
    try {
      const result = jsonScalar(env, `
        ${sqlContext(context.tenant_id)}
        SELECT row_to_json(x)::text
        FROM fitcore_execution_recover(
          ${sqlText(context.tenant_id)}::uuid,
          ${sqlText(prepared.identity.logicalExecutionId)},
          ${sqlText(prepared.identity.attemptId)},
          ${sqlText(prepared.identity.operationId)},
          ${sqlText(toState)},
          ${sqlText(staleBefore)}::timestamptz
        ) x;
      `);
      if (!result) throw new ExecutionKernelError("execution_recovery_failed", 503);
      return result;
    } catch (error) {
      if (error instanceof ExecutionKernelError) throw error;
      throw dbFailure(error);
    }
  }

  function isStaleAdmission(admission) {
    const updatedAt = Date.parse(admission?.updated_at || "");
    if (!Number.isFinite(updatedAt)) return false;
    const staleMs = Math.min(Math.max(Number(env.FITCORE_EXECUTION_STALE_MS) || 30_000, 5_000), 300_000);
    return updatedAt <= Date.now() - staleMs;
  }

  function issueCapability(context, prepared, source = "ui", ttlMs = 30_000) {
    if (prepared.admission.run_state !== "admitted") {
      throw new ExecutionKernelError("execution_capability_requires_admission", 409);
    }
    const token = Object.freeze(Object.create(null));
    capabilityBindings.set(token, Object.freeze({
      tenantId: context.tenant_id,
      actorUserId: context.actor_id,
      actionId: prepared.definition.id,
      actionVersion: prepared.definition.version,
      source,
      bindingHash: prepared.bindingHash,
      executionId: prepared.identity.logicalExecutionId,
      attemptId: prepared.identity.attemptId,
      operationId: prepared.identity.operationId,
      expiresAt: Date.now() + Math.min(Math.max(Number(ttlMs) || 30_000, 1_000), 60_000),
    }));
    return token;
  }

  function authorizeEffect(capability, expected = {}) {
    if (!capability || typeof capability !== "object") {
      throw new ExecutionKernelError("execution_capability_invalid", 403);
    }
    if (consumedCapabilities.has(capability)) {
      throw new ExecutionKernelError("execution_capability_consumed", 409);
    }
    const binding = capabilityBindings.get(capability);
    if (!binding) throw new ExecutionKernelError("execution_capability_invalid", 403);
    if (binding.expiresAt <= Date.now()) {
      capabilityBindings.delete(capability);
      throw new ExecutionKernelError("execution_capability_expired", 409);
    }
    const definition = definitionFor(expected.actionId);
    const expectedHash = hashExecutionBinding(expected.binding);
    if (
      binding.tenantId !== expected.tenantId ||
      binding.actorUserId !== expected.actorUserId ||
      binding.actionId !== definition.id ||
      binding.actionVersion !== definition.version ||
      binding.bindingHash !== expectedHash
    ) {
      throw new ExecutionKernelError("execution_capability_binding_mismatch", 409);
    }
    consumedCapabilities.add(capability);
    return binding;
  }

  function dryRun(context, { actionId, source = "ui", binding, summary = "" }) {
    requireContext(context);
    const definition = definitionFor(actionId);
    hashExecutionBinding(binding);
    return {
      ok: true,
      dry_run: true,
      action_id: actionId,
      action_version: definition.version,
      source,
      policy: definition.policy,
      risk: definition.risk,
      side_effect: definition.sideEffect,
      mutationPerformed: false,
      summary: clean(summary, "Ação validada sem mutação.", 300),
    };
  }

  function execute(context, { actionId, source = "ui", idempotencyKey, binding, effect, replay, reconcile, resourceId }) {
    let prepared = admit(context, { actionId, source, idempotencyKey, binding });
    const currentState = prepared.admission.run_state;

    if (currentState === "succeeded") {
      if (!prepared.admission.resource_id) throw new ExecutionKernelError("execution_replay_resource_missing", 409);
      const replayed = replay(prepared.admission.resource_id);
      return {
        ...replayed,
        execution_kernel: executionEnvelope(prepared.identity, prepared.admission, "succeeded", true),
      };
    }
    if (["executing", "settlement_pending"].includes(currentState)) {
      if (!isStaleAdmission(prepared.admission)) {
        throw new ExecutionKernelError("execution_in_progress", 409);
      }
      const reconciled = typeof reconcile === "function"
        ? reconcile({ actionId, binding, executionId: prepared.identity.logicalExecutionId, state: currentState })
        : null;
      if (reconciled && !reconciled.guard) {
        const recoveredResourceId = resourceId(reconciled);
        if (!recoveredResourceId) throw new ExecutionKernelError("execution_recovery_resource_missing", 409);
        if (currentState === "executing") transition(context, prepared.identity, "settlement_pending");
        transition(context, prepared.identity, "succeeded", { resourceId: recoveredResourceId });
        return {
          ...reconciled,
          execution_kernel: {
            ...executionEnvelope(prepared.identity, prepared.admission, "succeeded", true),
            recovered: true,
          },
        };
      }
      if (currentState === "settlement_pending") {
        recoverState(context, prepared, "dead_letter");
        throw new ExecutionKernelError("execution_recovery_unresolved", 409);
      }
      recoverState(context, prepared, "admitted");
      prepared = {
        ...prepared,
        admission: { ...prepared.admission, run_state: "admitted", replayed: true },
      };
    }
    if (prepared.admission.run_state !== "admitted") throw new ExecutionKernelError("execution_state_conflict", 409);

    const started = transition(context, prepared.identity, "executing");
    if (started.replayed) throw new ExecutionKernelError("execution_in_progress", 409);
    const capability = issueCapability(context, prepared, source);

    let result;
    try {
      result = effect(capability);
      if (result?.guard) {
        transition(context, prepared.identity, "failed", {
          errorCode: clean(result.guard?.response?.erro || "execution_effect_rejected", "execution_effect_rejected", 120),
        });
        return {
          ...result,
          execution_kernel: executionEnvelope(prepared.identity, prepared.admission, "failed", false),
        };
      }
      const boundResourceId = resourceId(result);
      if (!boundResourceId) throw new ExecutionKernelError("execution_effect_resource_missing", 500);
      transition(context, prepared.identity, "settlement_pending");
      transition(context, prepared.identity, "succeeded", { resourceId: boundResourceId });
      return {
        ...result,
        execution_kernel: executionEnvelope(prepared.identity, prepared.admission, "succeeded", false),
      };
    } catch (error) {
      if (!result?.guard) {
        try {
          transition(context, prepared.identity, "failed", {
            errorCode: clean(error?.code || error?.message || "execution_effect_failed", "execution_effect_failed", 120)
              .toLowerCase()
              .replace(/[^a-z0-9_.:-]+/g, "_"),
          });
        } catch (settlementError) {
          console.error("[fitcore:execution:settlement-failed]", {
            executionId: prepared.identity.logicalExecutionId,
            error: settlementError instanceof Error ? settlementError.message : String(settlementError),
          });
        }
      }
      throw error;
    }
  }

  function observability(context) {
    requireContext(context);
    try {
      const raw = scalar(env, `
        ${sqlContext(context.tenant_id)}
        SELECT COALESCE(jsonb_agg(row_to_json(x)), '[]'::jsonb)::text
        FROM fitcore_execution_observability(${sqlText(context.tenant_id)}::uuid) x;
      `);
      return JSON.parse(raw || "[]");
    } catch (error) {
      throw dbFailure(error);
    }
  }

  function status() {
    return {
      enabled,
      contract: "fitcore-execution-kernel-v2",
      persistence: "postgresql",
      capability: "server-only-single-use",
      dry_run: true,
      settlement: true,
      observability: true,
      stale_recovery: true,
      actions: Object.values(ACTION_DEFINITIONS).map((item) => item.id),
    };
  }

  return { enabled, status, dryRun, execute, authorizeEffect, observability };
}
