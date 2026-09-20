import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHermesProviderClient } from "../services/api/security/hermes-provider-client.mjs";
import { createAgentAssistantManager } from "../services/api/security/agent-assistant.mjs";

const baseEnv = {
  FITCORE_HERMES_GATEWAY_ENABLED: "true",
  FITCORE_HERMES_GATEWAY_URL: "https://marcaia.app/api/internal/hermes/provider",
  FITCORE_HERMES_GATEWAY_TOKEN: "x".repeat(64),
  FITCORE_HERMES_GATEWAY_TIMEOUT_MS: "90000",
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
  assert.equal(client.status().timeout_ms, 90000);
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

test("#32 wrapper mantém budget abaixo do proxy e configura primary+standby sem expor segredos", async () => {
  const script = await readFile(new URL("../infra/scripts/fitcore-api-with-hermes.sh", import.meta.url), "utf8");
  assert.match(script, /FITCORE_GATEWAY_TIMEOUT_MS=90000/);
  assert.doesNotMatch(script, /120000/);
  assert.match(script, /127\.0\.0\.1:3411\/api\/internal\/hermes\/provider/);
  assert.match(script, /127\.0\.0\.1:3413\/api\/internal\/hermes\/provider/);
  assert.match(script, /unset HERMES_GATEWAY_INTERNAL_TOKEN HERMES_TOKEN/);
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

test("#85 Hermes recebe Execution Analytics sanitizado sem capability/PII/raw payload", async () => {
  let gatewayPrompt = "";
  const manager = createAgentAssistantManager(baseEnv, { fetchImpl: async (_url, options) => {
    gatewayPrompt = JSON.parse(options.body).prompt;
    return new Response(JSON.stringify({ ok: true, contract: "hermes-provider-gateway-v1", output: "Priorize o alerta operacional.", provider: "ollama-native-local", model: "qwen3:1.7b" }), { status: 200 });
  }});
  const result = await manager.ask(
    { session_signed: true, tenant_id: "11111111-1111-4111-8111-111111111111", actor_role: "gestor" },
    { prompt: "O que devo priorizar?", module: "auditoria", operational_context: {
      students: [],
      execution_analytics: {
        summary: { runs: 7, succeeded: 5, failed: 0, retry_wait: 1, dead_letter: 1, stale: 0, success_rate_pct: 71.43, avg_duration_ms: 1200 },
        alerts: [{ code: "execution_dead_letter", severity: "critical", count: 1, raw_payload: "NAO_ENVIAR" }],
        recent: [{ trace_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", execution_id: "exe_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", action_id: "fitcore.workout.execution.start", state: "dead_letter", error_code: "terminal_failure", actor_user_id: "PII_NAO_ENVIAR", idempotency_hash: "SECRET_NAO_ENVIAR" }],
      },
    } },
  );
  assert.equal(result.ok, true);
  assert.match(gatewayPrompt, /Execution Analytics: runs=7/);
  assert.match(gatewayPrompt, /execution_dead_letter/);
  assert.match(gatewayPrompt, /aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\/exe_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/);
  assert.doesNotMatch(gatewayPrompt, /NAO_ENVIAR|PII_NAO_ENVIAR|SECRET_NAO_ENVIAR|capability/i);
  assert.equal(result.safety.capability_exposed, false);
  assert.equal(result.safety.direct_database_access, false);
});

test("#85 fallback local preserva Execution Analytics já sanitizado", async () => {
  const manager = createAgentAssistantManager({ FITCORE_HERMES_GATEWAY_ENABLED: "false" });
  const result = await manager.ask(
    { session_signed: true, tenant_id: "11111111-1111-4111-8111-111111111111", actor_role: "gestor" },
    { prompt: "O que devo priorizar?", module: "auditoria", operational_context: {
      students: [],
      execution_analytics: {
        summary: { runs: 7, succeeded: 5, retry_wait: 1, dead_letter: 1, success_rate_pct: 71.43 },
        alerts: [{ code: "execution_dead_letter", severity: "critical", count: 1 }],
      },
    } },
  );
  assert.equal(result.provider.engine, "local-evidence-fallback");
  assert.match(result.reply, /Execution Kernel: 7 runs/);
  assert.match(result.reply, /dead_letter=1/);
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


test("#32 timeout Hermes fica abaixo do proxy público de 120s", () => {
  const client = createHermesProviderClient({ ...baseEnv, FITCORE_HERMES_GATEWAY_TIMEOUT_MS: "999999" });
  const status = client.status();
  assert.equal(status.timeout_ms, 100000);
  assert.ok(status.timeout_ms < 120000);
});

test("#32 contexto sem registry de consentimento falha fechado para dados de aluno", async () => {
  let sentPrompt = "";
  const manager = createAgentAssistantManager(baseEnv, { fetchImpl: async (_url, options) => {
    sentPrompt = JSON.parse(options.body).prompt;
    return new Response(JSON.stringify({ ok: true, contract: "hermes-provider-gateway-v1", output: "ok", provider: "ollama-native-local", model: "qwen3:1.7b" }), { status: 200 });
  }});
  const result = await manager.ask(
    { session_signed: true, tenant_id: "11111111-1111-4111-8111-111111111111", actor_role: "gestor" },
    { prompt: "resuma", operational_context: {
      team: [{ id: "u-aluno", nome: "Aluno Sem Registry", papel: "aluno" }, { id: "u-prof", nome: "Prof Seguro", papel: "professor" }],
      prescriptions: [{ student_id: "s1", nome: "Treino Privado", aluno: "Aluno Sem Registry", status: "aprovado" }],
      executions: [{ student_id: "s1", aluno: "Aluno Sem Registry", status: "concluido" }],
    } },
  );
  assert.equal(result.ok, true);
  assert.doesNotMatch(sentPrompt, /Aluno Sem Registry|Treino Privado/);
  assert.match(sentPrompt, /Prof Seguro/);
});

test("#32 registry completo filtra antes do cap de detalhes", async () => {
  let sentPrompt = "";
  const students = Array.from({ length: 55 }, (_, index) => ({ id: `s${index+1}`, user_id: `u${index+1}`, nome: `Aluno ${index+1}`, consentimento_lgpd: true }));
  const manager = createAgentAssistantManager(baseEnv, { fetchImpl: async (_url, options) => {
    sentPrompt = JSON.parse(options.body).prompt;
    return new Response(JSON.stringify({ ok: true, contract: "hermes-provider-gateway-v1", output: "ok", provider: "ollama-native-local", model: "qwen3:1.7b" }), { status: 200 });
  }});
  await manager.ask(
    { session_signed: true, tenant_id: "11111111-1111-4111-8111-111111111111", actor_role: "gestor" },
    { prompt: "resuma", operational_context: { students, prescriptions: [{ student_id: "s55", nome: "Treino 55", aluno: "Aluno 55", status: "aprovado" }] } },
  );
  assert.match(sentPrompt, /Treino 55/);
});
