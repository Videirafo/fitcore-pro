import { normalizeRole } from "./access-context.mjs";
import { fetchWithDeadline, normalizeLoopbackBaseUrl, boolEnv } from "./loopback-service.mjs";
import { createScrapeGraphSemanticClient } from "./scrapegraph-semantic.mjs";
import { publicFitCoreCapabilityStatus } from "./upstream-capabilities.mjs";

const CRAWL_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const KNOWLEDGE_MAX_CHARS = 50_000;

function clean(value, fallback = "", max = 2000) {
  const text = String(value || "").normalize("NFKC").trim().slice(0, max);
  return text || fallback;
}

function parseDomainAllowlist(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase().replace(/^\./, ""))
    .filter(Boolean);
}

function hostnameAllowed(hostname, allowlist) {
  const host = String(hostname || "").toLowerCase();
  return allowlist.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

function staffGuard(context = {}) {
  if (!context?.session_signed || !context?.tenant_id) {
    return { allowed: false, statusCode: 401, response: { erro: "sessao_obrigatoria" } };
  }
  const role = normalizeRole(context.actor_role || "visitante");
  if (!new Set(["gestor", "professor"]).has(role)) {
    return { allowed: false, statusCode: 403, response: { erro: "acesso_negado", papeis_permitidos: ["gestor", "professor"] } };
  }
  return { allowed: true, role };
}

async function readJsonWithinLimit(response, maxBytes = CRAWL_MAX_RESPONSE_BYTES) {
  const announced = Number(response.headers.get("content-length") || 0);
  if (announced > maxBytes) throw new Error("capability_response_too_large");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new Error("capability_response_too_large");
  return JSON.parse(new TextDecoder().decode(bytes));
}

function markdownText(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  for (const key of ["raw_markdown", "fit_markdown", "markdown_with_citations", "content"]) {
    if (typeof value[key] === "string" && value[key].trim()) return value[key];
  }
  return "";
}

function validateKnowledgeUrl(raw, allowlist) {
  const url = new URL(clean(raw, "", 2000));
  if (url.protocol !== "https:") throw new Error("knowledge_url_https_required");
  if (url.username || url.password) throw new Error("knowledge_url_userinfo_forbidden");
  if (!allowlist.length) throw new Error("knowledge_domain_allowlist_required");
  if (!hostnameAllowed(url.hostname, allowlist)) throw new Error("knowledge_domain_not_allowed");
  url.hash = "";
  return url;
}

export function createOpenSourceCapabilityManager(env = process.env) {
  const crawlEnabled = boolEnv(env.FITCORE_CRAWL4AI_ENABLED, false);
  const stirlingEnabled = boolEnv(env.FITCORE_STIRLING_PDF_ENABLED, false);
  const crawlBaseUrl = normalizeLoopbackBaseUrl(env.FITCORE_CRAWL4AI_URL, "http://127.0.0.1:11235");
  const stirlingBaseUrl = normalizeLoopbackBaseUrl(env.FITCORE_STIRLING_PDF_URL, "http://127.0.0.1:8089");
  const crawlToken = clean(env.FITCORE_CRAWL4AI_TOKEN, "", 500);
  const stirlingApiKey = clean(env.FITCORE_STIRLING_PDF_API_KEY, "", 500);
  const domainAllowlist = parseDomainAllowlist(env.FITCORE_WEB_KNOWLEDGE_ALLOWLIST);
  const semanticClient = createScrapeGraphSemanticClient(env);

  function status(context = {}) {
    return {
      ok: true,
      capability_layer: "open-source-capability-layer-v1",
      tenant_scoped: true,
      actor_role: context?.actor_role || null,
      upstreams: publicFitCoreCapabilityStatus(),
      services: {
        crawl4ai: { enabled: crawlEnabled, pinned: "0.9.3", loopbackOnly: true, configured: Boolean(crawlToken && domainAllowlist.length) },
        scrapegraphai: semanticClient.status(),
        stirlingPdf: { enabled: stirlingEnabled, pinned: "2.14.3", loopbackOnly: true, configured: Boolean(stirlingBaseUrl) },
      },
      policy: {
        webKnowledgeReviewRequired: true,
        externalContentUntrusted: true,
        semanticAutoApply: false,
        agentHostFilesystem: false,
        privilegedAutoExecution: false,
      },
    };
  }

  async function previewWebKnowledge(context = {}, input = {}) {
    const guard = staffGuard(context);
    if (!guard.allowed) return { guard };
    if (!crawlEnabled) return { guard: { allowed: false, statusCode: 503, response: { erro: "web_knowledge_disabled" } } };
    if (!crawlToken || !domainAllowlist.length) {
      return { guard: { allowed: false, statusCode: 503, response: { erro: "web_knowledge_not_configured" } } };
    }

    let target;
    try {
      target = validateKnowledgeUrl(input.url, domainAllowlist);
    } catch (error) {
      return { guard: { allowed: false, statusCode: 400, response: { erro: error instanceof Error ? error.message : "invalid_knowledge_url" } } };
    }

    const response = await fetchWithDeadline(`${crawlBaseUrl}/md`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${crawlToken}` },
      body: JSON.stringify({ url: target.toString(), f: "fit" }),
    }, 15000);
    if (!response.ok) throw new Error(`crawl4ai_http_${response.status}`);
    const payload = await readJsonWithinLimit(response);
    const text = markdownText(payload?.markdown).trim();
    if (!text) throw new Error("crawl4ai_empty_markdown");

    let semantic = null;
    let semantic_status = semanticClient.enabled ? (semanticClient.configured ? "unavailable" : "not_configured") : "disabled";
    if (semanticClient.enabled && semanticClient.configured) {
      try {
        semantic = await semanticClient.extract(text, target.toString());
        semantic_status = "ok";
      } catch {
        semantic = null;
        semantic_status = "unavailable";
      }
    }

    return {
      ok: true,
      review_required: true,
      content: text.slice(0, KNOWLEDGE_MAX_CHARS),
      truncated: text.length > KNOWLEDGE_MAX_CHARS,
      semantic,
      semantic_status,
      source: { renderer: "crawl4ai", requested_url: target.toString(), domain: target.hostname, version: "0.9.3" },
      safety: {
        tenant_scoped: true,
        allowlisted_domain: true,
        auto_apply: false,
        semantic_auto_apply: false,
        external_content_untrusted: true,
      },
    };
  }

  async function stirlingHealth() {
    if (!stirlingEnabled) return { enabled: false, healthy: false };
    try {
      const headers = stirlingApiKey ? { "X-API-KEY": stirlingApiKey } : {};
      const response = await fetchWithDeadline(`${stirlingBaseUrl}/api/v1/info/status`, { headers }, 5000);
      return { enabled: true, healthy: response.ok };
    } catch {
      return { enabled: true, healthy: false };
    }
  }

  async function ocrPdf(context = {}, input = {}) {
    const guard = staffGuard(context);
    if (!guard.allowed) return { guard };
    if (!stirlingEnabled) return { guard: { allowed: false, statusCode: 503, response: { erro: "document_service_disabled" } } };
    const buffer = input.buffer;
    if (!(buffer instanceof Uint8Array) || buffer.byteLength === 0 || buffer.byteLength > 20 * 1024 * 1024) {
      return { guard: { allowed: false, statusCode: 400, response: { erro: "invalid_pdf_buffer" } } };
    }
    const form = new FormData();
    form.append("fileInput", new Blob([buffer], { type: "application/pdf" }), clean(input.filename, "document.pdf", 160));
    form.append("languages", clean(input.language, "por", 12));
    form.append("ocrType", "Normal");
    const headers = stirlingApiKey ? { "X-API-KEY": stirlingApiKey } : {};
    const response = await fetchWithDeadline(`${stirlingBaseUrl}/api/v1/misc/ocr-pdf`, { method: "POST", headers, body: form }, 60000);
    if (!response.ok) throw new Error(`stirling_pdf_http_${response.status}`);
    const output = new Uint8Array(await response.arrayBuffer());
    if (!output.byteLength || output.byteLength > 30 * 1024 * 1024) throw new Error("stirling_pdf_output_invalid");
    return { ok: true, bytes: output, mime: "application/pdf", source: { renderer: "stirling-pdf", version: "2.14.3" } };
  }

  return { status, previewWebKnowledge, stirlingHealth, ocrPdf };
}
