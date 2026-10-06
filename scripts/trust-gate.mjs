import { existsSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { execFileSync } from 'node:child_process';

const root=process.cwd();
const manifestPath='security/trust-gate.json';
const fail=(message)=>{ console.error('[trust-gate] FAIL:',message); process.exitCode=1; };
const warn=(message)=>console.warn('[trust-gate] WARN:',message);
const ok=(message)=>console.log('[trust-gate] OK:',message);

const CONTRACT={
  'marcaia-platform':{
    controls:['identity','tenant_boundary','rbac_capabilities','record_scope_rls','session_security','secrets','audit'],
    roots:['app','components','lib','ops','scripts','supabase','public'],
    files:['proxy.ts','middleware.ts','next.config.mjs','next.config.ts'],
  },
  'pink-collection-perfumes':{
    controls:['identity','authorization','session_security','csrf_origin','secrets','webhook_integrity','regression_tests'],
    roots:['app','components','lib','ops','scripts','supabase','public'],
    files:['middleware.ts','next.config.mjs','next.config.ts'],
  },
  'videira-remote-mcp':{
    controls:['identity_oauth','privilege_separation','session_revocation','secrets','audit','bounded_execution','recovery_integrity'],
    roots:['src','scripts','device-agent','public','ops'],
    files:['ops/videira-mcp-root'],
  },
  'fitcore-pro':{
    controls:['identity','signed_session','auth_hardening','tenant_boundary','access_control','verification'],
    roots:['apps','services','packages','infra','tools'],
    files:[],
  },
};

if (!existsSync(manifestPath)) {
  fail('manifest ausente: '+manifestPath);
  process.exit();
}
const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
if (manifest.version !== 1) fail('versão do manifesto não suportada');

const contract=CONTRACT[manifest.system];
if (!contract) fail('sistema não reconhecido pelo Trust Gate: '+String(manifest.system || ''));

const exactSet=(actual,expected,label)=>{
  const a=Array.isArray(actual) ? [...new Set(actual.map(String))].sort() : [];
  const e=[...expected].sort();
  if (JSON.stringify(a)!==JSON.stringify(e)) fail(`${label} diverge do contrato v1 fixo para ${manifest.system}`);
};

exactSet(manifest.required_controls,contract?.controls || [],'required_controls');
exactSet(manifest.scan_roots,contract?.roots || [],'scan_roots');
exactSet(manifest.scan_files,contract?.files || [],'scan_files');

const blocking=manifest.blocking_controls;
if (!blocking || typeof blocking !== 'object' || Array.isArray(blocking)) fail('blocking_controls inválido');

for (const name of contract?.controls || []) {
  const control=blocking?.[name];
  if (!control) {
    fail(`controle obrigatório ausente: ${name}`);
    continue;
  }
  if (control.status !== 'enforced') fail(`controle obrigatório ${name} não está enforced`);
  const evidence=Array.isArray(control.evidence) ? control.evidence : [];
  const verification=Array.isArray(control.verification_evidence) ? control.verification_evidence : [];
  if (!evidence.length) fail(`controle ${name} sem evidência de implementação`);
  if (!verification.length) fail(`controle ${name} sem evidência de verificação`);
  for (const path of [...evidence,...verification]) {
    if (!existsSync(path)) fail(`evidência ausente para ${name}: ${path}`);
  }
}
for (const [name,control] of Object.entries(blocking || {})) {
  if (!(contract?.controls || []).includes(name)) fail(`controle bloqueante não previsto no contrato v1: ${name}`);
  if (control.status !== 'enforced') fail(`controle bloqueante ${name} não está enforced`);
}
for (const [name,control] of Object.entries(manifest.advisory_controls || {})) {
  if (control.status !== 'enforced') warn(`${name}: ${control.status || 'unknown'}${control.note ? ' — '+control.note : ''}`);
}

let tracked=[];
try {
  tracked=execFileSync('git',['-c',`safe.directory=${root}`,'ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
} catch {
  fail('não foi possível obter git ls-files');
}

const isTemplate=(file)=>
  /(^|\/)\.env\.(?:example|sample|template)$/i.test(file) ||
  /\.(?:example|sample|template)(?:\.[^/]+)?$/i.test(file);
const sensitiveFilePatterns=[
  /(^|\/)\.env(?:$|\.)/i,
  /(^|\/)(id_rsa|id_ed25519)$/i,
  /\.(pem|p12|pfx|key)$/i,
  /(^|\/)(credentials|service-account)(?:\.[^/]+)?\.json$/i,
];
for (const file of tracked) {
  if (!isTemplate(file) && sensitiveFilePatterns.some(re=>re.test(file))) fail('arquivo sensível versionado: '+file);
}

for (const requiredRoot of contract?.roots || []) {
  const prefix=requiredRoot.replace(/\/+$/,'')+'/';
  if (!tracked.some(file=>file.startsWith(prefix))) fail('raiz de runtime sem arquivos rastreados: '+requiredRoot);
}
for (const requiredFile of contract?.files || []) {
  if (!tracked.includes(requiredFile)) fail('arquivo de runtime obrigatório ausente: '+requiredFile);
}

const roots=(contract?.roots || []).map(v=>v.replace(/\/+$/,'')+'/');
const explicitFiles=new Set(contract?.files || []);
const binaryExt=new Set([
  '.png','.jpg','.jpeg','.gif','.webp','.avif','.ico','.pdf',
  '.woff','.woff2','.ttf','.otf','.zip','.gz','.tgz','.7z',
  '.mp4','.mov','.webm','.mp3','.wav','.sqlite','.sqlite3','.db',
  '.wasm','.jar','.apk','.aab','.bin'
]);
const scannerFile='scripts/trust-gate.mjs';
const candidates=tracked.filter(file=>{
  if (file===scannerFile) return false;
  if (isTemplate(file) || explicitFiles.has(file)) return true;
  if (!roots.some(prefix=>file.startsWith(prefix))) return false;
  return !binaryExt.has(extname(file).toLowerCase());
});

const checks=[
  {name:'private_key',re:/-----BEGIN [^-\n]*PRIVATE KEY-----/},
  {name:'known_secret_token',re:/(?:ghp_|github_pat_|sb_secret_|sk_live_)[A-Za-z0-9_-]{24,}/},
  {name:'openai_secret',re:/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/},
  {name:'wildcard_cors',re:/access-control-allow-origin[\s\S]{0,240}(?:['"`]\s*\*\s*['"`]|:\s*\*|[ \t]+\*(?:[;\s]|$))/i},
];

for (const file of candidates) {
  if (!existsSync(file)) continue;
  let source='';
  try { source=readFileSync(file,'utf8'); }
  catch { continue; }
  if (source.includes('\u0000')) continue;
  for (const check of checks) if (check.re.test(source)) fail(`${check.name} em ${file}`);
}

if (!candidates.length) fail('nenhuma superfície de runtime foi selecionada para varredura');
if (!process.exitCode) {
  ok(`${manifest.system} Trust Gate v1 aprovado (${contract.controls.length} controles fixos; ${candidates.length} artefatos textuais de runtime/templates)`);
}
