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

for (const [name,control] of Object.entries(manifest.blocking_controls || {})) {
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
  tracked=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
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
const sourceExt=new Set(['.js','.mjs','.cjs','.ts','.tsx','.jsx','.sh','.sql','.py','.dart','.yml','.yaml']);
const candidates=tracked.filter(file=>roots.some(prefix=>file.startsWith(prefix)) && sourceExt.has(extname(file)));

const checks=[
  {name:'private_key',re:/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/},
  {name:'known_secret_token',re:/(?:sk_live_|ghp_|github_pat_|sb_secret_)[A-Za-z0-9_-]{16,}/},
  {name:'wildcard_cors',re:/access-control-allow-origin[^\n]{0,80}['"`]\*['"`]/i},
];

for (const file of candidates) {
  if (!existsSync(file)) continue;
  const source=readFileSync(file,'utf8');
  for (const check of checks) if (check.re.test(source)) fail(`${check.name} em ${file}`);
}

if (!process.exitCode) ok(`${manifest.system || 'system'} Trust Gate v1 aprovado (${Object.keys(manifest.blocking_controls || {}).length} controles bloqueantes)`);
