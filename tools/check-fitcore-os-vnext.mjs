import { existsSync, readFileSync } from "node:fs";

let failed = false;
const verify = (condition, message) => { if (!condition) { failed = true; console.error(`ERRO: ${message}`); } };
const read = (path) => readFileSync(path, "utf8");

const files = [
  "apps/site/app/fitcore-vnext.css",
  "apps/site/app/layout.tsx",
  "apps/site/components/FitCoreNavClient.tsx",
  "apps/site/components/FitCoreExactVisuals.tsx",
  "apps/site/components/FitCoreRouteClient.tsx",
  "docs/87-FITCORE-OS-VNEXT.md",
];
for (const file of files) verify(existsSync(file), `arquivo ausente: ${file}`);

const css = read(files[0]);
const layout = read(files[1]);
const nav = read(files[2]);
const landing = read(files[3]);
const client = read(files[4]);
const doc = read(files[5]);

for (const token of ["--fc-surface", "fitcore-vnext-nav", "route-hero.internal-hero", "fitcore-context-bar", "@media (max-width: 860px)"])
  verify(css.includes(token), `Design System VNext sem ${token}`);

verify(layout.includes('import "./fitcore-vnext.css";'), "layout não carrega o VNext por último");
verify(layout.indexOf('fitcore-vnext.css') > layout.indexOf('fitcore-immersive-hero.css'), "VNext deve ser a camada visual final");

for (const token of ["lucide-react", "Principal", "Performance", "Negócio", "Sistema", "Treino de hoje", "Athlete 360", "Privacidade e LGPD"])
  verify(nav.includes(token), `navegação VNext sem ${token}`);

for (const token of ["Fitness OS", "sistema operacional", "App do aluno", "Coach / Personal", "Execution Kernel", "Business"])
  verify(landing.includes(token), `landing VNext sem ${token}`);

verify(client.includes('publicHome ? <LandingPreviewCard /> : null'), "chrome interno ainda usa card público");
verify(client.includes('"internal-hero"'), "rotas internas não usam hero compacto");
verify(client.includes("Hoje no FitCore"), "dashboard real não está orientado ao hoje");
verify(client.includes("Coach IA"), "dashboard real não expõe Coach IA simplificado");

for (const token of ["App do Aluno", "Coach / Personal", "AI Coach", "Fitness CRM", "Business", "Mobile parity"])
  verify(doc.includes(token), `documento #87 sem ${token}`);

if (failed) process.exit(1);
console.log("OK: FitCore OS VNext #87 foundation validada.");