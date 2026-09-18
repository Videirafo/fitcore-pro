import { createHash } from 'node:crypto';

export const FITCORE_EXECUTION_PRODUCT = 'fitcore';

function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
}

function digest(namespace, value) {
  return createHash('sha256')
    .update(`videira.execution.v1\0${namespace}\0${canonicalize(value)}`)
    .digest('hex');
}

function compactId(prefix, hash) {
  return `${prefix}_${hash.slice(0, 32)}`;
}

function requireText(value, code) {
  const normalized = String(value || '').trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

export function hashExecutionIdempotencyKey(idempotencyKey) {
  return digest('idempotency', requireText(idempotencyKey, 'execution_idempotency_key_required'));
}

export function buildExecutionIdentity({
  tenantId,
  actionId,
  actionVersion,
  source,
  idempotencyKey,
  occurrence = 0,
}) {
  const normalizedTenantId = requireText(tenantId, 'execution_tenant_required');
  const normalizedActionId = requireText(actionId, 'execution_action_required');
  const idempotencyHash = hashExecutionIdempotencyKey(idempotencyKey);
  const normalizedVersion = Math.max(1, Math.trunc(Number(actionVersion) || 1));
  const normalizedOccurrence = Math.max(0, Math.trunc(Number(occurrence) || 0));

  const submissionId = compactId('sub', digest('submission', {
    product: FITCORE_EXECUTION_PRODUCT,
    tenantId: normalizedTenantId,
    source,
    idempotencyHash,
  }));

  const logicalExecutionId = compactId('exe', digest('logical_execution', {
    product: FITCORE_EXECUTION_PRODUCT,
    tenantId: normalizedTenantId,
    submissionId,
    actionId: normalizedActionId,
    actionVersion: normalizedVersion,
  }));

  const attemptId = compactId('att', digest('attempt', {
    product: FITCORE_EXECUTION_PRODUCT,
    logicalExecutionId,
    occurrence: normalizedOccurrence,
  }));

  const operationId = compactId('op', digest('operation', {
    product: FITCORE_EXECUTION_PRODUCT,
    attemptId,
    actionId: normalizedActionId,
    actionVersion: normalizedVersion,
  }));

  return {
    submissionId,
    logicalExecutionId,
    attemptId,
    operationId,
    traceId: digest('trace', {
      product: FITCORE_EXECUTION_PRODUCT,
      tenantId: normalizedTenantId,
      logicalExecutionId,
    }).slice(0, 32),
    idempotencyHash,
  };
}

export const executionLifecycleStates = Object.freeze([
  'planned',
  'validated',
  'admitted',
  'queued',
  'executing',
  'settlement_pending',
  'succeeded',
  'rejected',
  'approval_required',
  'retry_wait',
  'failed',
  'dead_letter',
  'cancelled',
  'expired',
]);

const terminalStates = new Set([
  'succeeded', 'rejected', 'failed', 'dead_letter', 'cancelled', 'expired',
]);

const transitions = Object.freeze({
  planned: ['validated', 'rejected', 'cancelled', 'expired'],
  validated: ['admitted', 'approval_required', 'rejected', 'cancelled', 'expired'],
  approval_required: ['admitted', 'rejected', 'cancelled', 'expired'],
  admitted: ['queued', 'executing', 'rejected', 'cancelled', 'expired'],
  queued: ['executing', 'retry_wait', 'failed', 'dead_letter', 'cancelled', 'expired'],
  executing: ['settlement_pending', 'retry_wait', 'failed', 'dead_letter', 'cancelled'],
  settlement_pending: ['succeeded', 'retry_wait', 'failed', 'dead_letter'],
  retry_wait: ['queued', 'admitted', 'dead_letter', 'cancelled', 'expired'],
  succeeded: [],
  rejected: [],
  failed: [],
  dead_letter: [],
  cancelled: [],
  expired: [],
});

export function isExecutionTerminal(state) {
  return terminalStates.has(state);
}

export function canTransitionExecution(from, to) {
  return Array.isArray(transitions[from]) && transitions[from].includes(to);
}

export function assertExecutionTransition(from, to) {
  if (!canTransitionExecution(from, to)) {
    throw new Error(`execution_transition_forbidden:${from}->${to}`);
  }
}
