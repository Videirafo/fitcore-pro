import assert from 'node:assert/strict';
import {
  FITCORE_EXECUTION_PRODUCT,
  assertExecutionTransition,
  buildExecutionIdentity,
  canTransitionExecution,
  isExecutionTerminal,
} from '../packages/execution-core/index.mjs';

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

console.log('FitCore execution kernel #74: OK');
