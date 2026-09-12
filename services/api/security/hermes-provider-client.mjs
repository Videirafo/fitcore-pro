const DEFAULT_ENDPOINT = "https://marcaia.app/api/internal/hermes/provider";
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 240_000;
const MAX_OUTPUT_CHARS = 8_000;

function clean(value, fallback = "", max = 4_000) {
  const text = String(value ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return text || fallback;
}
function boolEnv(value, fallback = false) {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  return ["1", "true", "yes", "on", "sim"].includes(String(value).trim().toLowerCase());
}
function boundedTimeout(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.min(MAX_TIMEOUT_MS, Math.max(2_000, parsed)) : DEFAULT_TIMEOUT_MS;
}
function safeEndpoint(value) {
  try {
    const url = new URL(clean(value, DEFAULT_ENDPOINT, 900));
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname))) throw new Error("unsafe_protocol");
    return url.toString();
  } catch {
    return DEFAULT_ENDPOINT;
  }
}
function endpointList(env) {
  const raw = clean(env.FITCORE_HERMES_GATEWAY_URLS, "", 2_000);
  const values = raw ? raw.split(",") : [env.FITCORE_HERMES_GATEWAY_URL || DEFAULT_ENDPOINT];
  return [...new Set(values.map((value) => safeEndpoint(value)).filter(Boolean))].slice(0, 3);
}

export function createHermesProviderClient(env = process.env, deps = {}) {
  const enabled = boolEnv(env.FITCORE_HERMES_GATEWAY_ENABLED, false);
  const endpoints = endpointList(env);
  const token = clean(env.FITCORE_HERMES_GATEWAY_TOKEN, "", 512);
  const timeoutMs = boundedTimeout(env.FITCORE_HERMES_GATEWAY_TIMEOUT_MS);
  const fetchImpl = deps.fetchImpl || globalThis.fetch;

  function status() {
    return { enabled, configured: enabled && token.length >= 32, contract: "hermes-provider-gateway-v1", timeout_ms: timeoutMs, endpoint_count: endpoints.length, failover_enabled: endpoints.length > 1 };
  }

  async function generate({ tenantKey, prompt }) {
    if (!enabled) return { ok: false, error: "gateway_disabled" };
    if (token.length < 32) return { ok: false, error: "gateway_auth_not_configured" };
    if (typeof fetchImpl !== "function") return { ok: false, error: "gateway_fetch_unavailable" };
    const safeTenantKey = clean(tenantKey, "", 160);
    const safePrompt = clean(prompt, "", 4_000);
    if (!safeTenantKey || !safePrompt) return { ok: false, error: "gateway_input_invalid" };

    const startedAt = Date.now();
    for (let index = 0; index < endpoints.length; index += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(endpoints[index], {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ consumer: "fitcore", tenantKey: safeTenantKey, prompt: safePrompt }),
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) return { ok: false, error: clean(payload?.error, `gateway_http_${response.status}`, 120), status: response.status, latency_ms: Date.now() - startedAt };
        if (!payload?.ok || payload?.contract !== "hermes-provider-gateway-v1") return { ok: false, error: "gateway_contract_invalid", latency_ms: Date.now() - startedAt };
        const output = clean(payload.output, "", MAX_OUTPUT_CHARS);
        if (!output) return { ok: false, error: "gateway_response_empty", latency_ms: Date.now() - startedAt };
        return { ok: true, output, contract: payload.contract, provider: clean(payload.provider, "hermes-gateway", 120), model: clean(payload.model, "", 160) || null, latency_ms: Date.now() - startedAt, gateway_route: index === 0 ? "primary" : "standby" };
      } catch (error) {
        const aborted = error?.name === "AbortError" || controller.signal.aborted;
        if (aborted) return { ok: false, error: "gateway_timeout", latency_ms: Date.now() - startedAt };
        if (index === endpoints.length - 1) return { ok: false, error: "gateway_unavailable", latency_ms: Date.now() - startedAt };
      } finally {
        clearTimeout(timer);
      }
    }
    return { ok: false, error: "gateway_unavailable", latency_ms: Date.now() - startedAt };
  }

  return { enabled, status, generate };
}
