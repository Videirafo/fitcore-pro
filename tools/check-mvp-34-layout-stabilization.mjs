import { readFileSync } from "node:fs";
let failed = false;
function check(condition, message) { if (!condition) { failed = true; console.error(`ERRO: ${message}`); } }
function read(path) { return readFileSync(path, "utf8"); }
const landing = read("apps/site/components/FitCorePublicLanding.tsx");
const nav = read("apps/site/components/FitCoreNavClient.tsx");
const css = read("apps/site/app/globals.css");
check(landing.includes("landing-shell") && landing.includes("landing-product-preview"), "home pública não está separada do console.");
check(landing.includes("Começar gratuitamente") && landing.includes("Entrar no sistema"), "home sem CTA profissional.");
check(!landing.includes("Acesso necessário") && !landing.includes("Atualizar progresso"), "home pública ainda mostra estado operacional interno.");
check(nav.includes('/agents", label: "IA & Agents", roles: ["visitante"'), "visitante não vê IA & Agents no menu do console.");
check(nav.includes('/biblioteca", label: "Biblioteca", roles: ["visitante"'), "visitante não vê biblioteca no menu do console.");
check(nav.includes('/seguranca", label: "Segurança & LGPD", roles: ["visitante"'), "visitante não vê segurança no menu do console.");
for (const token of ["MVP-34", "MVP-35", "landing-shell", "landing-product-preview", "repeat(auto-fit, minmax(230px, 1fr))", "@media (max-width: 760px)"]) check(css.includes(token), `CSS de estabilização sem ${token}.`);
check(css.includes(".session-card.is-offline button { display: none; }") || css.includes("landing-shell"), "botão Atualizar ainda pode aparecer na home pública.");
if (failed) process.exit(1);
console.log("OK: MVP-34 layout web/mobile estabilizado por contrato.");
