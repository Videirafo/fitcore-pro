import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createRequest, advanceRequest, readLedger } from '../infra/privacy/dsar-ledger.mjs';

test('DSAR ledger encadeia eventos, exige evidência no completed e rejeita PII crua', async () => {
  const dir=await mkdtemp(join(tmpdir(),'trust-dsar-'));
  const path=join(dir,'ledger.jsonl');

  await assert.rejects(
    createRequest(path,{tenantRef:'tenant:t1',subjectRef:'pessoa@example.com',actorRef:'actor:owner',kind:'access'}),
    /looks_like_pii/
  );

  const created=await createRequest(path,{tenantRef:'tenant:t1',subjectRef:'sha256:'+'a'.repeat(64),actorRef:'actor:owner',kind:'access'});
  await advanceRequest(path,{requestId:created.requestId,actorRef:'actor:owner',status:'verified'});
  await advanceRequest(path,{requestId:created.requestId,actorRef:'actor:owner',status:'processing'});
  await assert.rejects(
    advanceRequest(path,{requestId:created.requestId,actorRef:'actor:owner',status:'completed'}),
    /evidence_ref_required/
  );
  await advanceRequest(path,{requestId:created.requestId,actorRef:'actor:owner',status:'completed',evidenceRef:'evidence:export:sha256:abc'});

  const events=await readLedger(path);
  assert.equal(events.length,4);
  assert.equal(events.at(-1)?.status,'completed');

  const raw=await readFile(path,'utf8');
  const tampered=raw.replace('"status":"verified"','"status":"completed"');
  await writeFile(path,tampered,'utf8');
  await assert.rejects(readLedger(path),/ledger_hash_invalid/);
});
