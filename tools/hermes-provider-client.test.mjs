import test from "node:test";
import assert from "node:assert/strict";
import { createHermesProviderClient } from "../services/api/security/hermes-provider-client.mjs";
import { createAgentAssistantManager } from "../services/api/security/agent-assistant.mjs";

const baseEnv = {
  FITCORE_HERMES_GATEWAY_ENABLED: "true",
  FITCORE_HERMES_GATEWAY_URL: "https://marcaia.app/api/internal/hermes/provider",
  FITCORE_HERMES_GATEWAY_TOKEN: "x".repeat(64),
  FITCORE_HERMES_GATEWAY_TIMEOUT_MS: "45000",
};

test("#32 client envia somente contrato server-side do consumer fitcore", async () => {
  let request;
  const client = createHermesProviderClient(baseEnv, { fetchImpl: async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ ok: true, contract: "hermes-provider-gateway-v1", output: "Resposta Hermes", provider: "ollama-native-local", model: "qwen3:1.7b" }), { status: 200 });
  }});
  const result = await client.generate({ tenantKey: "tenant-demo", prompt: "Analise o treino" });
  assert.equal(result.ok, true);
  assert.equal(result.output, "Resposta Hermes");
  assert.equal(request.url, baseEnv.FITCORE_HERMES_GATEWAY_URL);
  assert.equal(request.options.headers.authorization, `Bearer ${baseEnv.FITCORE_HERMES_GATEWAY_TOKEN}`);
  assert.deepEqual(JSON.parse(request.options.body), { consumer: "fitcore", tenantKey: "tenant-demo", prompt: "Analise o treino" });
});

test("#32 client falha fechado em contrato inesperado", async () => {
  const client = createHermesProviderClient(baseEnv, { fetchImpl: async () =>
    new Response(JSON.stringify({ ok: true, contract: "other", output: "x" }), { status: 200 })
  });
  const result = await client.generate({ tenantKey: "tenant-demo", prompt: "teste" });
  assert.equal(result.ok, false);
  assert.equal(result.error, "gateway_contract_invalid");
});

test("#32 timeout do gateway não vaza exceção", async () => {
  const client = createHermesProviderClient(baseEnv, { fetchImpl: async () => {
    const error = new Error("aborted");
    error.name = "AbortError";
    throw error;
  }});
  const result = await client.generate({ tenantKey: "tenant-demo", prompt: "teste" });
  assert.equal(result.ok, false);
  assert.equal(result.error, "gateway_timeout");
});

test("#32 manager usa Hermes e preserva Evidence-First", async () => {
  const manager = createAgentAssistantManager(baseEnv, { fetchImpl: async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.match(body.prompt, /REGRA EVIDENCE-FIRST/);
    assert.match(body.prompt, /Papel autenticado: gestor/);
    assert.match(body.prompt, /Equipe: Ana \[papel=professor; status=ativo\]/);
    return new Response(JSON.stringify({ ok: true, contract: "hermes-provider-gateway-v1", output: "Orientação baseada somente nos dados.", provider: "ollama-native-local", model: "qwen3:1.7b" }), { status: 200 });
  }});
  const result = await manager.ask(
    { session_signed: true, tenant_id: "11111111-1111-4111-8111-111111111111", actor_role: "gestor" },
    { prompt: "O que devo priorizar?", module: "dashboard", operational_context: { facts: ["2 alunos com execução nesta semana"], team: [{ nome: "Ana", papel: "professor", status: "ativo" }] } },
  );
  assert.equal(result.ok, true);
  assert.equal(result.reply, "Orientação baseada somente nos dados.");
  assert.equal(result.provider.engine, "hermes");
  assert.equal(result.provider.fallback, false);
  assert.equal(result.safety.evidence_only, true);
  assert.equal(result.safety.human_review, true);
});

test("#32 manager mantém fallback local quando gateway está desligado", async () => {
  const manager = createAgentAssistantManager({ FITCORE_HERMES_GATEWAY_ENABLED: "false" });
  const result = await manager.ask(
    { session_signed: true, tenant_id: "11111111-1111-4111-8111-111111111111", actor_role: "gestor" },
    { prompt: "O que devo priorizar?", module: "dashboard", operational_context: { facts: ["Sem execuções hoje"] } },
  );
  assert.equal(result.ok, true);
  assert.equal(result.provider.engine, "local-evidence-fallback");
  assert.equal(result.provider.fallback, true);
  assert.match(result.reply, /dados atuais da unidade/i);
});
