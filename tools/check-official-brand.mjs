#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const paths = {
  primary: "apps/site/public/brand/fitcore-pro-official.png",
  symbol: "apps/site/public/brand/fitcore-pro-symbol.png",
  icon: "apps/site/app/icon.png",
  component: "apps/site/components/FitCoreBrandSymbol.tsx",
  exact: "apps/site/components/FitCoreExactVisuals.tsx",
  docs: "docs/brand/FITCORE_OFFICIAL_BRAND.md",
  agents: "AGENTS.md",
  mobileIcon: "apps/mobile/assets/branding/fitcore-app-icon.png",
  mobileForeground: "apps/mobile/assets/branding/fitcore-adaptive-foreground.png",
  mobileSplash: "apps/mobile/assets/branding/fitcore-splash.png",
  premiumCss: "apps/site/app/mvp-48-premium-product.css",
  mobileCss: "apps/site/app/mvp-45-mobile-brand.css",
  contrastCss: "apps/site/app/mvp-54-logo-contrast.css",
};
for (const [name, file] of Object.entries(paths)) if (!existsSync(file)) throw new Error(`Official brand asset missing: ${name} -> ${file}`);
const read = (file) => readFileSync(file, "utf8");
const sha = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const expected = {
  primary: "614a083538f1d0259f8c16eae7d3c91e12e36f8cf109f032b7a2cea47f3f3569",
  symbol: "f617907c9e289d10f1fa2b13749ea6a963baf01d5fb809bcac41b4db736eb3c9",
  icon: "3a365ad2040fb6dd8722cd88daf2f9aeb1e8cfba547f127c48a3523e1b4d0b5c",
  mobileIcon: "e753edb3de2641a4f8d951a083b20a6426d22e2a19343f4b5066fc6c46a17d3b",
  mobileForeground: "c170e9840565d3aa49bc8c008b378fa1ea5a327a4a8fbf66d06d48b2e706b8b6",
  mobileSplash: "e2f675481a409c7629e5fea2924b21a9e68e5bcd705b1c1c4fd509eac3b89000",
};
for (const [key, expectedSha] of Object.entries(expected)) {
  if (sha(paths[key]) !== expectedSha) throw new Error(`Official FitCore artwork drifted: ${key}`);
}
const component = read(paths.component);
const exact = read(paths.exact);
const docs = read(paths.docs);
const agents = read(paths.agents);
const premiumCss = read(paths.premiumCss);
const mobileCss = read(paths.mobileCss);
const contrastCss = read(paths.contrastCss);
if (!component.includes('/brand/fitcore-pro-official.png') || !component.includes('/brand/fitcore-pro-symbol.png')) throw new Error("Canonical artwork is not wired into the brand component.");
if (!exact.includes('FitCoreBrandLockup') || exact.includes('fitcore-wordmark')) throw new Error("Public/dashboard brand is reconstructing the approved lockup instead of using it directly.");
if (component.includes('fitcore-symbol-ring') || component.includes('fitcore-symbol-f')) throw new Error("Legacy reconstructed symbol returned.");
if (!docs.includes(expected.primary) || !docs.includes('Não redesenhar')) throw new Error("Exact artwork rule/hash missing from brand docs.");
if (!agents.includes('do not redraw or reconstruct it')) throw new Error("Agent exact-artwork invariant missing.");
if (!premiumCss.includes(".fitcore-lockup") || !premiumCss.includes("background: transparent !important") || !premiumCss.includes("box-shadow: none !important")) throw new Error("Public brand must use the transparent canonical lockup without a white box.");
const lockupRule = mobileCss.match(/\.fitcore-lockup\s*\{([^}]*)\}/)?.[1] ?? "";
if (!lockupRule.includes("background: transparent !important") || !lockupRule.includes("border: 0 !important") || !lockupRule.includes("box-shadow: none !important")) throw new Error("The .fitcore-lockup rule must remain transparent and free of border/shadow chrome.");
if (/background:(?!\s*transparent)|box-shadow:(?!\s*none)|filter:(?!\s*none)/.test(lockupRule)) throw new Error("The .fitcore-lockup rule reintroduced visual treatment around the canonical artwork.");
for (const selector of [".fcx-public-nav", ".fcx-footer", ".fcx-sidebar", ".app-shell .sidebar"]) if (!contrastCss.includes(selector)) throw new Error(`Brand contrast surface missing: ${selector}`);
if (contrastCss.includes("drop-shadow") || contrastCss.includes(".fcx-brand-official::before")) throw new Error("Brand contrast must come from the surrounding interface surface, not logo glow/shadow chrome.");
console.log("OK: exact owner-approved FitCore Pro artwork invariant validated.");
