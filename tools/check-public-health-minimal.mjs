import { readFileSync } from "node:fs";

const source = readFileSync("services/api/server.mjs", "utf8");
const start = source.indexOf('if (url.pathname === "/api/health") {');
const end = source.indexOf('if (url.pathname === "/api/mvp-', start + 1);
if (start < 0 || end < 0) throw new Error("health_block_missing");
const health = source.slice(start, end);

const required = [
  'release_sha: process.env.FITCORE_RELEASE_SHA || null',
  'database: databaseReady ? "ok" : "error"',
  'auth: authReady ? "ok" : "error"',
  'ready ? 200 : 503',
  'sessionManager.signedMode',
  'credentialAuthManager.enabled',
  'authHardeningManager.enabled',
  '!authHardeningManager.demoLoginEnabled',
];
for (const token of required) {
  if (!health.includes(token)) throw new Error(`health_required_contract_missing:${token}`);
}

const forbidden = [
  "tenant_slug",
  "actor_role",
  "actor_name",
  "capabilities",
  "matrix:",
  "fitcore_execution_",
  "wgerInternalUrl",
  "catalogo_",
  "mvp_14",
  "mvp_15",
  "mvp_19",
  "mvp_20",
];
for (const token of forbidden) {
  if (health.includes(token)) throw new Error(`health_information_disclosure:${token}`);
}

const authz = source.indexOf("sessionManager.authorizeRoute(accessContext, url.pathname, req.method)");
if (authz < 0 || authz > start) throw new Error("authorization_must_run_before_health_dispatch");

console.log("FITCORE_PUBLIC_HEALTH_MINIMAL=PASS");
