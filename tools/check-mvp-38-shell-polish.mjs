#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
const files = {
  client: "apps/site/components/FitCoreRouteClient.tsx",
  css: "apps/site/app/globals.css",
  shell: "apps/site/components/FitCoreAppShell.tsx",
  layout: "apps/site/app/layout.tsx",
  icon: "apps/site/app/icon.svg",
};
for (const [name, path] of Object.entries(files)) {
  if (!existsSync(path)) throw new Error(`Arquivo ausente: ${name} -> ${path}`);
}
const client = readFileSync(files.client, "utf8");
const css = readFileSync(files.css, "utf8");
const shell = readFileSync(files.shell, "utf8");
const layout = readFileSync(files.layout, "utf8");
const icon = readFileSync(files.icon, "utf8");
for (const pattern of ["focusedEntry", "entry-route", "Console inteligente", "Dados da unidade"]) {
  if (!client.includes(pattern)) throw new Error(`Contrato visual ausente no client: ${pattern}`);
}
for (const pattern of ["MVP-38", "overflow: visible", "entry-route", "shell-arrow"]) {
  if (!css.includes(pattern)) throw new Error(`Contrato CSS ausente: ${pattern}`);
}
if (!shell.includes("shell-arrow")) throw new Error("Seta do shell ausente.");
if (!layout.includes("/icon.svg")) throw new Error("Favicon FC não registrado no metadata.");
if (!icon.includes("<svg") || !icon.includes("FitCore Pro") || !icon.includes("fitcoreBlue")) throw new Error("Ícone FitCore inválido.");
console.log("OK: MVP-38 shell visual, login, favicon e overflow validados.");
