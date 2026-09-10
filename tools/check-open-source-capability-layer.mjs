import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createOpenSourceCapabilityManager } from "../services/api/security/open-source-capabilities.mjs";
import { normalizeLoopbackBaseUrl } from "../services/api/security/loopback-service.mjs";
import { FITCORE_ALL_UPSTREAMS } from "../services/api/security/upstream-capabilities.mjs";

assert.equal(FITCORE_ALL_UPSTREAMS.length, 6, "capability registry deve conter seis upstreams auditados");
assert.equal(normalizeLoopbackBaseUrl("http://127.0.0.1:11235", ""), "http://127.0.0.1:11235");
assert.throws(() => normalizeLoopbackBaseUrl("https://example.com", ""), /loopback_service/);

const manager = createOpenSourceCapabilityManager({
  FITCORE_CRAWL4AI_ENABLED: "false",
  FITCORE_STIRLING_PDF_ENABLED: "false",
});
const status = manager.status({ actor_role: "gestor" });
assert.equal(status.services.crawl4ai.enabled, false);
assert.equal(status.services.stirlingPdf.enabled, false);
assert.equal(status.policy.privilegedAutoExecution, false);

const unsignedPreview = await manager.previewWebKnowledge({}, { url: "https://example.com" });
assert.equal(unsignedPreview.guard?.statusCode, 401, "preview exige sessão assinada");
const studentPreview = await manager.previewWebKnowledge({ session_signed: true, tenant_id: "tenant-test", actor_role: "aluno" }, { url: "https://example.com" });
assert.equal(studentPreview.guard?.statusCode, 403, "aluno não pode ingerir conhecimento externo");
const staffDisabledPreview = await manager.previewWebKnowledge({ session_signed: true, tenant_id: "tenant-test", actor_role: "gestor" }, { url: "https://example.com" });
assert.equal(staffDisabledPreview.guard?.statusCode, 503, "serviço desativado deve falhar fechado");

const server = readFileSync("services/api/server.mjs", "utf8");
const signed = readFileSync("services/api/security/signed-session.mjs", "utf8");
for (const token of ["/api/mvp-32/capabilities", "/api/mvp-32/knowledge/preview", "createOpenSourceCapabilityManager"]) {
  assert.ok(server.includes(token), `API sem ${token}`);
}
assert.ok(signed.includes('pathname.startsWith("/api/mvp-32")'), "MVP-32 precisa permanecer protegido por sessão");
