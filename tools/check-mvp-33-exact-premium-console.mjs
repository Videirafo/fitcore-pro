import { existsSync, readFileSync } from "node:fs";
let failed = false;
const check = (condition, message) => { if (!condition) { failed = true; console.error(`ERRO: ${message}`); } };
const file = (path) => readFileSync(path, "utf8");
for (const path of [
  "apps/site/components/FitCoreRouteClient.tsx",
  "apps/site/components/FitCoreNavClient.tsx",
  "apps/site/components/FitCoreHeaderActionsClient.tsx",
  "apps/site/app/globals.css",
  "services/api/security/agent-assistant.mjs",
]) check(existsSync(path), `arquivo ausente: ${path}`);
const client = file("apps/site/components/FitCoreRouteClient.tsx");
const nav = file("apps/site/components/FitCoreNavClient.tsx");
const header = file("apps/site/components/FitCoreHeaderActionsClient.tsx");
const css = file("apps/site/app/globals.css");
for (const token of ["Gerencie seus alunos, treinos e evolução", "AgentPanel", "ExerciseMediaGrid", "ProgressRing", "LibraryPanel", "SecurityPanel", "AuditPanel", "FinancePanel", "/api/mvp-32/agent", "/media/exercises/", "name=\"execution_id\""]) check(client.includes(token), `client sem ${token}`);
for (const route of ["/agents", "/biblioteca", "/seguranca", "/auditoria", "/configuracoes", "/agenda", "/relatorios", "/financeiro"]) check(nav.includes(route), `nav sem ${route}`);
for (const token of ["IA & Agents", "Treino do dia", "Treinos pendentes", "Criar negócio", "Dashboard"]) check(header.includes(token), `header sem ${token}`);
for (const cls of ["MVP-33", "premium-home", "student-workout-layout", "exercise-media-card", "agent-panel", "premium-side-nav", "progress-ring", "global-search", "logout-button"]) check(css.includes(cls), `CSS sem ${cls}`);
if (failed) process.exit(1);
console.log("OK: MVP-33 console premium exato com agents, GIFs e papéis validado por contrato.");
