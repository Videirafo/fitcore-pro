import { existsSync, readFileSync } from "node:fs";
const files = [
  "apps/site/components/FitCoreRouteClient.tsx",
  "apps/site/components/FitCoreNavClient.tsx",
  "apps/site/components/FitCoreHeaderActionsClient.tsx",
  "apps/site/app/globals.css",
  "services/api/security/agent-assistant.mjs",
  "infra/sql/018-mvp-32-premium-agents-media.sql",
];
let failed = false;
function check(condition, message) { if (!condition) { failed = true; console.error(`ERRO: ${message}`); } }
for (const file of files) check(existsSync(file), `arquivo ausente: ${file}`);
const client = readFileSync("apps/site/components/FitCoreRouteClient.tsx", "utf8");
const nav = readFileSync("apps/site/components/FitCoreNavClient.tsx", "utf8");
const header = readFileSync("apps/site/components/FitCoreHeaderActionsClient.tsx", "utf8");
const css = readFileSync("apps/site/app/globals.css", "utf8");
const server = readFileSync("services/api/server.mjs", "utf8");
for (const token of ["AgentPanel", "ExerciseMediaGrid", "LibraryPanel", "SecurityPanel", "AuditPanel", "/api/mvp-32/agent", "/media/exercises/", "Sair da sessão"]) check(client.includes(token) || header.includes(token) || nav.includes(token), `token ausente no Next: ${token}`);
for (const route of ["/agents", "/biblioteca", "/seguranca", "/auditoria", "/configuracoes", "/agenda", "/relatorios", "/financeiro"]) check(nav.includes(route), `nav sem rota ${route}`);
for (const cls of ["premium-home", "student-workout-layout", "exercise-media-card", "agent-panel", "premium-side-nav"]) check(css.includes(cls), `CSS sem ${cls}`);
for (const endpoint of ["/api/mvp-32/status", "/api/mvp-32/agent", "createAgentAssistantManager"]) check(server.includes(endpoint), `API sem ${endpoint}`);
if (failed) process.exit(1);
console.log("OK: MVP-32 workspace premium, agents, GIFs e navegação completa validados por contrato.");
