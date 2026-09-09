import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const required = [
  "services/api/security/evidence-coach.mjs",
  "apps/site/app/coach/page.tsx",
  "apps/site/components/FitCoreRouteClient.tsx",
  "apps/site/components/FitCoreNavClient.tsx",
  "apps/site/lib/design-reference-sources.ts",
  "services/api/security/navigation-rbac.mjs",
  "tools/evidence-coach.test.mjs",
  "docs/42-MVP-33-EVIDENCE-FIRST-COACH.md",
  "docs/43-DESIGN-INTELLIGENCE-SOURCES.md",
];
let failed = false;
for (const file of required) if (!existsSync(resolve(root, file))) { console.error(`ERRO: ausente ${file}`); failed = true; }
const manager = readFileSync(resolve(root, "services/api/security/evidence-coach.mjs"), "utf8");
for (const value of ["buildStudentContextPack", "evaluateFeedbackQuality", "buildCoachRecommendations", "no_diagnosis", "professor_review_required_for_training_change"]) if (!manager.includes(value)) { console.error(`ERRO: manager sem ${value}`); failed = true; }
const server = readFileSync(resolve(root, "services/api/server.mjs"), "utf8");
for (const value of ["/api/mvp-33/brief", "/api/mvp-33/my-coach", "mvp33StudentCoachMatch", "createEvidenceCoachManager"]) if (!server.includes(value)) { console.error(`ERRO: API sem ${value}`); failed = true; }
const nav = readFileSync(resolve(root, "apps/site/components/FitCoreNavClient.tsx"), "utf8");
const client = readFileSync(resolve(root, "apps/site/components/FitCoreRouteClient.tsx"), "utf8");
if (!nav.includes('/coach') || !client.includes('CoachPanel') || !client.includes('/api/mvp-33/brief')) { console.error("ERRO: UI Coach incompleta"); failed = true; }
const refs = readFileSync(resolve(root, "apps/site/lib/design-reference-sources.ts"), "utf8");
for (const value of ["startora-vibecoding-pinterest", "uiverse", "21st-dev", "react-bits", "aceternity-ui", "license-review"]) if (!refs.includes(value)) { console.error(`ERRO: design registry sem ${value}`); failed = true; }
if (failed) process.exit(1);
console.log("OK: MVP-33 Evidence-First Coach + Design Intelligence validados por contrato.");
