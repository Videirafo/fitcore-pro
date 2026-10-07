import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root=new URL("../",import.meta.url);
const read=(p)=>readFile(new URL(p,root),"utf8");
const [migration,policy,trust,deploy]=await Promise.all([
  read("infra/sql/030-privacy-audit-recovery.sql"),
  read("security/privacy-recovery-v1.1.json"),
  read("security/trust-gate.json"),
  read("infra/scripts/deploy-fitcore-by-sha.sh"),
]);

for(const token of [
  "fitcore_privacy_requests",
  "fitcore_privacy_events",
  "fitcore_retention_policies",
  "fitcore_privacy_events_append_only",
  "fitcore_audit_events_append_only",
  "fitcore_audit_delete_requires_retention_purge",
  "fitcore_audit_retention_purge",
  "security_audit_legal_hold",
  "privacy_tenant_context_mismatch",
  "privacy_gestor_required",
]) assert.ok(migration.includes(token),token);

assert.match(migration,/retention_days BETWEEN 7 AND 3650/);
assert.match(migration,/BEFORE UPDATE OR DELETE ON fitcore_audit_events/);
assert.match(migration,/current_setting\('app\.tenant_id',true\)/);
assert.match(migration,/dataset='security_audit'/);
assert.match(migration,/politica_lgpd/);
assert.doesNotMatch(migration,/email|telefone|documento|cpf|diagnostico/i);

const p=JSON.parse(policy);
assert.equal(p.system,"fitcore-pro");
assert.equal(p.recovery.postgres_version,"17.6");
assert.ok(p.implementation_evidence.includes("infra/sql/030-privacy-audit-recovery.sql"));

const t=JSON.parse(trust);
assert.equal(t.blocking_controls.privacy_recovery_contract.status,"enforced");
assert.match(deploy,/apply-privacy-audit-recovery\.sh/);

console.log("Privacy/Audit/Recovery v1.1 database contract: OK");
