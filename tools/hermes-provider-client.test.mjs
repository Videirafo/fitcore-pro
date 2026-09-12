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


test("#32 URL explícita inválida falha fechado sem redirecionar tenant data", async () => {
  let called = false;
  const client = createHermesProviderClient({ ...baseEnv, FITCORE_HERMES_GATEWAY_URL: "ftp://example.invalid/hermes" }, { fetchImpl: async () => { called = true; throw new Error("should_not_call"); } });
  const result = await client.generate({ tenantKey: "tenant-demo", prompt: "teste" });
  assert.equal(result.ok, false);
  assert.equal(result.error, "gateway_endpoint_invalid");
  assert.equal(called, false);
  assert.equal(client.status().configured, false);
});

test("#32 contexto Hermes exclui aluno sem consentimento LGPD e dados vinculados", async () => {
  let gatewayPrompt = "";
  const manager = createAgentAssistantManager(baseEnv, { fetchImpl: async (_url, options) => {
    gatewayPrompt = JSON.parse(options.body).prompt;
    return new Response(JSON.stringify({ ok: true, contract: "hermes-provider-gateway-v1", output: "ok", provider: "ollama-native-local", model: "qwen3:1.7b" }), { status: 200 });
  }});
  const result = await manager.ask(
    { session_signed: true, tenant_id: "11111111-1111-4111-8111-111111111111", actor_role: "gestor" },
    { prompt: "Analise a unidade", operational_context: {
      team: [{ id: "u-ok", nome: "Professor", papel: "professor" }, { id: "u-no", nome: "Aluno Negado", papel: "aluno" }],
      students: [
        { id: "s-ok", user_id: "u-ok2", nome: "Aluno Consentido", objetivo: "força", consentimento_lgpd: true },
        { id: "s-no", user_id: "u-no", nome: "Aluno Negado", objetivo: "dado privado", consentimento_lgpd: false },
      ],
      prescriptions: [{ student_id: "s-ok", nome: "Treino A", aluno: "Aluno Consentido" }, { student_id: "s-no", nome: "Treino Privado", aluno: "Aluno Negado" }],
      executions: [{ student_id: "s-no", aluno: "Aluno Negado", status: "concluido" }],
      evolution: [{ student_id: "s-no", aluno: "Aluno Negado", progresso: 99 }],
    } },
  );
  assert.equal(result.provider.engine, "hermes");
  assert.match(gatewayPrompt, /Aluno Consentido/);
  assert.doesNotMatch(gatewayPrompt, /Aluno Negado|dado privado|Treino Privado/);
});

test("#32 consentimento negado pula Hermes e usa fallback local", async () => {
  let called = false;
  const manager = createAgentAssistantManager(baseEnv, { fetchImpl: async () => { called = true; throw new Error("should_not_call"); } });
  const result = await manager.ask(
    { session_signed: true, tenant_id: "11111111-1111-4111-8111-111111111111", actor_role: "aluno" },
    { prompt: "Meu treino", external_provider_allowed: false, operational_context: { facts: ["dado local"] } },
  );
  assert.equal(called, false);
  assert.equal(result.provider.engine, "local-evidence-fallback");
  assert.equal(result.provider.error, "lgpd_external_processing_denied");
  assert.equal(result.provider.latency_ms, 0);
});
