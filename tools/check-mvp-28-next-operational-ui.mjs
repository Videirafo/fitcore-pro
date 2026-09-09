import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const required = [
  "apps/site/app/login/page.tsx",
  "apps/site/app/onboarding/page.tsx",
  "apps/site/app/equipe/page.tsx",
  "apps/site/app/alunos/page.tsx",
  "apps/site/app/treinos/page.tsx",
  "apps/site/app/execucao/page.tsx",
  "apps/site/app/evolucao/page.tsx",
  "apps/site/components/FitCoreAppShell.tsx",
  "apps/site/components/FitCoreRouteClient.tsx",
  "apps/site/app/globals.css",
];
let failed = false;
for (const file of required) {
  if (!existsSync(resolve(root, file))) {
    console.error(`ERRO: arquivo obrigatório ausente: ${file}`);
    failed = true;
  }
}
const client = readFileSync(resolve(root, "apps/site/components/FitCoreRouteClient.tsx"), "utf8");
for (const term of [
  "RoleDashboard",
  "Toast",
  "operational-form",
  "LoadState",
  "/api/mvp-19/login",
  "/api/mvp-21/onboarding",
  "/api/mvp-22/users",
  "/api/mvp-23/students",
  "/api/mvp-24/prescriptions",
  "/api/mvp-25/executions",
  "/api/mvp-26/evolution",
  "markExerciseDone",
  "finishExecution",
  "loadStudentEvolution",
]) {
  if (!client.includes(term)) {
    console.error(`ERRO: componente operacional não contém ${term}.`);
    failed = true;
  }
}
const appFiles = ["page.tsx", "login/page.tsx", "onboarding/page.tsx", "equipe/page.tsx", "alunos/page.tsx", "treinos/page.tsx", "execucao/page.tsx", "evolucao/page.tsx"];
for (const rel of appFiles) {
  const text = readFileSync(resolve(root, "apps/site/app", rel), "utf8");
  if (text.includes(".html")) {
    console.error(`ERRO: rota limpa ainda referencia HTML legado: ${rel}`);
    failed = true;
  }
}
const css = readFileSync(resolve(root, "apps/site/app/globals.css"), "utf8");
for (const term of ["role-dashboard", "toast-success", "operational-form", "process-list", "@keyframes fc-enter"]) {
  if (!css.includes(term)) {
    console.error(`ERRO: CSS Next não contém ${term}.`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log("OK: MVP-28 UI operacional Next validada por contrato.");
