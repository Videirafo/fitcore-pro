import { readFileSync } from "node:fs";
let failed = false;
function check(condition, message) { if (!condition) { failed = true; console.error(`ERRO: ${message}`); } }
function read(path) { return readFileSync(path, "utf8"); }
const client = read("apps/site/components/FitCoreRouteClient.tsx");
const nav = read("apps/site/components/FitCoreNavClient.tsx");
const css = read("apps/site/app/globals.css");
check(client.includes("publicHome") && client.includes("LandingPreviewCard"), "home pública ainda usa card de acesso necessário.");
check(client.includes("hero-actions-inline") && client.includes("Começar agora"), "home sem CTA profissional.");
check(nav.includes('/agents", label: "IA & Agents", roles: ["visitante"'), "visitante não vê IA & Agents no menu.");
check(nav.includes('/biblioteca", label: "Biblioteca", roles: ["visitante"'), "visitante não vê biblioteca no menu.");
check(nav.includes('/seguranca", label: "Segurança & LGPD", roles: ["visitante"'), "visitante não vê segurança no menu.");
for (const token of ["MVP-34", "landing-preview-card", "public-hero", "repeat(auto-fit, minmax(218px, 1fr))", "@media (max-width: 760px)"]) check(css.includes(token), `CSS de estabilização sem ${token}.`);
check(css.includes(".session-card.is-offline button { display: none; }"), "botão Atualizar ainda visível no card offline.");
if (failed) process.exit(1);
console.log("OK: MVP-34 layout web/mobile estabilizado por contrato.");
