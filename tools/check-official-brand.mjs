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
  mobileSplash: "3798048a1bad7d45fbdcb3ccdda0c3fce7bbb2454888abc53bbfdca8c7f980dc",
};
for (const [key, expectedSha] of Object.entries(expected)) {
  if (sha(paths[key]) !== expectedSha) throw new Error(`Official FitCore artwork drifted: ${key}`);
}
const component = read(paths.component);
const exact = read(paths.exact);
const docs = read(paths.docs);
const agents = read(paths.agents);
const premiumCss = read(paths.premiumCss);
if (!component.includes('/brand/fitcore-pro-official.png') || !component.includes('/brand/fitcore-pro-symbol.png')) throw new Error("Canonical artwork is not wired into the brand component.");
if (!exact.includes('FitCoreBrandLockup') || exact.includes('fitcore-wordmark')) throw new Error("Public/dashboard brand is reconstructing the approved lockup instead of using it directly.");
if (component.includes('fitcore-symbol-ring') || component.includes('fitcore-symbol-f')) throw new Error("Legacy reconstructed symbol returned.");
if (!docs.includes(expected.primary) || !docs.includes('Não redesenhar')) throw new Error("Exact artwork rule/hash missing from brand docs.");
if (!agents.includes('do not redraw or reconstruct it')) throw new Error("Agent exact-artwork invariant missing.");
if (!premiumCss.includes(".fitcore-lockup") || !premiumCss.includes("background: transparent !important") || !premiumCss.includes("box-shadow: none !important")) throw new Error("Public brand must use the transparent canonical lockup without a white box.");
console.log("OK: exact owner-approved FitCore Pro artwork invariant validated.");
