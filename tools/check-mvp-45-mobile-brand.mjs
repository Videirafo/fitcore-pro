import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const css = read('apps/site/app/mvp-45-mobile-brand.css');
const visuals = read('apps/site/components/FitCoreExactVisuals.tsx');
const symbol = read('apps/site/components/FitCoreBrandSymbol.tsx');
const toggle = read('apps/site/components/FitCoreThemeToggle.tsx');

const checks = [
  ['mobile breakpoint', css.includes('@media (max-width: 760px)')],
  ['desktop nav hidden on mobile', css.includes('.fcx-public-nav > nav { display: none !important; }')],
  ['header compact', css.includes('height: 68px !important')],
  ['mobile menu exists', visuals.includes('fcx-mobile-menu')],
  ['exact lockup wired', visuals.includes('FitCoreBrandLockup') && symbol.includes('/brand/fitcore-pro-official.png')],
  ['exact symbol wired', symbol.includes('/brand/fitcore-pro-symbol.png') && !symbol.includes('fitcore-symbol-ring')],
  ['official raster assets', exists('apps/site/public/brand/fitcore-pro-official.png') && exists('apps/site/public/brand/fitcore-pro-symbol.png')],
  ['discreet theme control', toggle.includes('fcx-theme-icon') && !toggle.includes('◐')],
  ['favicon official', exists('apps/site/app/icon.png')],
  ['hero mobile scale', css.includes('font-size: clamp(38px, 11.4vw, 48px)')],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
if (failed.length) process.exit(1);
