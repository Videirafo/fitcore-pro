import { existsSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { execFileSync } from 'node:child_process';

const root=process.cwd();
const manifestPath='security/trust-gate.json';
const fail=(message)=>{ console.error('[trust-gate] FAIL:',message); process.exitCode=1; };
const warn=(message)=>console.warn('[trust-gate] WARN:',message);
const ok=(message)=>console.log('[trust-gate] OK:',message);

const REQUIRED_BY_SYSTEM={
  'marcaia-platform':['identity','tenant_boundary','rbac_capabilities','record_scope_rls','session_security','secrets','audit'],
  'pink-collection-perfumes':['identity','authorization','session_security','csrf_origin','secrets','webhook_integrity','regression_tests'],
  'videira-remote-mcp':['identity_oauth','privilege_separation','session_revocation','secrets','audit','bounded_execution','recovery_integrity'],
  'fitcore-pro':['identity','signed_session','auth_hardening','tenant_boundary','access_control','verification'],
};

if (!existsSync(manifestPath)) {
  fail('manifest ausente: '+manifestPath);
  process.exit();
}

const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
if (manifest.version !== 1) fail('versão do manifesto não suportada');

const expected=REQUIRED_BY_SYSTEM[manifest.system];
if (!expected) fail('sistema não reconhecido pelo Trust Gate: '+String(manifest.system || ''));
const blocking=manifest.blocking_controls;
if (!blocking || typeof blocking !== 'object' || Array.isArray(blocking)) fail('blocking_controls inválido');

const declared=Array.isArray(manifest.required_controls) ? [...manifest.required_controls].sort() : [];
const pinned=[...(expected || [])].sort();
if (JSON.stringify(declared)!==JSON.stringify(pinned)) {
  fail('required_controls diverge do contrato v1 fixo para '+String(manifest.system || ''));
}

for (const name of expected || []) {
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
  if (!(expected || []).includes(name)) fail(`controle bloqueante não previsto no contrato v1: ${name}`);
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

const roots=(manifest.scan_roots || []).map(v=>String(v).replace(/\/+$/,'')+'/');
const explicitFiles=new Set((manifest.scan_files || []).map(String));
const sourceExt=new Set([
  '.js','.mjs','.cjs','.ts','.tsx','.jsx','.sh','.ps1','.sql','.py','.dart',
  '.yml','.yaml','.conf','.ini','.toml','.html','.json','.service','.properties','.xml'
]);
const scannerFile='scripts/trust-gate.mjs';
const candidates=tracked.filter(file=>{
  if (file===scannerFile) return false;
  const inRuntime=roots.some(prefix=>file.startsWith(prefix)) || explicitFiles.has(file);
  return (inRuntime && sourceExt.has(extname(file))) || isTemplate(file);
});

const checks=[
  {name:'private_key',re:/-----BEGIN [^-\n]*PRIVATE KEY-----/},
  {name:'known_secret_token',re:/(?:sk_live_|ghp_|github_pat_|sb_secret_)[A-Za-z0-9_-]{24,}/},
  {name:'wildcard_cors',re:/access-control-allow-origin[\s\S]{0,240}(?:['"`]\s*\*\s*['"`]|:\s*\*)/i},
];

for (const file of candidates) {
  if (!existsSync(file)) continue;
  let source='';
  try { source=readFileSync(file,'utf8'); }
  catch { continue; }
  for (const check of checks) if (check.re.test(source)) fail(`${check.name} em ${file}`);
}

if (!candidates.length) fail('nenhuma superfície de runtime foi selecionada para varredura');
if (!process.exitCode) {
  ok(`${manifest.system} Trust Gate v1 aprovado (${expected.length} controles fixos; ${candidates.length} arquivos de runtime/templates)`);
}
