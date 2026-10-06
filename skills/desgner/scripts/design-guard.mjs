#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const candidates = [
  process.env.DESIGN_GUARD_BASE,
  process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : null,
  process.env.GITHUB_BASE_REF || null,
  'origin/main',
  'main',
  'HEAD^'
].filter(Boolean);

function diffFrom(base) {
  try {
    return execFileSync('git', ['diff', '--unified=0', `${base}...HEAD`, '--'], { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] });
  } catch {
    try {
      return execFileSync('git', ['diff', '--unified=0', base, 'HEAD', '--'], { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] });
    } catch {
      return null;
    }
  }
}

let diff = null;
let usedBase = null;
for (const base of candidates) {
  diff = diffFrom(base);
  if (diff !== null) { usedBase = base; break; }
}

if (diff === null) {
  console.error('[DESGNER] FAIL — no Git base available for progressive visual diff guard.');
  process.exit(1);
}

let current = '';
const findings = [];
const ignored = (file) =>
  !file ||
  file === 'DESIGN.md' ||
  file.startsWith('docs/') ||
  file.startsWith('skills/desgner/') ||
  /(?:theme|tokens?|colors?|palette)/i.test(file) ||
  /globals\.css$/.test(file);

const rules = [
  ['arbitrary-tailwind-color', /\b(?:bg|text|border|ring|fill|stroke)-\[(?:#|rgb|rgba|hsl|hsla|oklch|color:)[^\]]+\]/, 'Use a semantic color token.'],
  ['arbitrary-tailwind-radius', /\brounded-\[[^\]]+\]/, 'Use an approved radius token/variant.'],
  ['arbitrary-tailwind-shadow', /\bshadow-\[[^\]]+\]/, 'Use an approved elevation token.'],
  ['inline-hex-style', /\b(?:color|backgroundColor|borderColor|outlineColor)\s*:\s*["']#[0-9a-fA-F]{3,8}\b/, 'Move the color into a semantic token.'],
  ['flutter-feature-color', /\bColor\s*\(\s*0x[0-9A-Fa-f]{8}\s*\)/, 'Define Flutter colors in a theme/design-token layer, not a feature widget.']
];

for (const line of diff.split('\n')) {
  if (line.startsWith('+++ b/')) { current = line.slice(6); continue; }
  if (!line.startsWith('+') || line.startsWith('+++') || ignored(current)) continue;
  const added = line.slice(1);
  for (const [id,re,message] of rules) {
    if (re.test(added)) findings.push({ id, file: current, sample: added.trim().slice(0,140), message });
  }
}

console.log(`[DESGNER] base=${usedBase}; new visual violations=${findings.length}`);
for (const f of findings) {
  console.log(`[ERROR] ${f.id} ${f.file}`);
  console.log(`  ${f.message}`);
  console.log(`  ${f.sample}`);
}

if (findings.length) process.exit(1);
console.log('[DESGNER] PASS — no new arbitrary visual values in guarded feature code.');
