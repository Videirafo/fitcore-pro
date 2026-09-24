import { createHash } from "node:crypto";

const buckets = new Map();

function splitList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function firstHeader(req, name) {
  const value = req?.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function remoteIsTrusted(req, env) {
  if (String(env.FITCORE_TRUST_PROXY || "true").toLowerCase() === "false") return false;
  const remote = String(req?.socket?.remoteAddress || "");
  return remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
}

function clientIp(req, env) {
  if (remoteIsTrusted(req, env)) {
    const forwarded =
      firstHeader(req, "cf-connecting-ip") ||
      firstHeader(req, "x-real-ip") ||
      firstHeader(req, "x-forwarded-for");
    if (forwarded) return String(forwarded).split(",")[0].trim().slice(0, 128);
  }
  return String(req?.socket?.remoteAddress || "unknown").slice(0, 128);
}

function cookieValue(req, name) {
  const raw = String(firstHeader(req, "cookie") || "");
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return "";
}

function opaque(value) {
  return createHash("sha256").update(String(value || "")).digest("hex").slice(0, 24);
}

function normalizeOrigin(value) {
  if (!value) return "";
  try {
    const url = new URL(String(value));
    if (url.username || url.password || url.hash) return "";
    return url.origin.toLowerCase();
  } catch {
    return "";
  }
}

function routeScope(pathname) {
  if (pathname.includes("/login") || pathname.includes("/session/login")) return "auth.login";
  if (pathname.includes("/invites/accept")) return "auth.invite.accept";
  if (pathname.includes("/users/invite")) return "auth.invite.create";
  if (pathname.startsWith("/api/platform-owner")) return "platform.owner";
  if (pathname.startsWith("/api/vnext/assessments")) return "assessments";
  if (pathname.startsWith("/api/vnext/athlete") || pathname.startsWith("/api/atleta")) return "athlete";
  if (pathname.startsWith("/api/mvp-25")) return "execution";
  return "api";
}

function limitFor(scope, method, env) {
  const configured = Number.parseInt(String(env.FITCORE_RATE_LIMIT_PER_MINUTE || ""), 10);
  const fallback = Number.isFinite(configured) && configured > 0 ? Math.min(configured, 5000) : 240;
  if (scope === "auth.login") return { limit: 12, windowMs: 15 * 60_000 };
  if (scope === "auth.invite.accept" || scope === "auth.invite.create") return { limit: 30, windowMs: 15 * 60_000 };
  if (scope === "platform.owner") return { limit: 120, windowMs: 60_000 };
  if (method === "GET" || method === "HEAD") return { limit: Math.max(fallback, 600), windowMs: 60_000 };
  return { limit: fallback, windowMs: 60_000 };
}

function pruneBuckets(now) {
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > bucket.windowMs * 2) buckets.delete(key);
  }
}

function directJson(res, statusCode, payload, headers = {}) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  });
  res.end(JSON.stringify(payload));
}

export function createHttpSecurity(env = process.env) {
  const cookieName = String(env.FITCORE_SESSION_COOKIE_NAME || "fitcore_session");
  const configuredOrigins = splitList(env.FITCORE_ALLOWED_ORIGINS);
  const allowedOrigins = new Set(
    (configuredOrigins.length ? configuredOrigins : ["https://fitcore.marcaia.app"])
      .map(normalizeOrigin)
      .filter(Boolean),
  );

  function applyHeaders(req, res) {
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("x-frame-options", "DENY");
    res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
    res.setHeader("cross-origin-opener-policy", "same-origin");
    res.setHeader("cross-origin-resource-policy", "same-site");
    res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
    res.setHeader(
      "content-security-policy",
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );

    const origin = normalizeOrigin(firstHeader(req, "origin"));
    if (origin && allowedOrigins.has(origin)) {
      res.setHeader("access-control-allow-origin", origin);
      res.setHeader("access-control-allow-credentials", "true");
      res.setHeader("vary", "Origin");
    }
  }

  function validBrowserOrigin(req) {
    const origin = normalizeOrigin(firstHeader(req, "origin"));
    if (origin) return allowedOrigins.has(origin);

    const referer = firstHeader(req, "referer");
    if (referer) {
      const refererOrigin = normalizeOrigin(referer);
      if (refererOrigin) return allowedOrigins.has(refererOrigin);
    }

    const fetchSite = String(firstHeader(req, "sec-fetch-site") || "").toLowerCase();
    return fetchSite === "same-origin" || fetchSite === "same-site";
  }

  function rateDecision(req, url) {
    const method = String(req.method || "GET").toUpperCase();
    const scope = routeScope(url.pathname);
    const spec = limitFor(scope, method, env);
    const token = cookieValue(req, cookieName) || firstHeader(req, "authorization") || "anonymous";
    const key = [
      scope,
      method,
      opaque(clientIp(req, env)),
      opaque(token),
    ].join(":");
    const now = Date.now();
    pruneBuckets(now);
    let bucket = buckets.get(key);
    if (!bucket || now - bucket.windowStart >= spec.windowMs) {
      bucket = { windowStart: now, count: 0, windowMs: spec.windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    const remaining = Math.max(0, spec.limit - bucket.count);
    const retryAfter = Math.max(1, Math.ceil((spec.windowMs - (now - bucket.windowStart)) / 1000));
    return { allowed: bucket.count <= spec.limit, limit: spec.limit, remaining, retryAfter, scope };
  }

  function guard(req, res, url) {
    applyHeaders(req, res);

    const originHeader = firstHeader(req, "origin");
    const origin = normalizeOrigin(originHeader);
    if (originHeader && (!origin || !allowedOrigins.has(origin))) {
      directJson(res, 403, { erro: "origem_nao_autorizada" });
      return { handled: true };
    }

    if (String(req.method || "").toUpperCase() === "OPTIONS") {
      if (!origin) {
        directJson(res, 400, { erro: "origem_obrigatoria" });
        return { handled: true };
      }
      res.writeHead(204, {
        "access-control-allow-origin": origin,
        "access-control-allow-credentials": "true",
        "access-control-allow-methods": "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
        "access-control-allow-headers": "content-type,x-fitcore-proposal-id,x-idempotency-key",
        "access-control-max-age": "600",
        "vary": "Origin",
      });
      res.end();
      return { handled: true };
    }

    const method = String(req.method || "GET").toUpperCase();
    const unsafe = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
    const hasSessionCookie = Boolean(cookieValue(req, cookieName));
    if (unsafe && hasSessionCookie && !validBrowserOrigin(req)) {
      directJson(res, 403, { erro: "csrf_bloqueado", mensagem: "Origem da requisição não autorizada." });
      return { handled: true };
    }

    const rate = rateDecision(req, url);
    res.setHeader("x-ratelimit-limit", String(rate.limit));
    res.setHeader("x-ratelimit-remaining", String(rate.remaining));
    if (!rate.allowed) {
      directJson(
        res,
        429,
        { erro: "rate_limited", mensagem: "Muitas requisições. Aguarde e tente novamente." },
        { "retry-after": String(rate.retryAfter) },
      );
      return { handled: true };
    }

    return { handled: false, rate };
  }

  return {
    allowedOrigins: [...allowedOrigins],
    applyHeaders,
    guard,
  };
}
