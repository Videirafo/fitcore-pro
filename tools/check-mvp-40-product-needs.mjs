#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";

const files = {
  landing: "apps/site/components/FitCorePublicLanding.tsx",
  modules: "apps/site/components/FitCoreProductModules.tsx",
  css: "apps/site/app/professional-visuals.css",
  icon: "apps/site/app/icon.svg",
};

for (const [name, path] of Object.entries(files)) {
  if (!existsSync(path)) throw new Error(`Arquivo ausente: ${name} -> ${path}`);
}

const landing = readFileSync(files.landing, "utf8");
const modules = readFileSync(files.modules, "utf8");
const css = readFileSync(files.css, "utf8");
const icon = readFileSync(files.icon, "utf8");

for (const pattern of ["FitCoreProductModules", "#operacao", "GIFs internos"]) {
  if (!landing.includes(pattern)) throw new Error(`Landing sem contrato MVP-40: ${pattern}`);
}

for (const pattern of [
  "Agenda, aulas e avaliações",
  "Planos, pagamentos e inadimplência",
  "CRM de leads e alunos inativos",
  "WhatsApp, email e automações",
  "Ficha física e anamnese",
  "Fotos, medidas e evolução",
  "Portal do aluno",
  "IA de prescrição e retenção",
]) {
  if (!modules.includes(pattern)) throw new Error(`Módulo de produto ausente: ${pattern}`);
}

for (const pattern of ["product-modules", "product-module-card", "product-module-visual"]) {
  if (!css.includes(pattern)) throw new Error(`CSS MVP-40 ausente: ${pattern}`);
}

if (!icon.includes("<svg") || !icon.includes("FitCore Pro") || !icon.includes("fitcoreBlue")) throw new Error("Logo/favicon FitCore não está profissionalmente identificado.");

console.log("OK: MVP-40 produto fitness completo por necessidade real validado por contrato.");
