import { existsSync, readFileSync } from 'node:fs';

const fail=(message)=>{ console.error('[privacy-recovery] FAIL:',message); process.exitCode=1; };
const ok=(message)=>console.log('[privacy-recovery] OK:',message);
const policyPath='security/privacy-recovery-v1.1.json';

if (!existsSync(policyPath)) {
  fail('policy ausente: '+policyPath);
  process.exit();
}

const policy=JSON.parse(readFileSync(policyPath,'utf8'));
if (policy.version!==1) fail('versão de policy não suportada');
if (!policy.system) fail('system ausente');

const evidence=[...(policy.implementation_evidence || []),...(policy.verification_evidence || [])];
if (!evidence.length) fail('evidências ausentes');
for (const path of evidence) if (!existsSync(path)) fail('evidência ausente: '+path);

const kinds=[...(policy.dsar?.kinds || [])].sort();
const expected=['access','correction','deletion','portability'];
if (JSON.stringify(kinds)!==JSON.stringify([...expected].sort())) fail('DSAR kinds incompletos');
if (!Number.isInteger(policy.dsar?.max_open_days) || policy.dsar.max_open_days<1 || policy.dsar.max_open_days>90) fail('max_open_days inválido');

const datasets=policy.retention?.datasets;
if (!Array.isArray(datasets) || datasets.length<3) fail('retention datasets insuficientes');
for (const item of datasets || []) {
  if (!item?.name || !/^[a-z0-9_.-]+$/.test(item.name)) fail('dataset inválido');
  if (!Number.isInteger(item.days) || item.days<1 || item.days>3650) fail('retention days inválido: '+String(item?.name));
  if (!['delete','anonymize','retain_evidence'].includes(item.action)) fail('retention action inválida: '+String(item?.name));
}

const maxAge=policy.recovery?.max_evidence_age_hours;
if (!Number.isInteger(maxAge) || maxAge<1 || maxAge>744) fail('max_evidence_age_hours inválido');

if (process.env.TRUST_REQUIRE_RUNTIME_RECOVERY==='1') {
  const path=process.env.TRUST_RECOVERY_EVIDENCE;
  if (!path || !existsSync(path)) fail('runtime recovery evidence ausente');
  else {
    const evidenceJson=JSON.parse(readFileSync(path,'utf8'));
    if (evidenceJson.restore_status!=='pass') fail('restore_status não é pass');
    if (!/^[a-f0-9]{64}$/.test(String(evidenceJson.dump_sha256 || ''))) fail('dump_sha256 inválido');
    const at=Date.parse(String(evidenceJson.completed_at || ''));
    if (!Number.isFinite(at)) fail('completed_at inválido');
    else if ((Date.now()-at)>(maxAge*3600_000)) fail('restore evidence expirou');
    if (policy.recovery.external_copy_required && evidenceJson.external_copy_status!=='pass') fail('cópia externa criptografada ausente');
  }
}

if (!process.exitCode) ok(policy.system+' Privacy & Recovery v1.1 aprovado');
