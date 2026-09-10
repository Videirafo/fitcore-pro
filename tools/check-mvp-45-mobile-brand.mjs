import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const css = read('apps/site/app/mvp-45-mobile-brand.css');
const visuals = read('apps/site/components/FitCoreExactVisuals.tsx');
const icon = read('apps/site/app/icon.svg');

const checks = [
  ['mobile breakpoint', css.includes('@media (max-width: 760px)')],
  ['desktop nav hidden on mobile', css.includes('.fcx-public-nav > nav { display: none !important; }')],
  ['header compact', css.includes('height: 68px !important')],
  ['mobile menu exists', visuals.includes('fcx-mobile-menu')],
  ['blue identity', css.includes('#2563eb') && css.includes('#0ea5e9')],
  ['vector symbol', visuals.includes('FitCoreBrandSymbol')],
  ['favicon vector', icon.includes('fitcoreBlue') && icon.includes('#22D3EE')],
  ['hero mobile scale', css.includes('font-size: clamp(38px, 11.4vw, 48px)')],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
if (failed.length) process.exit(1);
