import { existsSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { execFileSync } from 'node:child_process';

const root=process.cwd();
const manifestPath='security/trust-gate.json';
const fail=(message)=>{ console.error('[trust-gate] FAIL:',message); process.exitCode=1; };
const warn=(message)=>console.warn('[trust-gate] WARN:',message);
const ok=(message)=>console.log('[trust-gate] OK:',message);

if (!existsSync(manifestPath)) {
  fail('manifest ausente: '+manifestPath);
  process.exit();
}

const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
if (manifest.version !== 1) fail('versão do manifesto não suportada');

const blocking=manifest.blocking_controls;
const required=manifest.required_controls;
if (!blocking || typeof blocking !== 'object' || Array.isArray(blocking)) fail('blocking_controls inválido');
if (!Array.isArray(required) || required.length < 5 || new Set(required).size !== required.length) {
  fail('required_controls deve declarar ao menos 5 controles únicos');
}

for (const name of required || []) {
  if (!Object.prototype.hasOwnProperty.call(blocking || {},name)) {
    fail(`controle obrigatório ausente do manifesto: ${name}`);
    continue;
  }
  if (blocking[name]?.status !== 'enforced') fail(`controle obrigatório ${name} não está enforced`);
}

for (const [name,control] of Object.entries(blocking || {})) {
  if (control.status !== 'enforced') {
    fail(`controle bloqueante ${name} não está enforced`);
    continue;
  }
  const evidence=Array.isArray(control.evidence) ? control.evidence : [];
  if (!evidence.length) fail(`controle ${name} sem evidência`);
  for (const path of evidence) if (!existsSync(path)) fail(`evidência ausente para ${name}: ${path}`);
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

const isTemplate=(file)=>/\.(?:example|sample|template)(?:\.[^/]+)?$/i.test(file);
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
const sourceExt=new Set(['.js','.mjs','.cjs','.ts','.tsx','.jsx','.sh','.sql','.py','.dart','.yml','.yaml']);
const candidates=tracked.filter(file=>
  sourceExt.has(extname(file)) &&
  (roots.some(prefix=>file.startsWith(prefix)) || explicitFiles.has(file))
);

const checks=[
  {name:'private_key',re:/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/},
  {name:'known_secret_token',re:/(?:sk_live_|ghp_|github_pat_|sb_secret_)[A-Za-z0-9_-]{24,}/},
  {name:'wildcard_cors',re:/access-control-allow-origin[^\n]{0,80}['"`]\*['"`]/i},
];

for (const file of candidates) {
  if (!existsSync(file)) continue;
  const source=readFileSync(file,'utf8');
  for (const check of checks) if (check.re.test(source)) fail(`${check.name} em ${file}`);
}

if (!candidates.length) fail('nenhuma superfície de runtime foi selecionada para varredura');
if (!process.exitCode) ok(`${manifest.system || 'system'} Trust Gate v1 aprovado (${Object.keys(blocking || {}).length} controles bloqueantes; ${candidates.length} arquivos de runtime)`);
