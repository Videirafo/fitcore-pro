import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const css = read('apps/site/app/mvp-45-mobile-brand.css');
const visuals = read('apps/site/components/FitCoreExactVisuals.tsx');
const symbol = read('apps/site/components/FitCoreBrandSymbol.tsx');
const toggle = read('apps/site/components/FitCoreThemeToggle.tsx');
const icon = read('apps/site/app/icon.svg');
const brand = read('apps/site/public/brand/fitcore-pro-symbol.svg');

const checks = [
  ['mobile breakpoint', css.includes('@media (max-width: 760px)')],
  ['desktop nav hidden on mobile', css.includes('.fcx-public-nav > nav { display: none !important; }')],
  ['header compact', css.includes('height: 68px !important')],
  ['mobile menu exists', visuals.includes('fcx-mobile-menu')],
  ['official brand palette', brand.includes('#155EEF') && brand.includes('#18C8FF') && brand.includes('#071426')],
  ['canonical symbol asset', symbol.includes('/brand/fitcore-pro-symbol.svg') && !symbol.includes('fitcore-symbol-ring') && !symbol.includes('fitcore-symbol-f')],
  ['discreet theme control', toggle.includes('fcx-theme-icon') && css.includes('rgba(255,255,255,.045)') && !toggle.includes('◐')],
  ['favicon brand match', icon.includes('Símbolo oficial FitCore Pro') && icon.includes('#155EEF') && icon.includes('#18C8FF')],
  ['hero mobile scale', css.includes('font-size: clamp(38px, 11.4vw, 48px)')],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
if (failed.length) process.exit(1);
