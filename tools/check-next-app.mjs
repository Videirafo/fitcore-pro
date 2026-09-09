import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const required = [
  "apps/site/package.json",
  "apps/site/next.config.mjs",
  "apps/site/postcss.config.mjs",
  "apps/site/tsconfig.json",
  "apps/site/app/layout.tsx",
  "apps/site/app/page.tsx",
  "apps/site/app/mvp-22/page.tsx",
  "apps/site/app/mvp-23/page.tsx",
  "apps/site/app/mvp-24/page.tsx",
  "apps/site/app/mvp-24/loading.tsx",
  "apps/site/app/mvp-25/page.tsx",
  "apps/site/app/globals.css",
  "apps/site/components/FitCoreShell.tsx",
  "apps/site/components/ui/Progress.tsx",
  "apps/site/components/ui/Skeleton.tsx",
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
if (!pkg.devDependencies?.tailwindcss || !pkg.devDependencies?.["@tailwindcss/postcss"]) {
  console.error("ERRO: fundação Tailwind do apps/site não está configurada.");
  failed = true;
}

const layout = readFileSync(resolve(root, "apps/site/app/layout.tsx"), "utf8");
if (!layout.includes('import "./globals.css"')) {
  console.error("ERRO: layout Next não importa globals.css.");
  failed = true;
}

const globals = readFileSync(resolve(root, "apps/site/app/globals.css"), "utf8");
if (!globals.includes('@import "tailwindcss"') || !globals.includes("--color-fitcore-green")) {
  console.error("ERRO: globals.css não preserva a fundação Tailwind/tokens do FitCore.");
  failed = true;
}

const page22 = readFileSync(resolve(root, "apps/site/app/mvp-22/page.tsx"), "utf8");
if (!page22.includes("/mvp-22.html") || !page22.includes("Gestão real de usuários")) {
  console.error("ERRO: página Next MVP-22 não aponta para a tela operacional.");
  failed = true;
}

const page23 = readFileSync(resolve(root, "apps/site/app/mvp-23/page.tsx"), "utf8");
if (!page23.includes("/mvp-23.html") || !page23.includes("Cadastro operacional de aluno")) {
  console.error("ERRO: página Next MVP-23 não aponta para a tela operacional.");
  failed = true;
}

const page24 = readFileSync(resolve(root, "apps/site/app/mvp-24/page.tsx"), "utf8");
if (!page24.includes("/mvp-24.html") || !page24.includes("Prescrição real de treino")) {
  console.error("ERRO: página Next MVP-24 não aponta para a tela operacional.");
  failed = true;
}
if (!page24.includes("components/ui/Progress") || !page24.includes("<Progress")) {
  console.error("ERRO: MVP-24 perdeu o primitive de progresso source-first.");
  failed = true;
}

const page25 = readFileSync(resolve(root, "apps/site/app/mvp-25/page.tsx"), "utf8");
if (!page25.includes("/mvp-25.html") || !page25.includes("Execução real do treino")) {
  console.error("ERRO: página Next MVP-25 não aponta para a tela operacional.");
  failed = true;
}

const progress = readFileSync(resolve(root, "apps/site/components/ui/Progress.tsx"), "utf8");
const skeleton = readFileSync(resolve(root, "apps/site/components/ui/Skeleton.tsx"), "utf8");
for (const source of [progress, skeleton]) {
  if (!source.includes("Lightswind's MIT") || /from ['\"]lightswind/.test(source)) {
    console.error("ERRO: primitive Lightswind deve permanecer source-owned e local.");
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("OK: contrato Next + Tailwind + Lightswind source-first validado em apps/site.");
