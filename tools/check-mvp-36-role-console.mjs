import { readFileSync } from "node:fs";
let failed = false;
function check(condition, message) { if (!condition) { failed = true; console.error(`ERRO: ${message}`); } }
function read(path) { return readFileSync(path, "utf8"); }
const route = read("apps/site/components/FitCoreRouteClient.tsx");
const nav = read("apps/site/components/FitCoreNavClient.tsx");
const header = read("apps/site/components/FitCoreHeaderActionsClient.tsx");
const dashboard = read("apps/site/app/dashboard/page.tsx");
const css = read("apps/site/app/globals.css");
check(dashboard.includes('FitCoreRouteClient mode="home"'), "/dashboard não usa console operacional.");
check(route.includes('role-console-${role}') && route.includes('console-hero'), "dashboard por papel não foi criado.");
check(route.includes('Dono / Gestor') && route.includes('Professor') && route.includes('Aluno'), "console não possui blocos dos três papéis.");
check(route.includes('library-toolbar') && route.includes('filter-pill') && route.includes('setArea'), "biblioteca sem filtros funcionais.");
check(route.includes('ExecutionPanel') && route.includes('ExerciseMediaGrid limit={4}'), "treino do dia com GIFs não está preservado.");
check(route.includes('AgentPanel role={role}') && route.includes('IA para profissionais'), "IA contextual não está preservada.");
check(nav.includes('href: "/dashboard"') && nav.includes('roles: ["gestor", "professor", "aluno"]'), "menu interno não aponta Dashboard para usuários logados.");
check(header.includes('href="/dashboard"'), "header do gestor não aponta para dashboard.");
for (const token of ["MVP-36", "console-kpi-grid", "console-main-grid", "console-side-stack", "library-toolbar", "@media (max-width: 760px)"]) check(css.includes(token), `CSS sem ${token}.`);
if (failed) process.exit(1);
console.log("OK: MVP-36 console interno real por perfil validado por contrato.");
