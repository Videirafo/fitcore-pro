#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const paths = {
  primary: "apps/site/public/brand/fitcore-pro-official.svg",
  dark: "apps/site/public/brand/fitcore-pro-official-on-dark.svg",
  symbol: "apps/site/public/brand/fitcore-pro-symbol.svg",
  icon: "apps/site/app/icon.svg",
  component: "apps/site/components/FitCoreBrandSymbol.tsx",
  docs: "docs/brand/FITCORE_OFFICIAL_BRAND.md",
  agents: "AGENTS.md",
  mobileIcon: "apps/mobile/assets/branding/fitcore-app-icon.png",
  mobileForeground: "apps/mobile/assets/branding/fitcore-adaptive-foreground.png",
  mobileSplash: "apps/mobile/assets/branding/fitcore-splash.png",
};
for (const [name, file] of Object.entries(paths)) {
  if (!existsSync(file)) throw new Error(`Official brand asset missing: ${name} -> ${file}`);
}
const read = (file) => readFileSync(file, "utf8");
const sha = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const primary = read(paths.primary);
const symbol = read(paths.symbol);
const component = read(paths.component);
const docs = read(paths.docs);
const agents = read(paths.agents);

if (!primary.includes("TREINO | GESTÃO | RESULTADOS")) throw new Error("Primary lockup tagline changed.");
if (!primary.includes("#155EEF") || !primary.includes("#18C8FF")) throw new Error("Primary brand palette changed.");
if (!symbol.includes("#155EEF") || !symbol.includes("#18C8FF") || !symbol.includes("#071426")) throw new Error("Official symbol palette changed.");
if (!component.includes('/brand/fitcore-pro-symbol.svg')) throw new Error("UI is not using the canonical symbol asset.");
if (component.includes("fitcore-symbol-f") || component.includes("fitcore-symbol-ring")) throw new Error("Legacy generated FC symbol returned.");
if (!docs.includes("deve usar sempre esta identidade oficial")) throw new Error("Canonical brand rule missing from docs.");
if (!agents.includes("FitCore Pro brand invariant")) throw new Error("Agent brand invariant missing.");
if (sha(paths.icon) !== sha(paths.symbol)) throw new Error("Next favicon drifted from the official symbol.");

const expectedSymbolSha = "a68ac905734a5433a49db8508d792fdcef9df64ed62c58ae0f18e2d0c7875c89";
const expectedMobile = {
  mobileIcon: "85527f41a5b257e554544ed579931ba3dceb6992afa554378ce00a81e8463d3d",
  mobileForeground: "5e26553ae69944ba79f5eab875e3b7ea10f4561e437fb6fee766865fa5a2809e",
  mobileSplash: "b08af0563c8872ccf9a99084065d142cefd95f99b57dd56dc462de4b409a6869",
};
if (sha(paths.symbol) !== expectedSymbolSha) {
  throw new Error("Official FitCore Pro symbol changed without updating the approved brand gate.");
}
for (const [key, expected] of Object.entries(expectedMobile)) {
  if (sha(paths[key]) !== expected) throw new Error(`Official mobile brand asset drifted: ${key}`);
}

console.log("OK: official FitCore Pro brand invariant validated.");
