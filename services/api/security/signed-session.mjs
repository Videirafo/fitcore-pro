// FITCORE PRO — MVP-15
// Sessão assinada com usuário e papel vindos do PostgreSQL.

import { execFileSync } from "node:child_process";
import { createHash, createHmac, randomUUID, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { FITCORE_ROLE_MATRIX, FITCORE_ROLES, normalizeRole } from "./access-context.mjs";

function clean(value, fallback = "", max = 180) {
  const text = String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return text || fallback;
}

function header(req, name) {
  const value = req?.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function sqlText(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

function sqlInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(Math.max(safe, min), max);
}

function sha256(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

function b64urlJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function parseB64urlJson(value) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function parseCookies(req) {
  const raw = header(req, "cookie") || "";
  const cookies = new Map();
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies.set(key, value);
  }
  return cookies;
}

function timingSafeStringEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length) return false;
  return createHash("sha256").update(left).digest("hex") === createHash("sha256").update(right).digest("hex") && String(a) === String(b);
}

export function createSignedSessionManager(env = process.env) {
  const authMode = clean(env.FITCORE_AUTH_MODE || env.FITCORE_SESSION_MODE || "soft", "soft", 30).toLowerCase();
  const signedMode = ["signed", "session", "strict"].includes(authMode);
  const cookieName = clean(env.FITCORE_SESSION_COOKIE_NAME || "fitcore_session", "fitcore_session", 60);
  const ttlSeconds = sqlInt(env.FITCORE_SESSION_TTL_SECONDS, 60 * 60 * 8, 300, 60 * 60 * 24 * 7);
  const tenantSlug = clean(env.FITCORE_TENANT_SLUG || "demo", "demo", 80);
  const dbUrl = clean(env.FITCORE_DATABASE_URL || env.DATABASE_URL || "", "", 900);
  const secretFile = clean(env.FITCORE_SESSION_SECRET_FILE || "storage/secrets/fitcore-session-secret", "storage/secrets/fitcore-session-secret", 260);
  const psqlBin = clean(env.FITCORE_PSQL_BIN || "psql", "psql", 120);
  const secureCookie = clean(env.FITCORE_SESSION_COOKIE_SECURE || "true", "true", 10) !== "false";
  const fitcoreEnv = clean(env.FITCORE_ENV || env.NODE_ENV || "development", "development", 40).toLowerCase();
  const demoLoginDefault = fitcoreEnv === "production" ? "false" : "true";
  const demoLoginEnabled = clean(env.FITCORE_DEMO_LOGIN_ENABLED || demoLoginDefault, demoLoginDefault, 12).toLowerCase() === "true";

  function sessionSecret() {
    const inline = clean(env.FITCORE_SESSION_SECRET || "", "", 300);
    if (inline) return inline;
    if (!existsSync(secretFile)) {
      mkdirSync(dirname(secretFile), { recursive: true, mode: 0o700 });
      writeFileSync(secretFile, `${randomBytes(48).toString("hex")}\n`, { mode: 0o600 });
    }
    return readFileSync(secretFile, "utf8").trim();
  }

  function buildConnection() {
    if (!dbUrl) throw new Error("FITCORE_DATABASE_URL ausente para sessão assinada.");
    const parsed = new URL(dbUrl);
    return {
      args: ["-h", parsed.hostname, "-p", parsed.port || "5432", "-U", decodeURIComponent(parsed.username), "-d", decodeURIComponent(parsed.pathname.replace(/^\//, ""))],
      env: { PGPASSWORD: decodeURIComponent(parsed.password || ""), PGCONNECT_TIMEOUT: "5", PGSSLMODE: parsed.searchParams.get("sslmode") || "disable" },
    };
  }

  function runSql(sql) {
    const connection = buildConnection();
    return execFileSync(psqlBin, [...connection.args, "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], {
      encoding: "utf8",
      env: { ...process.env, ...connection.env },
      timeout: 20000,
      maxBuffer: 10 * 1024 * 1024,
    }).trim();
  }

  function scalar(sql) {
    const out = runSql(sql);
    return out.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1) || "";
  }

  function tenantCte() {
    return `tenant AS (SELECT id FROM fitcore_tenants WHERE slug = ${sqlText(tenantSlug)} LIMIT 1), scope AS (SELECT set_config('app.tenant_id', (SELECT id::text FROM tenant), true))`;
  }

  function signPayload(encodedPayload) {
    return createHmac("sha256", sessionSecret()).update(encodedPayload).digest("base64url");
  }

  function makeToken(payload) {
    const encoded = b64urlJson(payload);
    return `${encoded}.${signPayload(encoded)}`;
  }

  function verifyToken(token) {
    const [encoded, signature] = String(token || "").split(".");
    if (!encoded || !signature) return null;
    const expected = signPayload(encoded);
    if (!timingSafeStringEqual(signature, expected)) return null;
    const payload = parseB64urlJson(encoded);
    if (!payload?.sid || !payload?.exp || Date.now() > Number(payload.exp) * 1000) return null;
    return payload;
  }

  function cookieHeader(token) {
    return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ttlSeconds}${secureCookie ? "; Secure" : ""}`;
  }

  function clearCookieHeader() {
    return `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureCookie ? "; Secure" : ""}`;
  }

  function createSessionForUserRecord(user = {}, meta = {}) {
    if (!signedMode) throw new Error("Sessão assinada não está ativa. Ative FITCORE_AUTH_MODE=signed.");
    const userId = clean(user.user_id || user.id || "", "", 80);
    const tenantId = clean(user.tenant_id || "", "", 80);
    const actorRole = normalizeRole(user.papel || user.actor_role || "aluno");
    const actorName = clean(user.nome || user.actor_name || `Usuário ${actorRole}`, `Usuário ${actorRole}`, 120);
    if (!userId || !tenantId) throw new Error("Usuário inválido para criar sessão assinada.");

    const sid = randomUUID();
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + ttlSeconds;
    const token = makeToken({ v: "mvp15", sid, iat, exp });
    const tokenHash = sha256(token);

    scalar(`
      WITH scope AS (SELECT set_config('app.tenant_id', ${sqlText(tenantId)}, true))
      INSERT INTO fitcore_signed_sessions (id, tenant_id, user_id, token_hash, user_agent_hash, ip_hash, expires_at, atualizado_em)
      SELECT ${sqlText(sid)}::uuid, ${sqlText(tenantId)}::uuid, ${sqlText(userId)}::uuid, ${sqlText(tokenHash)}, ${sqlText(sha256(actorName))}, ${sqlText(clean(meta.source || "signed_session", "signed_session", 80))}, to_timestamp(${exp}), now()
      FROM scope
      ON CONFLICT (id) DO UPDATE SET token_hash = EXCLUDED.token_hash, revoked_at = NULL, expires_at = EXCLUDED.expires_at, atualizado_em = now()
      RETURNING id;
    `);

    return {
      token,
      cookie: cookieHeader(token),
      session: {
        id: sid,
        expires_at: new Date(exp * 1000).toISOString(),
        tenant_slug: tenantSlug,
        tenant_id: tenantId,
        user_id: userId,
        actor_name: actorName,
        actor_role: actorRole,
        role_from_db: true,
        headers_trusted: false,
        login_source: clean(meta.source || "signed_session", "signed_session", 80),
      },
    };
  }

  function createSession({ role = "gestor", actor_name = "Usuário demo", user_name } = {}) {
    if (!signedMode) throw new Error("Sessão assinada não está ativa. Ative FITCORE_AUTH_MODE=signed.");
    if (!demoLoginEnabled) {
      const error = new Error("Login demo bloqueado neste ambiente. Use login por credencial real.");
      error.statusCode = 403;
      error.code = "demo_login_bloqueado";
      throw error;
    }
    const requestedRole = normalizeRole(role);
    const displayName = clean(user_name || actor_name || `Demo ${requestedRole}`, `Demo ${requestedRole}`, 120);
    const userRaw = scalar(`
      WITH ${tenantCte()}, upsert_user AS (
        INSERT INTO fitcore_users (tenant_id, nome, papel, externo_id, ativo, atualizado_em)
        SELECT tenant.id, ${sqlText(displayName)}, ${sqlText(requestedRole)}, ${sqlText(`mvp15-${requestedRole}`)}, true, now()
        FROM tenant, scope WHERE tenant.id IS NOT NULL
        ON CONFLICT (tenant_id, externo_id) DO UPDATE SET nome = EXCLUDED.nome, papel = EXCLUDED.papel, ativo = true, atualizado_em = now()
        RETURNING id, tenant_id, nome, papel
      )
      SELECT jsonb_build_object('user_id', id, 'tenant_id', tenant_id, 'nome', nome, 'papel', papel)::text FROM upsert_user;
    `);
    const user = JSON.parse(userRaw || "{}");
    return createSessionForUserRecord(user, { source: "mvp15_demo" });
  }

  function resolveAccessContext(req) {
    if (!signedMode) return null;
    const token = parseCookies(req).get(cookieName);
    const payload = verifyToken(token);
    if (!payload) return null;
    const tokenHash = sha256(token);
    try {
      const raw = scalar(`
        WITH ${tenantCte()}
        SELECT jsonb_build_object(
          'session_id', s.id,
          'tenant_id', t.id,
          'tenant_slug', t.slug,
          'user_id', u.id,
          'actor_name', u.nome,
          'actor_role', u.papel,
          'expires_at', s.expires_at,
          'login_source', s.ip_hash
        )::text
        FROM fitcore_signed_sessions s
        JOIN fitcore_users u ON u.id = s.user_id AND u.tenant_id = s.tenant_id
        JOIN fitcore_tenants t ON t.id = s.tenant_id
        JOIN scope ON true
        WHERE s.id = ${sqlText(payload.sid)}::uuid
          AND s.token_hash = ${sqlText(tokenHash)}
          AND s.revoked_at IS NULL
          AND s.expires_at > now()
          AND u.ativo = true
          AND t.slug = ${sqlText(tenantSlug)}
        LIMIT 1;
      `);
      if (!raw) return null;
      const session = JSON.parse(raw);
      const role = normalizeRole(session.actor_role);
      return {
        ok: true,
        mvp: "MVP-15 Signed Session RBAC",
        tenant_slug: session.tenant_slug,
        tenant_id: session.tenant_id,
        actor_id: session.user_id,
        actor_role: role,
        actor_name: session.actor_name,
        session_id: session.session_id,
        session_signed: true,
        role_from_db: true,
        headers_trusted: false,
        enforcement: "strict_session",
        source: "signed_session_database",
        login_source: session.login_source || "signed_session_database",
        capabilities: FITCORE_ROLE_MATRIX[role] || [],
        login_real: true,
        expires_at: session.expires_at,
        login_source: clean(session.login_source || "signed_session", "signed_session", 80),
        policy: {
          dados_minimos: true,
          tenant_required: true,
          role_required: true,
          lgpd: "sessão assinada sem documento, telefone, e-mail, foto, medidas ou dado médico nesta fase",
        },
      };
    } catch {
      return null;
    }
  }

  function logout(req) {
    const token = parseCookies(req).get(cookieName);
    const payload = verifyToken(token);
    if (payload?.sid) {
      try {
        scalar(`WITH ${tenantCte()} UPDATE fitcore_signed_sessions SET revoked_at = now(), atualizado_em = now() FROM scope WHERE id = ${sqlText(payload.sid)}::uuid RETURNING id;`);
      } catch {}
    }
    return { ok: true, logout: true, cookie: clearCookieHeader() };
  }

  function isProtectedRoute(pathname) {
    return pathname === "/api/mvp-01/aluno-treino"
      || pathname.startsWith("/api/mvp-01/aluno-treino/")
      || pathname === "/api/mvp-02/checkins"
      || pathname.startsWith("/api/mvp-02/checkins/")
      || pathname === "/api/mvp-03/professor/contexto"
      || pathname === "/api/mvp-03/professor/reviews"
      || pathname.startsWith("/api/mvp-03/professor/reviews/")
      || pathname === "/api/mvp-17/navigation"
      || pathname === "/api/mvp-17/navigation/audit";
  }

  function allowedRolesFor(pathname, method) {
    if (pathname.startsWith("/api/mvp-03/professor")) return ["gestor", "professor"];
    if (pathname.startsWith("/api/mvp-01/aluno-treino") && method !== "GET") return ["gestor", "professor"];
    if (pathname.startsWith("/api/mvp-02/checkins")) return ["gestor", "professor", "aluno"];
    return FITCORE_ROLES;
  }

  function authorizeRoute(context, pathname, method = "GET") {
    if (!signedMode || !isProtectedRoute(pathname)) return { allowed: true };
    if (!context?.session_signed) {
      return {
        allowed: false,
        statusCode: 401,
        response: {
          erro: "sessao_obrigatoria",
          mensagem: "Faça login para acessar esta rota.",
          mvp: "MVP-15 Signed Session RBAC",
          rollback: "bash infra/scripts/rollback-mvp-15-soft-auth.sh",
        },
      };
    }
    const allowedRoles = allowedRolesFor(pathname, method);
    if (!allowedRoles.includes(normalizeRole(context.actor_role))) {
      return {
        allowed: false,
        statusCode: 403,
        response: { erro: "acesso_negado", papel: context.actor_role, papeis_permitidos: allowedRoles, source: "signed_session_database" },
      };
    }
    return { allowed: true };
  }

  function cleanupExpiredSessions(context = {}) {
    if (!signedMode) return { cleaned: 0, skipped: "signed_mode_disabled" };
    if (!context?.tenant_id) return { cleaned: 0, skipped: "missing_tenant" };
    try {
      const cleaned = scalar(`
        WITH scope AS (SELECT set_config('app.tenant_id', ${sqlText(context.tenant_id)}, true)), updated AS (
          UPDATE fitcore_signed_sessions
          SET revoked_at = COALESCE(revoked_at, now()), atualizado_em = now()
          WHERE tenant_id = ${sqlText(context.tenant_id)}::uuid
            AND expires_at < now()
            AND revoked_at IS NULL
          RETURNING id
        ) SELECT count(*)::text FROM updated, scope;
      `);
      return { cleaned: Number(cleaned || 0) };
    } catch (error) {
      return { cleaned: 0, error: error instanceof Error ? error.message : String(error) };
    }
  }

  function publicHealth(req, accessContext) {
    return {
      ok: true,
      mvp: "MVP-15 Signed Session RBAC",
      auth_mode: signedMode ? "signed" : "soft",
      session_required_for_protected_routes: signedMode,
      cookie_name: cookieName,
      tenant_slug: tenantSlug,
      fitcore_env: fitcoreEnv,
      demo_login_enabled: demoLoginEnabled,
      current_session: accessContext?.session_signed ? {
        signed: true,
        tenant_slug: accessContext.tenant_slug,
        actor_role: accessContext.actor_role,
        actor_name: accessContext.actor_name,
        login_source: accessContext.login_source || "signed_session_database",
        role_from_db: true,
        headers_trusted: false,
        expires_at: accessContext.expires_at,
        login_source: accessContext.login_source || "signed_session",
      } : null,
      protected_routes: ["/api/mvp-01/aluno-treino", "/api/mvp-02/checkins", "/api/mvp-03/professor/*", "/api/mvp-17/navigation"],
      rollback: "bash infra/scripts/rollback-mvp-15-soft-auth.sh",
    };
  }

  return { authMode, signedMode, demoLoginEnabled, createSession, createSessionForUserRecord, resolveAccessContext, logout, clearCookieHeader, authorizeRoute, publicHealth, cleanupExpiredSessions };
}
