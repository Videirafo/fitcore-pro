import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const required = [
  "apps/site/app/setup/page.tsx",
  "apps/site/app/convite/page.tsx",
  "apps/site/components/FitCoreRouteClient.tsx",
  "apps/site/components/FitCoreNavClient.tsx",
  "apps/site/app/globals.css",
  "services/api/security/guided-setup.mjs",
  "infra/sql/017-mvp-31-guided-setup.sql",
  "infra/scripts/apply-mvp-31-guided-setup.sh",
];
let failed = false;
for (const file of required) {
  if (!existsSync(resolve(root, file))) {
    console.error(`ERRO: arquivo MVP-31 ausente: ${file}`);
    failed = true;
  }
}
const client = readFileSync(resolve(root, "apps/site/components/FitCoreRouteClient.tsx"), "utf8");
for (const expected of ["setup", "SetupPanel", "/api/mvp-31/setup", "setup-progress", "setup-step", "router.push(\"/setup\")", "InvitePanel", "/api/mvp-22/invites/accept"]) {
  if (!client.includes(expected)) {
    console.error(`ERRO: UI guiada sem ${expected}.`);
    failed = true;
  }
}
const nav = readFileSync(resolve(root, "apps/site/components/FitCoreNavClient.tsx"), "utf8");
if (!nav.includes("/setup") || !nav.includes("Checklist")) {
  console.error("ERRO: navegação sem /setup guiado.");
  failed = true;
}
const server = readFileSync(resolve(root, "services/api/server.mjs"), "utf8");
for (const endpoint of ["/api/mvp-31/status", "/api/mvp-31/setup", "/api/mvp-31/setup/event", "createGuidedSetupManager"]) {
  if (!server.includes(endpoint)) {
    console.error(`ERRO: API MVP-31 sem ${endpoint}.`);
    failed = true;
  }
}
const manager = readFileSync(resolve(root, "services/api/security/guided-setup.mjs"), "utf8");
for (const expected of ["fitcore_tenant_setup_progress", "fitcore_tenant_setup_events", "professors_with_access", "completed_executions", "progress_percent"]) {
  if (!manager.includes(expected)) {
    console.error(`ERRO: manager MVP-31 sem ${expected}.`);
    failed = true;
  }
}
const css = readFileSync(resolve(root, "apps/site/app/globals.css"), "utf8");
for (const expected of [".setup-board", ".setup-progress", ".setup-step", ".setup-meter"]) {
  if (!css.includes(expected)) {
    console.error(`ERRO: CSS setup sem ${expected}.`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log("OK: MVP-31 setup guiado validado por contrato.");
