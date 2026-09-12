import { existsSync, readFileSync } from "node:fs";
const files = [
  "apps/site/components/FitCoreRouteClient.tsx",
  "apps/site/components/FitCoreNavClient.tsx",
  "apps/site/components/FitCoreHeaderActionsClient.tsx",
  "apps/site/app/globals.css",
  "services/api/security/agent-assistant.mjs",
  "infra/scripts/fitcore-api-with-hermes.sh",
  "services/api/security/hermes-provider-client.mjs",
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
const assistant = readFileSync("services/api/security/agent-assistant.mjs", "utf8");
const gateway = readFileSync("services/api/security/hermes-provider-client.mjs", "utf8");
for (const token of ["AgentPanel", "ExerciseMediaGrid", "LibraryPanel", "SecurityPanel", "AuditPanel", "/api/mvp-32/agent", "/media/exercises/", "Sair da sessão"]) check(client.includes(token) || header.includes(token) || nav.includes(token), `token ausente no Next: ${token}`);
for (const route of ["/agents", "/biblioteca", "/seguranca", "/auditoria", "/configuracoes", "/agenda", "/relatorios", "/financeiro"]) check(nav.includes(route), `nav sem rota ${route}`);
for (const cls of ["premium-home", "student-workout-layout", "exercise-media-card", "agent-panel", "premium-side-nav"]) check(css.includes(cls), `CSS sem ${cls}`);
for (const endpoint of ["/api/mvp-32/status", "/api/mvp-32/agent", "createAgentAssistantManager"]) check(server.includes(endpoint), `API sem ${endpoint}`);
for (const token of ["consentimento_lgpd", "external_provider_allowed", "aiConsentForActor"]) check(server.includes(token), `API MVP-32 sem hardening LGPD: ${token}`);
const studentManagement = readFileSync("services/api/security/student-management.mjs", "utf8");
check(studentManagement.includes("input.consentimento_lgpd") && studentManagement.includes(", false)"), "MVP-32 deve exigir opt-in explícito para consentimento LGPD do aluno");
check(client.includes("consentimento_lgpd") && client.includes("não são enviados ao Hermes"), "UI de aluno sem consentimento explícito do processamento Hermes");
const runtimeWrapper = readFileSync("infra/scripts/fitcore-api-with-hermes.sh", "utf8");
for (const token of ["127.0.0.1:3411/api/internal/hermes/provider", "90000", "HERMES_GATEWAY_INTERNAL_TOKEN"]) check(runtimeWrapper.includes(token), `runtime Hermes sem ${token}`);
for (const token of ["lgpd_external_processing_denied", "latency_ms=", "error="]) check(assistant.includes(token), `Assistente sem auditoria/fallback seguro: ${token}`);
check(gateway.includes('gateway_endpoint_invalid') && gateway.includes('return { url: null'), "Gateway não falha fechado para URL explícita inválida");
if (failed) process.exit(1);
console.log("OK: MVP-32 workspace premium, agents, GIFs e navegação completa validados por contrato.");
