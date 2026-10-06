import { createHash, randomUUID } from 'node:crypto';
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
    const { hash, ...body }=event;
    if (body.prevHash!==previousHash) throw new Error('ledger_chain_invalid_line_'+(index+1));
    if (digest(body)!==suppliedHash) throw new Error('ledger_hash_invalid_line_'+(index+1));

    body.requestId=cleanRef(body.requestId,'request_id');
    body.tenantRef=cleanRef(body.tenantRef,'tenant_ref');
    body.subjectRef=cleanRef(body.subjectRef,'subject_ref');
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

async function append(path,body) {
  const events=await readLedger(path);
  const prevHash=events.at(-1)?.hash || 'GENESIS';
  const event={...body,prevHash};
  const record={...event,hash:digest(event)};
  await mkdir(dirname(path),{recursive:true,mode:0o700});
  const handle=await open(path,'a',0o600);
  try { await handle.writeFile(JSON.stringify(record)+'\n','utf8'); }
  finally { await handle.close(); }
  await chmod(path,0o600);
  await readLedger(path);
  return record;
}

export async function createRequest(path,input) {
  const kind=validateKind(input.kind);
  const now=input.at ? new Date(input.at) : new Date();
  if (Number.isNaN(now.valueOf())) throw new Error('invalid_timestamp');
  return append(path,{
    event:'created',
    at:now.toISOString(),
    requestId:'dsar_'+randomUUID().replaceAll('-',''),
    tenantRef:cleanRef(input.tenantRef,'tenant_ref'),
    subjectRef:cleanRef(input.subjectRef,'subject_ref'),
    actorRef:cleanRef(input.actorRef,'actor_ref'),
    kind,
    status:'received',
    evidenceRef:null,
  });
}

export async function advanceRequest(path,input) {
  const events=await readLedger(path);
  const requestId=cleanRef(input.requestId,'request_id');
  const prior=[...events].reverse().find((event)=>event.requestId===requestId);
  if (!prior) throw new Error('request_not_found');
  const status=validateStatus(input.status);
  if (!transitions[prior.status]?.has(status)) throw new Error('invalid_transition');
  const evidenceRef=cleanRef(input.evidenceRef,'evidence_ref',{required:status!=='verified' && status!=='processing' ? status==='completed' : false});
  return append(path,{
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
