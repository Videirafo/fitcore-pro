import assert from 'node:assert/strict';
import { createWorkoutSetSyncManager } from '../services/api/security/workout-set-sync.mjs';

const databaseUrl = process.env.FITCORE_MVP46_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('FITCORE_MVP46_TEST_DATABASE_URL ausente.');

const manager = createWorkoutSetSyncManager({
  ...process.env,
  FITCORE_DATABASE_URL: databaseUrl,
  FITCORE_WORKOUT_SET_SYNC_ENABLED: 'true',
});

const tenantA = '11111111-1111-4111-8111-111111111111';
const tenantB = '22222222-2222-4222-8222-222222222222';
const userA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const userB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const executionA = '33333333-3333-4333-8333-333333333333';

const contextA = {
  session_signed: true,
  tenant_id: tenantA,
  tenant_slug: 'tenant-a',
  actor_id: userA,
  actor_role: 'aluno',
};
const first = manager.upsertSet(contextA, executionA, 0, 0, {
  reps: 10,
  weight_kg: 40,
  rpe: 7,
  client_operation_id: 'mobile-op-1',
});
assert.equal(first.ok, true);
assert.equal(first.set.reps, 10);

const replay = manager.upsertSet(contextA, executionA, 0, 0, {
  reps: 12,
  weight_kg: 42.5,
  rpe: 8,
  client_operation_id: 'mobile-op-1',
});
assert.equal(replay.ok, true);
assert.equal(replay.set.reps, 12);

const listed = manager.listSets(contextA, executionA);
assert.equal(listed.ok, true);
assert.equal(listed.total, 1);
assert.equal(listed.sets[0].weight_kg, 42.5);
assert.equal(listed.sets[0].rpe, 8);
const wrongUser = manager.listSets({
  ...contextA,
  actor_id: userB,
}, executionA);
assert.equal(wrongUser.guard?.statusCode, 404);

const wrongTenant = manager.listSets({
  ...contextA,
  tenant_id: tenantB,
  tenant_slug: 'tenant-b',
  actor_id: userB,
}, executionA);
assert.equal(wrongTenant.guard?.statusCode, 404);

const professor = manager.upsertSet({
  ...contextA,
  actor_role: 'professor',
}, executionA, 0, 1, { reps: 8 });
assert.equal(professor.guard?.statusCode, 403);

console.log('MVP-46 set sync integration OK');
