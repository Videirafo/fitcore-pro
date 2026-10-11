import assert from 'node:assert/strict';
import {
  FITCORE_EXECUTION_PRODUCT,
  assertExecutionTransition,
  buildExecutionIdentity,
  canTransitionExecution,
  hashExecutionBinding,
  isExecutionTerminal,
} from '../packages/execution-core/index.mjs';
import { createExecutionKernelRuntime, resolveExecutionIdempotencyKey } from '../services/api/security/execution-kernel-runtime.mjs';
import { createWorkoutExecutionManager, buildWorkoutActionBinding, WORKOUT_ACTION_IDS } from '../services/api/security/workout-execution.mjs';

const base = {
  tenantId: '11111111-1111-1111-1111-111111111111',
  actionId: 'fitcore.workout.assign',
  actionVersion: 1,
  source: 'hermes',
  idempotencyKey: 'fitcore-idem-12345678',
};

const first = buildExecutionIdentity(base);
const second = buildExecutionIdentity(base);
assert.deepEqual(first, second);
assert.equal(FITCORE_EXECUTION_PRODUCT, 'fitcore');
assert.match(first.submissionId, /^sub_[0-9a-f]{32}$/);
assert.match(first.logicalExecutionId, /^exe_[0-9a-f]{32}$/);
assert.match(first.attemptId, /^att_[0-9a-f]{32}$/);
assert.match(first.operationId, /^op_[0-9a-f]{32}$/);
assert.match(first.traceId, /^[0-9a-f]{32}$/);
assert.equal(JSON.stringify(first).includes(base.idempotencyKey), false);
const firstBinding = hashExecutionBinding({ workout_id: 'w1', index: 0 });
assert.match(firstBinding, /^[0-9a-f]{64}$/);
assert.equal(firstBinding, hashExecutionBinding({ index: 0, workout_id: 'w1' }));
assert.notEqual(firstBinding, hashExecutionBinding({ workout_id: 'w2', index: 0 }));
assert.throws(() => hashExecutionBinding(null), /execution_binding_required/);

assert.notEqual(
  buildExecutionIdentity({ ...base, tenantId: '22222222-2222-2222-2222-222222222222' }).submissionId,
  first.submissionId,
);
assert.notEqual(
  buildExecutionIdentity({ ...base, actionId: 'fitcore.subscription.cancel' }).logicalExecutionId,
  first.logicalExecutionId,
);
assert.notEqual(buildExecutionIdentity({ ...base, occurrence: 1 }).attemptId, first.attemptId);
assert.equal(
  buildExecutionIdentity({ ...base, source: ' hermes ' }).submissionId,
  first.submissionId,
);
assert.throws(
  () => buildExecutionIdentity({ ...base, source: '   ' }),
  /execution_source_required/,
);
for (const actionVersion of [0, -1, 1.5, 'abc', null, false, '', '1']) {
  assert.throws(
    () => buildExecutionIdentity({ ...base, actionVersion }),
    /execution_action_version_invalid/,
  );
}
for (const occurrence of [-1, 1.5, 'abc', null, false, '', '0']) {
  assert.throws(
    () => buildExecutionIdentity({ ...base, occurrence }),
    /execution_occurrence_invalid/,
  );
}

assert.equal(canTransitionExecution('planned', 'validated'), true);
assert.equal(canTransitionExecution('validated', 'approval_required'), true);
assert.equal(canTransitionExecution('executing', 'settlement_pending'), true);
assert.equal(canTransitionExecution('settlement_pending', 'succeeded'), true);
assert.equal(canTransitionExecution('succeeded', 'executing'), false);
assert.equal(isExecutionTerminal('dead_letter'), true);
assert.equal(isExecutionTerminal('retry_wait'), false);
assert.throws(
  () => assertExecutionTransition('succeeded', 'executing'),
  /execution_transition_forbidden:succeeded->executing/,
);

const signedAluno = {
  session_signed: true,
  tenant_id: '11111111-1111-4111-8111-111111111111',
  tenant_slug: 'execution-check',
  actor_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  actor_role: 'aluno',
};
const startBinding = buildWorkoutActionBinding(WORKOUT_ACTION_IDS.START, {
  input: { workout_id: '33333333-3333-4333-8333-333333333333' },
});
const runtime = createExecutionKernelRuntime({});
const dryRun = runtime.dryRun(signedAluno, {
  actionId: WORKOUT_ACTION_IDS.START,
  binding: startBinding,
  summary: 'Focused dry-run contract',
});
assert.equal(dryRun.dry_run, true);
assert.equal(dryRun.mutationPerformed, false);
assert.equal(dryRun.action_id, WORKOUT_ACTION_IDS.START);
assert.equal(runtime.status().capability, 'server-only-single-use');
assert.equal(runtime.status().stale_recovery, true);
assert.throws(
  () => resolveExecutionIdempotencyKey({ headers: {} }),
  /missing_idempotency_key/,
);
assert.equal(
  resolveExecutionIdempotencyKey({ headers: { 'idempotency-key': 'focused-operation-12345678' } }),
  'focused-operation-12345678',
);
assert.deepEqual(runtime.status().actions, Object.values(WORKOUT_ACTION_IDS));
assert.throws(
  () => runtime.dryRun(signedAluno, { actionId: 'fitcore.unknown', binding: {} }),
  /execution_action_unknown/,
);

const directManager = createWorkoutExecutionManager(
  { FITCORE_WORKOUT_EXECUTION_ENABLED: 'true' },
);
const directMutation = directManager.startExecution(
  signedAluno,
  { workout_id: startBinding.workout_id },
);
assert.equal(directMutation.guard?.allowed, false);
assert.equal(directMutation.guard?.statusCode, 503);
assert.equal(directMutation.guard?.response?.erro, 'execution_kernel_authority_unavailable');

console.log('FitCore execution kernel #79 focused contract: OK');
