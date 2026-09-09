import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const required = [
  "apps/site/package.json",
  "apps/site/next.config.mjs",
  "apps/site/tsconfig.json",
  "apps/site/app/layout.tsx",
  "apps/site/app/page.tsx",
  "apps/site/app/mvp-22/page.tsx",
  "apps/site/app/globals.css",
  "apps/site/components/FitCoreShell.tsx",
  "apps/site/lib/fitcore-api.ts",
];

let failed = false;
for (const file of required) {
  if (!existsSync(resolve(root, file))) {
    console.error(`ERRO: Next asset ausente: ${file}`);
    failed = true;
  }
}
const pkg = JSON.parse(readFileSync(resolve(root, "apps/site/package.json"), "utf8"));
if (!pkg.dependencies?.next || !pkg.dependencies?.react || !pkg.dependencies?.["react-dom"]) {
  console.error("ERRO: apps/site/package.json sem Next/React.");
  failed = true;
}
const layout = readFileSync(resolve(root, "apps/site/app/layout.tsx"), "utf8");
if (!layout.includes('import "./globals.css"')) {
  console.error("ERRO: layout Next não importa globals.css.");
  failed = true;
}
const page = readFileSync(resolve(root, "apps/site/app/mvp-22/page.tsx"), "utf8");
if (!page.includes("/mvp-22.html") || !page.includes("Gestão real de usuários")) {
  console.error("ERRO: página Next MVP-22 não aponta para a tela operacional.");
  failed = true;
}
if (failed) process.exit(1);
console.log("OK: contrato Next validado em apps/site.");
