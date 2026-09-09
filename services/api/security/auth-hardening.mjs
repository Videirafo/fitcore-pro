// FITCORE PRO — MVP-20
// Hardening de autenticação: bloqueio de demo em produção, rate limit, limpeza de sessões e logs por tenant.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { normalizeRole } from "./access-context.mjs";

function clean(value, fallback = "", max = 260) {
  const text = String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
  return text || fallback;
}

function sqlText(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

function sha256(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

function jsonScalar(value) {
  const text = String(value || "").trim();
  return text ? JSON.parse(text) : null;
}

function intEnv(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(Math.max(safe, min), max);
}

function boolEnv(value, fallback = false) {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  return ["1", "true", "yes", "on", "sim"].includes(String(value).trim().toLowerCase());
}

function dbConnection(env = process.env) {
  const dbUrl = clean(env.FITCORE_DATABASE_URL || env.DATABASE_URL || "", "", 900);
  if (!dbUrl) return null;
  const parsed = new URL(dbUrl);
  return {
    args: ["-h", parsed.hostname, "-p", parsed.port || "5432", "-U", decodeURIComponent(parsed.username), "-d", decodeURIComponent(parsed.pathname.replace(/^\//, ""))],
    env: { PGPASSWORD: decodeURIComponent(parsed.password || ""), PGCONNECT_TIMEOUT: "5", PGSSLMODE: parsed.searchParams.get("sslmode") || "disable" },
  };
}

function runSql(env, sql) {
  const connection = dbConnection(env);
  if (!connection) return "";
  return execFileSync(clean(env.FITCORE_PSQL_BIN || "psql", "psql", 120), [...connection.args, "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
    env: { ...process.env, ...connection.env },
    timeout: 20000,
    maxBuffer: 6 * 1024 * 1024,
  }).trim();
}

function firstHeader(req, name) {
  const value = req?.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function clientIp(req) {
  const forwarded = firstHeader(req, "x-forwarded-for");
  if (forwarded) return clean(String(forwarded).split(",")[0], "unknown", 120);
  return clean(req?.socket?.remoteAddress || firstHeader(req, "cf-connecting-ip") || "unknown", "unknown", 120);
}

function criticalAuthAction(url, req) {
  const pathname = url?.pathname || "";
  const method = req?.method || "GET";
  const protectedPaths = new Set([
    "/api/mvp-15/session/login",
    "/api/mvp-18/users/invite",
    "/api/mvp-18/invites/accept",
    "/api/mvp-19/login",
    "/api/mvp-19/recovery/request",
    "/api/mvp-19/recovery/complete",
    "/api/mvp-19/credentials/set",
    "/api/mvp-19/credentials/revoke",
    "/api/mvp-22/users",
    "/api/mvp-22/users/invite",
    "/api/mvp-22/invites/accept",
    "/api/mvp-21/onboarding",
  ]);
  if (method === "POST" && protectedPaths.has(pathname)) return `${method} ${pathname}`;
  return null;
}

export function createAuthHardeningManager(env = process.env, sessionManager) {
  const fitcoreEnv = clean(env.FITCORE_ENV || env.NODE_ENV || "development", "development", 40).toLowerCase();
  const production = fitcoreEnv === "production";
  const enabled = boolEnv(env.FITCORE_AUTH_HARDENING_ENABLED, production);
  const demoLoginEnabled = boolEnv(env.FITCORE_DEMO_LOGIN_ENABLED, !production);
  const tenantSlug = clean(env.FITCORE_TENANT_SLUG || "demo", "demo", 80);
  const maxAttempts = intEnv(env.FITCORE_AUTH_RATE_LIMIT_MAX_ATTEMPTS, 5, 2, 100);
  const windowSeconds = intEnv(env.FITCORE_AUTH_RATE_LIMIT_WINDOW_SECONDS, 300, 30, 3600);
  const blockSeconds = intEnv(env.FITCORE_AUTH_RATE_LIMIT_BLOCK_SECONDS, 900, 60, 86400);

  function tenantId(context = {}) {
    if (context?.tenant_id) return clean(context.tenant_id, "", 90);
    const raw = runSql(env, `SELECT id::text FROM fitcore_tenants WHERE slug = ${sqlText(tenantSlug)} LIMIT 1;`);
    return clean(raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1) || "", "", 90);
  }

  function recordSecurityEvent(context = {}, req, acao, status = "ok", detalhe = "") {
    const tid = tenantId(context);
    if (!tid) return { ok: false, skipped: "missing_tenant" };
    const role = normalizeRole(context?.actor_role || "sistema");
    const actorIdSql = context?.actor_id ? `${sqlText(context.actor_id)}::uuid` : "NULL";
    const ipHash = sha256(clientIp(req));
    const userAgentHash = sha256(firstHeader(req, "user-agent") || "unknown");
    const safeAction = clean(acao, "auth_event", 90);
    const safeStatus = clean(status, "ok", 40);
    const safeDetail = clean(detalhe, "MVP-20 auth hardening", 360);
    try {
      runSql(env, `
        WITH scope AS (SELECT set_config('app.tenant_id', ${sqlText(tid)}, true))
        INSERT INTO fitcore_security_events (tenant_id, actor_id, actor_role, acao, status, detalhe, ip_hash, user_agent_hash)
        SELECT ${sqlText(tid)}::uuid, ${actorIdSql}, ${sqlText(role)}, ${sqlText(safeAction)}, ${sqlText(safeStatus)}, ${sqlText(safeDetail)}, ${sqlText(ipHash)}, ${sqlText(userAgentHash)}
        FROM scope;
        WITH scope AS (SELECT set_config('app.tenant_id', ${sqlText(tid)}, true))
        INSERT INTO fitcore_audit_events (tenant_id, actor_id, actor_role, recurso_tipo, acao, status, detalhe, ip_hash, user_agent_hash)
        SELECT ${sqlText(tid)}::uuid, ${actorIdSql}, ${sqlText(role)}, 'auth_security', ${sqlText(safeAction)}, ${sqlText(safeStatus)}, ${sqlText(safeDetail)}, ${sqlText(ipHash)}, ${sqlText(userAgentHash)}
        FROM scope;
      `);
      return { ok: true, persisted: true };
    } catch (error) {
      return { ok: false, persisted: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  function rateBucketKey(req, url) {
    const testKey = clean(firstHeader(req, "x-fitcore-rate-test") || "", "", 160);
    const base = [testKey ? `test=${testKey}` : "prod", clientIp(req), firstHeader(req, "user-agent") || "unknown", url.pathname].join("|");
    return sha256(base);
  }

  function bumpRateLimit(context, req, url, action) {
    const tid = tenantId(context);
    if (!tid) return { attempts: 0, blocked: false, skipped: "missing_tenant" };
    const key = rateBucketKey(req, url);
    const raw = runSql(env, `
      WITH scope AS (SELECT set_config('app.tenant_id', ${sqlText(tid)}, true)), upsert AS (
        INSERT INTO fitcore_auth_rate_limits (tenant_id, bucket_key, acao, attempts, window_start, last_attempt_at, blocked_until)
        SELECT ${sqlText(tid)}::uuid, ${sqlText(key)}, ${sqlText(action)}, 1, now(), now(), NULL
        FROM scope
        ON CONFLICT (tenant_id, bucket_key, acao) DO UPDATE SET
          attempts = CASE
            WHEN fitcore_auth_rate_limits.window_start < now() - (${windowSeconds} || ' seconds')::interval THEN 1
            WHEN fitcore_auth_rate_limits.blocked_until IS NOT NULL AND fitcore_auth_rate_limits.blocked_until < now() THEN 1
            ELSE fitcore_auth_rate_limits.attempts + 1
          END,
          window_start = CASE
            WHEN fitcore_auth_rate_limits.window_start < now() - (${windowSeconds} || ' seconds')::interval THEN now()
            WHEN fitcore_auth_rate_limits.blocked_until IS NOT NULL AND fitcore_auth_rate_limits.blocked_until < now() THEN now()
            ELSE fitcore_auth_rate_limits.window_start
          END,
          last_attempt_at = now(),
          blocked_until = CASE
            WHEN fitcore_auth_rate_limits.blocked_until IS NOT NULL AND fitcore_auth_rate_limits.blocked_until > now() THEN fitcore_auth_rate_limits.blocked_until
            WHEN (CASE
              WHEN fitcore_auth_rate_limits.window_start < now() - (${windowSeconds} || ' seconds')::interval THEN 1
              WHEN fitcore_auth_rate_limits.blocked_until IS NOT NULL AND fitcore_auth_rate_limits.blocked_until < now() THEN 1
              ELSE fitcore_auth_rate_limits.attempts + 1
            END) > ${maxAttempts} THEN now() + (${blockSeconds} || ' seconds')::interval
            ELSE NULL
          END,
          atualizado_em = now()
        RETURNING attempts, window_start, blocked_until, last_attempt_at
      )
      SELECT jsonb_build_object('attempts', attempts, 'window_start', window_start, 'blocked_until', blocked_until, 'last_attempt_at', last_attempt_at)::text FROM upsert;
    `);
    const bucket = jsonScalar(raw) || { attempts: 0 };
    return { ...bucket, blocked: Boolean(bucket.blocked_until && new Date(bucket.blocked_until).getTime() > Date.now()) };
  }

  function checkRequest(req, url, context = {}) {
    if (!enabled) return { allowed: true };
    const action = criticalAuthAction(url, req);
    if (!action) return { allowed: true };
    const bucket = bumpRateLimit(context, req, url, action);
    if (bucket.blocked) {
      recordSecurityEvent(context, req, "rate_limit_blocked", "bloqueado", `action=${action}; attempts=${bucket.attempts}; blocked_until=${bucket.blocked_until}`);
      return {
        allowed: false,
        statusCode: 429,
        response: {
          erro: "rate_limit_auth",
          mensagem: "Muitas tentativas de autenticação. Aguarde antes de tentar novamente.",
          mvp: "MVP-20 Auth Hardening",
          action,
          attempts: bucket.attempts,
          blocked_until: bucket.blocked_until,
        },
      };
    }
    return { allowed: true, bucket };
  }

  function requireGestor(context = {}) {
    if (!context?.session_signed) return { allowed: false, statusCode: 401, response: { erro: "sessao_obrigatoria", mensagem: "Faça login como gestor." } };
    if (normalizeRole(context.actor_role) !== "gestor") return { allowed: false, statusCode: 403, response: { erro: "acesso_negado", mensagem: "Somente gestor acessa logs de segurança.", papel: context.actor_role } };
    return { allowed: true };
  }

  function listSecurityLogs(context = {}) {
    const guard = requireGestor(context);
    if (!guard.allowed) return { guard };
    const raw = runSql(env, `
      WITH scope AS (SELECT set_config('app.tenant_id', ${sqlText(context.tenant_id)}, true))
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', e.id,
        'acao', e.acao,
        'status', e.status,
        'detalhe', e.detalhe,
        'actor_role', e.actor_role,
        'criado_em', e.criado_em
      ) ORDER BY e.criado_em DESC), '[]'::jsonb)::text
      FROM (SELECT * FROM fitcore_security_events WHERE tenant_id = ${sqlText(context.tenant_id)}::uuid ORDER BY criado_em DESC LIMIT 80) e, scope;
    `);
    const logs = jsonScalar(raw) || [];
    return { ok: true, mvp: "MVP-20 Auth Hardening", logs, total: logs.length, tenant_slug: context.tenant_slug || tenantSlug };
  }

  function cleanupExpiredSessions(context = {}) {
    const guard = requireGestor(context);
    if (!guard.allowed) return { guard };
    const sessions = typeof sessionManager?.cleanupExpiredSessions === "function" ? sessionManager.cleanupExpiredSessions(context) : { cleaned: 0 };
    const raw = runSql(env, `
      WITH scope AS (SELECT set_config('app.tenant_id', ${sqlText(context.tenant_id)}, true)), deleted AS (
        DELETE FROM fitcore_auth_rate_limits
        WHERE tenant_id = ${sqlText(context.tenant_id)}::uuid
          AND atualizado_em < now() - interval '1 day'
        RETURNING id
      ) SELECT count(*)::text FROM deleted, scope;
    `);
    recordSecurityEvent(context, null, "security_cleanup", "ok", `sessions=${sessions.cleaned || 0}; rate_buckets=${raw || 0}`);
    return { ok: true, mvp: "MVP-20 Auth Hardening", cleanup: true, expired_sessions_revoked: sessions.cleaned || 0, old_rate_buckets_deleted: Number(raw || 0) };
  }

  function publicHealth(context = {}) {
    return {
      ok: true,
      mvp: "MVP-20 Auth Hardening",
      enabled,
      fitcore_env: fitcoreEnv,
      production,
      demo_login_enabled: demoLoginEnabled,
      credential_policy: enabled ? "strict" : "basic",
      rate_limit: {
        enabled,
        max_attempts: maxAttempts,
        window_seconds: windowSeconds,
        block_seconds: blockSeconds,
        key: "ip_hash+user_agent_hash+action",
      },
      sessions: {
        signed: Boolean(sessionManager?.signedMode),
        cleanup_endpoint: "POST /api/mvp-20/security/cleanup-sessions",
      },
      logs: {
        by_tenant: true,
        table: "fitcore_security_events",
        endpoint: "GET /api/mvp-20/security/logs",
      },
      tenant_slug: context?.tenant_slug || tenantSlug,
      actor_role: context?.actor_role || null,
      headers_trusted: context?.headers_trusted === false ? false : Boolean(context?.headers_trusted),
    };
  }

  return { enabled, demoLoginEnabled, publicHealth, checkRequest, recordSecurityEvent, listSecurityLogs, cleanupExpiredSessions };
}
