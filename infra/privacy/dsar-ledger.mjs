import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chmod, mkdir, open, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

export const DSAR_KINDS = Object.freeze(['access','correction','deletion','portability']);
export const DSAR_STATUSES = Object.freeze(['received','verified','processing','completed','rejected']);

const transitions = Object.freeze({
  received: new Set(['verified','rejected']),
  verified: new Set(['processing','rejected']),
  processing: new Set(['completed','rejected']),
  completed: new Set(),
  rejected: new Set(),
});

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key)=>[key,stable(value[key])]));
  }
  return value;
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function cleanRef(value,label,{required=true}={}) {
  const text=String(value ?? '').trim();
  if (!text && !required) return null;
  if (!text) throw new Error(label+'_required');
  if (/@/.test(text) || /\b\d{8,}\b/.test(text)) throw new Error(label+'_looks_like_pii');
  if (text.length>240 || !/^[A-Za-z0-9:_./-]+$/.test(text)) throw new Error(label+'_invalid');
  return text;
}

function cleanSubjectRef(value) {
  const text=String(value ?? '').trim();
  if (!text) throw new Error('subject_ref_required');
  const sha256=/^sha256:[0-9a-f]{64}$/;
  const opaque=/^opaque:(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[A-Za-z0-9_-]{22,128})$/;
  if (!sha256.test(text) && !opaque.test(text)) throw new Error('subject_ref_must_be_opaque_or_sha256');
  return text;
}

function validateStatus(value) {
  const status=String(value || '');
  if (!DSAR_STATUSES.includes(status)) throw new Error('invalid_status');
  return status;
}

function validateKind(value) {
  const kind=String(value || '');
  if (!DSAR_KINDS.includes(kind)) throw new Error('invalid_kind');
  return kind;
}

export async function readLedger(path) {
  let raw='';
  try { raw=await readFile(path,'utf8'); }
  catch (error) {
    if (error?.code==='ENOENT') return [];
    throw error;
  }
  const lines=raw.split('\n').filter(Boolean);
  const events=[];
  let previousHash='GENESIS';
  const latest=new Map();

  for (let index=0; index<lines.length; index+=1) {
    let event;
    try { event=JSON.parse(lines[index]); }
    catch { throw new Error('ledger_json_invalid_line_'+(index+1)); }

    const suppliedHash=String(event.hash || '');
    const body={...event};
    delete body.hash;
    if (body.prevHash!==previousHash) throw new Error('ledger_chain_invalid_line_'+(index+1));
    if (digest(body)!==suppliedHash) throw new Error('ledger_hash_invalid_line_'+(index+1));

    body.requestId=cleanRef(body.requestId,'request_id');
    body.tenantRef=cleanRef(body.tenantRef,'tenant_ref');
    body.subjectRef=cleanSubjectRef(body.subjectRef);
    body.actorRef=cleanRef(body.actorRef,'actor_ref');
    body.evidenceRef=cleanRef(body.evidenceRef,'evidence_ref',{required:false});
    body.kind=validateKind(body.kind);
    body.status=validateStatus(body.status);
    if (!/^\d{4}-\d{2}-\d{2}T/.test(String(body.at || ''))) throw new Error('invalid_timestamp_line_'+(index+1));

    const prior=latest.get(body.requestId);
    if (!prior) {
      if (body.status!=='received' || body.event!=='created') throw new Error('invalid_initial_state_line_'+(index+1));
    } else {
      if (prior.kind!==body.kind || prior.tenantRef!==body.tenantRef || prior.subjectRef!==body.subjectRef) {
        throw new Error('request_binding_changed_line_'+(index+1));
      }
      if (!transitions[prior.status]?.has(body.status)) throw new Error('invalid_transition_line_'+(index+1));
    }
    if (body.status==='completed' && !body.evidenceRef) throw new Error('completed_without_evidence_line_'+(index+1));

    latest.set(body.requestId,{...body,hash:suppliedHash});
    previousHash=suppliedHash;
    events.push({...body,hash:suppliedHash});
  }
  return events;
}

async function acquireKernelLock(lockPath) {
  const handle=await open(lockPath,'a',0o600);
  await handle.close();
  await chmod(lockPath,0o600);

  return new Promise((resolve,reject)=>{
    const child=spawn(
      'flock',
      ['-x','-w','10',lockPath,'-c','printf "LOCKED\\n"; cat >/dev/null'],
      {stdio:['pipe','pipe','pipe']}
    );
    let stdout='';
    let stderr='';
    let settled=false;

    const fail=(error)=>{
      if (settled) return;
      settled=true;
      reject(error);
    };

    child.once('error',(error)=>{
      fail(new Error(error?.code==='ENOENT' ? 'ledger_lock_unavailable' : 'ledger_lock_failed'));
    });
    child.stderr.on('data',(chunk)=>{ stderr+=chunk.toString(); });
    child.stdout.on('data',(chunk)=>{
      stdout+=chunk.toString();
      if (!settled && stdout.includes('LOCKED\n')) {
        settled=true;
        resolve(child);
      }
    });
    child.once('exit',(code,signal)=>{
      if (settled) return;
      if (code===1) fail(new Error('ledger_lock_timeout'));
      else fail(new Error('ledger_lock_failed_'+String(code ?? signal ?? (stderr.trim() || 'unknown'))));
    });
  });
}

async function releaseKernelLock(child) {
  if (!child || child.exitCode!==null) return;
  child.stdin.end();
  const timer=setTimeout(()=>child.kill('SIGKILL'),2000);
  timer.unref?.();
  try { await once(child,'exit'); }
  finally { clearTimeout(timer); }
}

async function withLedgerLock(path,operation) {
  await mkdir(dirname(path),{recursive:true,mode:0o700});
  const lockPath=path+'.lock';
  const child=await acquireKernelLock(lockPath);
  try {
    return await operation();
  } finally {
    await releaseKernelLock(child);
  }
}

async function appendUnlocked(path,body) {
  const events=await readLedger(path);
  const prevHash=events.at(-1)?.hash || 'GENESIS';
  const event={...body,prevHash};
  const record={...event,hash:digest(event)};
  const handle=await open(path,'a',0o600);
  try { await handle.writeFile(JSON.stringify(record)+'\n','utf8'); }
  finally { await handle.close(); }
  await chmod(path,0o600);
  await readLedger(path);
  return record;
}

export async function createRequest(path,input) {
  return withLedgerLock(path,async()=>{
    const kind=validateKind(input.kind);
    const now=input.at ? new Date(input.at) : new Date();
    if (Number.isNaN(now.valueOf())) throw new Error('invalid_timestamp');
    return appendUnlocked(path,{
      event:'created',
      at:now.toISOString(),
      requestId:'dsar_'+randomUUID().replaceAll('-',''),
      tenantRef:cleanRef(input.tenantRef,'tenant_ref'),
      subjectRef:cleanSubjectRef(input.subjectRef),
      actorRef:cleanRef(input.actorRef,'actor_ref'),
      kind,
      status:'received',
      evidenceRef:null,
    });
  });
}

export async function advanceRequest(path,input) {
  return withLedgerLock(path,async()=>{
    const events=await readLedger(path);
    const requestId=cleanRef(input.requestId,'request_id');
    const prior=[...events].reverse().find((event)=>event.requestId===requestId);
    if (!prior) throw new Error('request_not_found');
    const status=validateStatus(input.status);
    if (!transitions[prior.status]?.has(status)) throw new Error('invalid_transition');
    const evidenceRef=cleanRef(input.evidenceRef,'evidence_ref',{required:status!=='verified' && status!=='processing' ? status==='completed' : false});
    return appendUnlocked(path,{
      event:'transition',
      at:new Date(input.at || Date.now()).toISOString(),
      requestId,
      tenantRef:prior.tenantRef,
      subjectRef:prior.subjectRef,
      actorRef:cleanRef(input.actorRef,'actor_ref'),
      kind:prior.kind,
      status,
      evidenceRef,
    });
  });
}

function parseArgs(argv) {
  const [command,...rest]=argv;
  const options={command};
  for (let i=0;i<rest.length;i+=1) {
    const key=rest[i];
    if (!key.startsWith('--')) throw new Error('invalid_argument_'+key);
    const name=key.slice(2).replaceAll('-','_');
    const value=rest[++i];
    if (value===undefined) throw new Error('missing_value_'+name);
    options[name]=value;
  }
  return options;
}

async function main() {
  const args=parseArgs(process.argv.slice(2));
  const path=args.ledger || process.env.TRUST_DSAR_LEDGER_PATH;
  if (!path) throw new Error('ledger_path_required');

  if (args.command==='verify') {
    const events=await readLedger(path);
    console.log(JSON.stringify({ok:true,events:events.length,requests:new Set(events.map((e)=>e.requestId)).size}));
    return;
  }
  if (args.command==='create') {
    const event=await createRequest(path,{
      tenantRef:args.tenant_ref,
      subjectRef:args.subject_ref,
      actorRef:args.actor_ref,
      kind:args.kind,
    });
    console.log(JSON.stringify({ok:true,requestId:event.requestId,status:event.status}));
    return;
  }
  if (args.command==='advance') {
    const event=await advanceRequest(path,{
      requestId:args.request_id,
      actorRef:args.actor_ref,
      status:args.status,
      evidenceRef:args.evidence_ref,
    });
    console.log(JSON.stringify({ok:true,requestId:event.requestId,status:event.status}));
    return;
  }
  throw new Error('command_required_create_advance_verify');
}

const invoked=process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href;
if (invoked) main().catch((error)=>{ console.error('[dsar-ledger]',error.message); process.exitCode=1; });
