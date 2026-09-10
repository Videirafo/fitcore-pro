import { existsSync, readFileSync } from "node:fs";

let failed = false;
const check = (condition, message) => {
  if (!condition) {
    failed = true;
    console.error(`ERRO: ${message}`);
  }
};
const read = (path) => readFileSync(path, "utf8");

for (const path of [
  "apps/site/components/FitCoreExactVisuals.tsx",
  "apps/site/components/FitCoreThemeToggle.tsx",
  "apps/site/app/exact-preview.css",
  "docs/49-MVP-43-PRODUCT-SCOPE-THEME-POLISH.md",
]) check(existsSync(path), `arquivo ausente: ${path}`);

const exact = read("apps/site/components/FitCoreExactVisuals.tsx");
const theme = read("apps/site/components/FitCoreThemeToggle.tsx");
const css = read("apps/site/app/exact-preview.css");
const doc = read("docs/49-MVP-43-PRODUCT-SCOPE-THEME-POLISH.md");

for (const token of ["educação física", "nutrição esportiva", "cross training", "Agenda e aulas", "Alunos e anamnese", "Treinos e nutrição", "Assistente IA para prescrição, evolução e retenção"]) check(exact.includes(token), `escopo profissional sem ${token}`);
for (const token of ["FitCoreThemeToggle", "fitcore-theme", "data-fc-theme", "light", "dark"]) check(theme.includes(token) || exact.includes(token) || css.includes(token), `tema sem ${token}`);
for (const bad of ["LGPDEm", "DadosTLS", "Infra Anexo", "Não se trata de uma questão"]) check(!exact.includes(bad) && !css.includes(bad), `texto quebrado presente: ${bad}`);
for (const token of ["Conformidade operacional", "Criptografia", "Ambiente seguro", "Sessão, logs e backups"]) check(exact.includes(token), `LGPD profissional sem ${token}`);
for (const token of ["fcx-theme-toggle", "data-fc-theme=\"light\"", "fcx-security-panel li strong"]) check(css.includes(token), `CSS MVP-43 sem ${token}`);
check(doc.includes("MVP-43") && doc.includes("contraste"), "documentação MVP-43 incompleta.");

if (failed) process.exit(1);
console.log("OK: MVP-43 escopo profissional, contraste e copy LGPD validados.");
