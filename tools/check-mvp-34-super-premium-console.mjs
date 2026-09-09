import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const required = [
  "apps/site/app/premium-console.css",
  "apps/site/components/FitCoreRouteClient.tsx",
  "apps/site/components/FitCoreNavClient.tsx",
  "apps/site/app/coach/page.tsx",
  "docs/44-MVP-34-SUPER-PREMIUM-CONSOLE.md",
];
let failed = false;
for (const file of required) if (!existsSync(resolve(root, file))) { console.error(`ERRO: MVP-34 ausente: ${file}`); failed = true; }
const layout = readFileSync(resolve(root, "apps/site/app/layout.tsx"), "utf8");
const client = readFileSync(resolve(root, "apps/site/components/FitCoreRouteClient.tsx"), "utf8");
const nav = readFileSync(resolve(root, "apps/site/components/FitCoreNavClient.tsx"), "utf8");
const css = readFileSync(resolve(root, "apps/site/app/premium-console.css"), "utf8");
for (const value of ["premium-console.css"]) if (!layout.includes(value)) { console.error(`ERRO: layout sem ${value}`); failed = true; }
for (const value of ["PublicEntry", "command-hero", "CoachSpotlight", 'mode === "coach"', "/api/mvp-33/brief", "ExerciseMotionVisual", "GlobalSearch"]) if (!client.includes(value)) { console.error(`ERRO: console sem ${value}`); failed = true; }
for (const value of ["/coach", "Inteligência", "IA & Agents", "Segurança & LGPD"]) if (!nav.includes(value)) { console.error(`ERRO: navegação sem ${value}`); failed = true; }
for (const value of [".public-hero", ".public-stage", ".command-orbit", ".motion-frame", "prefers-reduced-motion"]) if (!css.includes(value)) { console.error(`ERRO: CSS premium sem ${value}`); failed = true; }
for (const forbidden of ["/media/exercises/", "hasaneyldrm", "Retenção\" value=\"92%", "Esforço médio\" value=\"8/10"]) if (client.includes(forbidden)) { console.error(`ERRO: conteúdo proibido/fabricado na UI: ${forbidden}`); failed = true; }
for (const [file, target] of [["mvp-21", "/onboarding"], ["mvp-22", "/equipe"], ["mvp-23", "/alunos"], ["mvp-24", "/treinos"], ["mvp-25", "/execucao"], ["mvp-26", "/evolucao"]]) {
  const text = readFileSync(resolve(root, `apps/site/app/${file}/page.tsx`), "utf8");
  if (!text.includes("redirect") || !text.includes(target)) { console.error(`ERRO: ${file} não redireciona para ${target}`); failed = true; }
}
if (failed) process.exit(1);
console.log("OK: MVP-34 Super Premium Console validado por contrato.");
