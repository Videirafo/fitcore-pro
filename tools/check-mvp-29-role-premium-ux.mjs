import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const files = [
  "apps/site/components/FitCoreNavClient.tsx",
  "apps/site/components/FitCoreHeaderActionsClient.tsx",
  "apps/site/components/FitCoreAppShell.tsx",
  "apps/site/components/FitCoreRouteClient.tsx",
  "apps/site/app/globals.css",
];
let failed = false;
for (const file of files) {
  if (!existsSync(resolve(root, file))) {
    console.error(`ERRO: arquivo MVP-29 ausente: ${file}`);
    failed = true;
  }
}
const nav = readFileSync(resolve(root, "apps/site/components/FitCoreNavClient.tsx"), "utf8");
for (const expected of ["usePathname", "roles", "active", "visitante", "gestor", "professor", "aluno"]) {
  if (!nav.includes(expected)) {
    console.error(`ERRO: navegação por papel sem ${expected}.`);
    failed = true;
  }
}
const header = readFileSync(resolve(root, "apps/site/components/FitCoreHeaderActionsClient.tsx"), "utf8");
for (const expected of ["Treino do dia", "Treinos pendentes", "Dashboard", "Criar negócio"]) {
  if (!header.includes(expected)) {
    console.error(`ERRO: header por papel sem ${expected}.`);
    failed = true;
  }
}
const client = readFileSync(resolve(root, "apps/site/components/FitCoreRouteClient.tsx"), "utf8");
for (const expected of ["Dashboard executivo", "Painel do professor", "Painel do aluno", "PermissionPanel", "Treino do dia", "Ações permitidas", "role-dashboard-${role}"]) {
  if (!client.includes(expected)) {
    console.error(`ERRO: UX por papel sem ${expected}.`);
    failed = true;
  }
}
const css = readFileSync(resolve(root, "apps/site/app/globals.css"), "utf8");
for (const expected of [".side-card { display: none", ".sidebar-user", ".side-nav a.active", ".role-dashboard-gestor", ".role-dashboard-professor", ".role-dashboard-aluno", "@media (max-width: 860px)"]) {
  if (!css.includes(expected)) {
    console.error(`ERRO: CSS premium/mobile sem ${expected}.`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log("OK: MVP-29 UX premium por papel validada por contrato.");
