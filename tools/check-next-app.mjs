import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const required = [
  "apps/site/package.json",
  "apps/site/next.config.mjs",
  "apps/site/tsconfig.json",
  "apps/site/app/layout.tsx",
  "apps/site/app/page.tsx",
  "apps/site/app/login/page.tsx",
  "apps/site/app/cadastro/page.tsx",
  "apps/site/app/onboarding/page.tsx",
  "apps/site/app/setup/page.tsx",
  "apps/site/app/convite/page.tsx",
  "apps/site/app/equipe/page.tsx",
  "apps/site/app/alunos/page.tsx",
  "apps/site/app/treinos/page.tsx",
  "apps/site/app/execucao/page.tsx",
  "apps/site/app/evolucao/page.tsx",
  "apps/site/app/agents/page.tsx",
  "apps/site/app/biblioteca/page.tsx",
  "apps/site/app/seguranca/page.tsx",
  "apps/site/app/auditoria/page.tsx",
  "apps/site/app/configuracoes/page.tsx",
  "apps/site/app/agenda/page.tsx",
  "apps/site/app/relatorios/page.tsx",
  "apps/site/app/financeiro/page.tsx",
  "apps/site/app/globals.css",
  "apps/site/components/FitCoreAppShell.tsx",
  "apps/site/components/FitCoreRouteClient.tsx",
  "apps/site/components/FitCoreNavClient.tsx",
  "apps/site/components/FitCoreHeaderActionsClient.tsx",
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
const shell = readFileSync(resolve(root, "apps/site/components/FitCoreAppShell.tsx"), "utf8");
if (!shell.includes("FitCoreNavClient") || !shell.includes("FitCoreHeaderActionsClient")) {
  console.error("ERRO: shell Next sem navegação por papel.");
  failed = true;
}
const nav = readFileSync(resolve(root, "apps/site/components/FitCoreNavClient.tsx"), "utf8");
for (const route of ["/login", "/cadastro", "/setup", "/equipe", "/alunos", "/treinos", "/execucao", "/evolucao"]) {
  if (!nav.includes(route)) {
    console.error(`ERRO: navegação Next sem rota limpa ${route}.`);
    failed = true;
  }
}
const legacyOnboarding = readFileSync(resolve(root, "apps/site/app/onboarding/page.tsx"), "utf8");
if (!legacyOnboarding.includes('redirect("/cadastro")')) {
  console.error("ERRO: /onboarding deve redirecionar para /cadastro.");
  failed = true;
}
const client = readFileSync(resolve(root, "apps/site/components/FitCoreRouteClient.tsx"), "utf8");
for (const endpoint of ["/api/mvp-19/login", "/api/mvp-21/onboarding", "/api/mvp-22/users", "/api/mvp-23/students", "/api/mvp-24/prescriptions", "/api/mvp-25/executions", "/api/mvp-26/evolution", "/api/mvp-31/setup", "/api/mvp-22/invites/accept"]) {
  if (!client.includes(endpoint)) {
    console.error(`ERRO: client Next sem endpoint ${endpoint}.`);
    failed = true;
  }
}
const loginPanel = client.slice(client.indexOf("function LoginPanel"), client.indexOf("function OnboardingPanel"));
for (const term of ["E-mail ou identificador", "Unidade (opcional)", 'autoComplete="username"']) {
  if (!loginPanel.includes(term)) {
    console.error(`ERRO: login Next sem contrato de acesso por e-mail: ${term}.`);
    failed = true;
  }
}
if (loginPanel.includes("Slug da unidade")) {
  console.error("ERRO: login principal ainda expõe slug técnico ao usuário.");
  failed = true;
}
const emailIndex = loginPanel.indexOf("E-mail ou identificador");
const unitIndex = loginPanel.indexOf("Unidade (opcional)");
if (emailIndex < 0 || unitIndex < 0 || emailIndex > unitIndex) {
  console.error("ERRO: login deve priorizar e-mail antes da unidade opcional.");
  failed = true;
}
const seedAdmin = readFileSync(resolve(root, "infra/scripts/seed-mvp-20-admin-credential.sh"), "utf8");
if (seedAdmin.includes("true, 'gestor.fitcore', 'password'")) {
  console.error("ERRO: seed MVP-20 ainda hardcodeia o identificador do gestor no SQL.");
  failed = true;
}
if (failed) process.exit(1);
console.log("OK: contrato Next validado em apps/site com cadastro canônico e endpoints reais.");
