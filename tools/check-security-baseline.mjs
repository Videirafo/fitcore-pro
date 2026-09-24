import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const http = read("services/api/security/http-security.mjs");
const server = read("services/api/server.mjs");
const session = read("services/api/security/signed-session.mjs");
const credential = read("services/api/security/credential-auth.mjs");
const next = read("apps/site/next.config.mjs");

assert.match(http, /FITCORE_ALLOWED_ORIGINS/);
assert.match(http, /csrf_bloqueado/);
assert.match(http, /rate_limited/);
assert.match(http, /access-control-allow-credentials/);
assert.doesNotMatch(http, /access-control-allow-origin["']?\s*[:,]\s*["']\*/i);
assert.match(server, /httpSecurity\.guard/);
assert.match(server, /Não foi possível concluir a operação agora/);
assert.match(session, /revoked_at IS NULL/);
assert.match(session, /SET revoked_at = now\(\)/);
assert.match(credential, /FITCORE_RECOVERY_DEMO_RESPONSE/);
assert.match(credential, /fitcoreEnv !== "production"/);
assert.match(next, /Content-Security-Policy/);
assert.match(next, /Strict-Transport-Security/);
assert.match(next, /X-Content-Type-Options/);

for (const path of [
  "services/api/server.mjs",
  "services/api/security/http-security.mjs",
  "apps/site/next.config.mjs",
]) {
  assert.doesNotMatch(read(path), /Access-Control-Allow-Origin\s*[:=]\s*["']\*/i, path);
}

console.log("FitCore Security Baseline v1 OK");
