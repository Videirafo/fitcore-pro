import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHermesProviderClient } from "../services/api/security/hermes-provider-client.mjs";
import { createAgentAssistantManager } from "../services/api/security/agent-assistant.mjs";

const baseEnv = {
  FITCORE_HERMES_GATEWAY_ENABLED: "true",
  FITCORE_HERMES_GATEWAY_URL: "https://marcaia.app/api/internal/hermes/provider",
  FITCORE_HERMES_GATEWAY_TOKEN: "x".repeat(64),
  FITCORE_HERMES_GATEWAY_TIMEOUT_MS: "120000",
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
  assert.equal(result.gateway_route, "primary");
  assert.equal(client.status().timeout_ms, 120000);
  assert.equal(request.url, baseEnv.FITCORE_HERMES_GATEWAY_URL);
  assert.equal(request.options.headers.authorization, `Bearer ${baseEnv.FITCORE_HERMES_GATEWAY_TOKEN}`);
  assert.deepEqual(JSON.parse(request.options.body), { consumer: "fitcore", tenantKey: "tenant-demo", prompt: "Analise o treino" });
});

test("#32 client usa standby somente em falha de transporte do primary", async () => {
  const calls = [];
  const client = createHermesProviderClient({
    ...baseEnv,
    FITCORE_HERMES_GATEWAY_URLS: "http://127.0.0.1:3411/api/internal/hermes/provider,http://127.0.0.1:3413/api/internal/hermes/provider",
  }, { fetchImpl: async (url) => {
    calls.push(url);
    if (calls.length === 1) throw new TypeError("connect refused");
    return new Response(JSON.stringify({ ok: true, contract: "hermes-provider-gateway-v1", output: "Standby respondeu", provider: "ollama-native-local", model: "qwen3:1.7b" }), { status: 200 });
  }});
  const result = await client.generate({ tenantKey: "tenant-demo", prompt: "teste" });
  assert.equal(result.ok, true);
  assert.equal(result.gateway_route, "standby");
  assert.equal(calls.length, 2);
  assert.equal(client.status().failover_enabled, true);
  assert.equal(client.status().endpoint_count, 2);
});

test("#32 client não duplica provider timeout no standby", async () => {
  let calls = 0;
  const client = createHermesProviderClient({
    ...baseEnv,
    FITCORE_HERMES_GATEWAY_URLS: "http://127.0.0.1:3411/api/internal/hermes/provider,http://127.0.0.1:3413/api/internal/hermes/provider",
  }, { fetchImpl: async () => {
    calls += 1;
    return new Response(JSON.stringify({ ok: false, error: "provider_timeout" }), { status: 504 });
  }});
  const result = await client.generate({ tenantKey: "tenant-demo", prompt: "teste" });
  assert.equal(result.ok, false);
  assert.equal(result.error, "provider_timeout");
  assert.equal(calls, 1);
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

test("#32 wrapper deriva orçamento E2E e configura primary+standby sem expor segredos", async () => {
  const script = await readFile(new URL("../infra/scripts/fitcore-api-with-hermes.sh", import.meta.url), "utf8");
  assert.match(script, /PROVIDER_TIMEOUT_MS \* 2 \+ 15000/);
  assert.match(script, /GATEWAY_TIMEOUT_MS < 120000/);
  assert.match(script, /127\.0\.0\.1:3411\/api\/internal\/hermes\/provider/);
  assert.match(script, /127\.0\.0\.1:3413\/api\/internal\/hermes\/provider/);
  assert.match(script, /unset HERMES_GATEWAY_INTERNAL_TOKEN HERMES_TOKEN HERMES_PROVIDER_TIMEOUT_MS/);
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
