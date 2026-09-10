const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function boolEnv(value, fallback = false) {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  return ["1", "true", "yes", "on", "sim"].includes(String(value).trim().toLowerCase());
}

export function normalizeLoopbackBaseUrl(raw, fallback) {
  const value = String(raw || fallback || "").trim();
  if (!value) throw new Error("loopback_service_url_missing");
  const url = new URL(value);
  if (url.protocol !== "http:") throw new Error("loopback_service_must_use_http");
  if (url.username || url.password) throw new Error("loopback_service_credentials_in_url_forbidden");
  if (!LOOPBACK_HOSTS.has(url.hostname)) throw new Error("loopback_service_must_bind_loopback");
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export async function fetchWithDeadline(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal, redirect: "error" });
  } finally {
    clearTimeout(timer);
  }
}
