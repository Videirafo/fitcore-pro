import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const [ui, script] = await Promise.all([
  read("apps/site/components/FitCoreRouteClient.tsx"),
  read("infra/scripts/set-gestor-login-email.sh"),
]);

const loginStart = ui.indexOf("function LoginPanel");
const loginEnd = ui.indexOf("function InvitePanel", loginStart);
const login = ui.slice(loginStart, loginEnd);
assert.ok(loginStart >= 0 && loginEnd > loginStart);
assert.match(login, /E-mail ou identificador/);
assert.match(login, /Unidade \(opcional\)/);
assert.ok(login.indexOf("E-mail ou identificador") < login.indexOf("Unidade (opcional)"));
assert.match(login, /autoComplete="username"/);

assert.match(script, /storage\/backups\/auth/);
assert.match(script, /credential_hash_preserved=true/);
assert.match(script, /--rollback/);
assert.match(script, /CONFLICTS=/);
assert.match(script, /md5\(coalesce\(credential_hash/);
assert.doesNotMatch(script, /credential_hash\s*=/);
console.log("OK: MVP-16 login canônico, backup e preservação de credencial validados.");
