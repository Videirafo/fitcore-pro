import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createRequest, advanceRequest, readLedger } from '../infra/privacy/dsar-ledger.mjs';

test('DSAR ledger encadeia eventos, exige evidência e aceita apenas subjectRef opaco/hash', async () => {
  const dir=await mkdtemp(join(tmpdir(),'trust-dsar-'));
  const path=join(dir,'ledger.jsonl');

  for (const subjectRef of ['pessoa@example.com','AliceSmith','+55 (22) 99999-0000']) {
    await assert.rejects(
      createRequest(path,{tenantRef:'tenant:t1',subjectRef,actorRef:'actor:owner',kind:'access'}),
      /subject_ref_must_be_opaque_or_sha256/
    );
  }

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

test('DSAR ledger serializa concorrência com flock antes de calcular prevHash', async () => {
  const dir=await mkdtemp(join(tmpdir(),'trust-dsar-concurrent-'));
  const path=join(dir,'ledger.jsonl');
  const count=20;

  await Promise.all(Array.from({length:count},(_,index)=>
    createRequest(path,{
      tenantRef:'tenant:t1',
      subjectRef:'sha256:'+index.toString(16).padStart(64,'0'),
      actorRef:'actor:owner',
      kind:index%2===0?'access':'portability',
    })
  ));

  const events=await readLedger(path);
  assert.equal(events.length,count);
  assert.equal(new Set(events.map((event)=>event.hash)).size,count);
  assert.equal(new Set(events.map((event)=>event.requestId)).size,count);
});

test('recovery gate vincula evidência ao FitCore, PostgreSQL 17.6, restore real e tempo plausível', async () => {
  const dir=await mkdtemp(join(tmpdir(),'fitcore-recovery-evidence-'));
  const evidencePath=join(dir,'evidence.json');
  const base={
    version:1,
    started_at:new Date().toISOString(),
    completed_at:new Date().toISOString(),
    restore_status:'pass',
    public_table_count:1,
    dump_sha256:'a'.repeat(64),
    external_copy_status:'not_configured',
  };
  const run=(payload)=>{
    writeFile(evidencePath,JSON.stringify(payload),'utf8');
  };

  await run({...base,system:'some-other-product',postgres_version:'17.6'});
  let result=spawnSync(process.execPath,['scripts/privacy-recovery-gate.mjs'],{
    cwd:process.cwd(),
    env:{...process.env,TRUST_REQUIRE_RUNTIME_RECOVERY:'1',TRUST_RECOVERY_EVIDENCE:evidencePath},
    encoding:'utf8',
  });
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/outro sistema/);

  await run({...base,system:'fitcore-pro',postgres_version:'1.0'});
  result=spawnSync(process.execPath,['scripts/privacy-recovery-gate.mjs'],{
    cwd:process.cwd(),
    env:{...process.env,TRUST_REQUIRE_RUNTIME_RECOVERY:'1',TRUST_RECOVERY_EVIDENCE:evidencePath},
    encoding:'utf8',
  });
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/postgres_version/);

  await run({...base,system:'fitcore-pro',postgres_version:'17.6',public_table_count:0});
  result=spawnSync(process.execPath,['scripts/privacy-recovery-gate.mjs'],{
    cwd:process.cwd(),
    env:{...process.env,TRUST_REQUIRE_RUNTIME_RECOVERY:'1',TRUST_RECOVERY_EVIDENCE:evidencePath},
    encoding:'utf8',
  });
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/public_table_count/);

  await run({...base,system:'fitcore-pro',postgres_version:'17.6',completed_at:'2099-01-01T00:00:00Z'});
  result=spawnSync(process.execPath,['scripts/privacy-recovery-gate.mjs'],{
    cwd:process.cwd(),
    env:{...process.env,TRUST_REQUIRE_RUNTIME_RECOVERY:'1',TRUST_RECOVERY_EVIDENCE:evidencePath},
    encoding:'utf8',
  });
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/futuro/);

  await run({...base,system:'fitcore-pro',postgres_version:'17.6'});
  result=spawnSync(process.execPath,['scripts/privacy-recovery-gate.mjs'],{
    cwd:process.cwd(),
    env:{...process.env,TRUST_REQUIRE_RUNTIME_RECOVERY:'1',TRUST_RECOVERY_EVIDENCE:evidencePath},
    encoding:'utf8',
  });
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/fitcore-pro Privacy & Recovery v1\.1 aprovado/);
});
