import { readFileSync } from "node:fs";
let failed = false;
function check(condition, message) { if (!condition) { failed = true; console.error(`ERRO: ${message}`); } }
const page = readFileSync("apps/site/app/page.tsx", "utf8");
const landing = readFileSync("apps/site/components/FitCorePublicLanding.tsx", "utf8");
const shell = readFileSync("apps/site/components/FitCoreAppShell.tsx", "utf8");
const css = readFileSync("apps/site/app/globals.css", "utf8");
check(page.includes("FitCorePublicLanding") && !page.includes("FitCoreAppShell"), "/ deve usar landing pública, não console com sidebar.");
for (const token of ["landing-nav", "landing-hero", "landing-product-preview", "landing-feature-grid", "landing-exercises", "IA", "LGPD", "0024-barbell-bench-front-squat"]) check(landing.includes(token), `landing sem ${token}.`);
check(!landing.includes("Acesso necessário") && !landing.includes("Atualizar"), "landing pública ainda mostra card operacional de sessão.");
check(shell.includes("FitCoreNavClient"), "console autenticado perdeu sidebar real.");
for (const token of ["MVP-35", ".landing-shell", ".landing-nav", ".landing-exercise-list", "console overflow corrections"]) check(css.includes(token), `CSS MVP-35 sem ${token}.`);
if (failed) process.exit(1);
console.log("OK: MVP-35 landing pública e console operacional separados por contrato.");
