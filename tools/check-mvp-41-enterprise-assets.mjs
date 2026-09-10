#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";

const files = {
  shots: "apps/site/components/FitCoreProductShots.tsx",
  visuals: "apps/site/components/FitCoreVisuals.tsx",
  modules: "apps/site/components/FitCoreProductModules.tsx",
  css: "apps/site/app/professional-visuals.css",
  icon: "apps/site/app/icon.svg",
};
for (const [name, path] of Object.entries(files)) {
  if (!existsSync(path)) throw new Error(`Arquivo ausente: ${name} -> ${path}`);
}
const shots = readFileSync(files.shots, "utf8");
const visuals = readFileSync(files.visuals, "utf8");
const modules = readFileSync(files.modules, "utf8");
const css = readFileSync(files.css, "utf8");
const icon = readFileSync(files.icon, "utf8");
for (const pattern of ["product-shot-business", "product-shot-team", "product-shot-students", "product-shot-workouts", "product-shot-execution", "product-shot-evolution", "/media/exercises/0026-barbell-bench-squat.gif"])
  if (!shots.includes(pattern)) throw new Error(`Product shot ausente: ${pattern}`);
if (!visuals.includes("ProductShot") || !visuals.includes("fitcore-brand-mark-premium")) throw new Error("FitCoreVisuals não usa product shots/brand premium.");
if (!modules.includes("ProductShot") || modules.includes("<svg")) throw new Error("Módulos ainda usam SVG genérico em vez de telas do produto.");
for (const pattern of ["MVP-41", "enterprise product shots", "fitcore-brand-mark-premium", "object-fit: contain", "enterprise-modules-grid"])
  if (!css.includes(pattern)) throw new Error(`CSS MVP-41 ausente: ${pattern}`);
if (!icon.includes("<svg") || !icon.includes("FitCore Pro") || !icon.includes("fitcoreMesh")) throw new Error("Ícone FitCore premium inválido.");
console.log("OK: MVP-41 assets reais, product shots e logo premium validados por contrato.");
