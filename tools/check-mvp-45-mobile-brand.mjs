import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const css = read('apps/site/app/mvp-45-mobile-brand.css');
const visuals = read('apps/site/components/FitCoreExactVisuals.tsx');
const symbol = read('apps/site/components/FitCoreBrandSymbol.tsx');
const toggle = read('apps/site/components/FitCoreThemeToggle.tsx');
const icon = read('apps/site/app/icon.svg');

const checks = [
  ['mobile breakpoint', css.includes('@media (max-width: 760px)')],
  ['desktop nav hidden on mobile', css.includes('.fcx-public-nav > nav { display: none !important; }')],
  ['header compact', css.includes('height: 68px !important')],
  ['mobile menu exists', visuals.includes('fcx-mobile-menu')],
  ['mesh identity', css.includes('#3df36d') && css.includes('#20d6a1') && css.includes('#6d5dfc') && !css.includes('#2563eb')],
  ['vector core symbol', symbol.includes('fitcore-symbol-ring') && symbol.includes('fitcore-symbol-f') && symbol.includes('fitcore-symbol-core')],
  ['discreet theme control', toggle.includes('fcx-theme-icon') && css.includes('rgba(255,255,255,.045)') && !toggle.includes('◐')],
  ['favicon brand match', icon.includes('fitcoreMesh') && icon.includes('#3DF36D') && icon.includes('#6D5DFC')],
  ['hero mobile scale', css.includes('font-size: clamp(38px, 11.4vw, 48px)')],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
if (failed.length) process.exit(1);
