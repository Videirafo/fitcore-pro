// FITCORE PRO — MVP-19
// Login por credencial mínima, recuperação e revogação controlada.

import { execFileSync } from "node:child_process";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { normalizeRole } from "./access-context.mjs";

function clean(value, fallback = "", max = 240) {
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

function dbConnection(env = process.env) {
  const dbUrl = clean(env.FITCORE_DATABASE_URL || env.DATABASE_URL || "", "", 900);
  if (!dbUrl) throw new Error("FITCORE_DATABASE_URL ausente para MVP-19.");
  const parsed = new URL(dbUrl);
  return {
    args: ["-h", parsed.hostname, "-p", parsed.port || "5432", "-U", decodeURIComponent(parsed.username), "-d", decodeURIComponent(parsed.pathname.replace(/^\//, ""))],
    env: { PGPASSWORD: decodeURIComponent(parsed.password || ""), PGCONNECT_TIMEOUT: "5", PGSSLMODE: parsed.searchParams.get("sslmode") || "disable" },
  };
}

function runSql(env, sql) {
  const connection = dbConnection(env);
  return execFileSync(clean(env.FITCORE_PSQL_BIN || "psql", "psql", 120), [...connection.args, "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
    env: { ...process.env, ...connection.env },
    timeout: 20000,
    maxBuffer: 6 * 1024 * 1024,
  }).trim();
}

function tenantScope(context) {
  if (!context?.tenant_id) throw new Error("tenant_id ausente na sessão assinada.");
  return `scope AS (SELECT set_config('app.tenant_id', ${sqlText(context.tenant_id)}, true))`;
}

function tenantCte(tenantSlug) {
  return `tenant AS (SELECT id, slug FROM fitcore_tenants WHERE slug = ${sqlText(tenantSlug)} LIMIT 1), scope AS (SELECT set_config('app.tenant_id', (SELECT id::text FROM tenant), true))`;
}

function hashSecret(secret) {
  const value = clean(secret, "", 400);
  if (value.length < 6) {
    const error = new Error("A senha ou código precisa ter pelo menos 6 caracteres.");
    error.statusCode = 400;
    throw error;
  }
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(value, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
  return `scrypt:16384:8:1:${salt}:${hash}`;
}

function validateSecretPolicy(env, secret, loginIdentifier = "", kind = "password") {
  const hardening = clean(env.FITCORE_AUTH_HARDENING_ENABLED || "false", "false", 12).toLowerCase() === "true";
  if (!hardening) return true;
  const value = String(secret || "");
  const identifier = String(loginIdentifier || "").toLowerCase();
  const normalized = value.toLowerCase();
  const minLength = kind === "access_code" ? 6 : 8;
  if (value.length < minLength) {
    const error = new Error(kind === "access_code" ? "Código de acesso precisa ter pelo menos 6 caracteres." : "Senha precisa ter pelo menos 8 caracteres.");
    error.statusCode = 400;
    throw error;
  }
  if (identifier && normalized === identifier) {
    const error = new Error("A credencial não pode ser igual ao identificador de login.");
    error.statusCode = 400;
    throw error;
  }
  if (["123456", "12345678", "password", "senha123", "fitcore", "fitcore123"].includes(normalized)) {
    const error = new Error("Credencial muito fraca para o modo de produção.");
    error.statusCode = 400;
    throw error;
  }
  if (kind === "password" && (!/[A-Za-zÀ-ÿ]/.test(value) || !/[0-9]/.test(value))) {
    const error = new Error("Senha em produção precisa combinar letras e números.");
    error.statusCode = 400;
    throw error;
  }
  return true;
}

function verifySecret(stored, candidate) {
  const parts = String(stored || "").split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, expectedHex] = parts;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = scryptSync(String(candidate || ""), salt, expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function requireSigned(context) {
  if (!context?.session_signed || !context?.actor_id || !context?.tenant_id) {
    return { allowed: false, statusCode: 401, response: { erro: "sessao_obrigatoria", mensagem: "Faça login para gerenciar credenciais." } };
  }
  return { allowed: true };
}

function requireGestor(context) {
  const signed = requireSigned(context);
  if (!signed.allowed) return signed;
  if (normalizeRole(context.actor_role) !== "gestor") {
    return { allowed: false, statusCode: 403, response: { erro: "acesso_negado", mensagem: "Somente gestor pode executar esta ação.", papel: context.actor_role } };
  }
  return { allowed: true };
}

function safeUser(user) {
  if (!user) return null;
  return {
    id: user.id || user.user_id,
    tenant_id: user.tenant_id,
    nome: user.nome,
    papel: user.papel,
    login_identifier: user.login_identifier,
    email: user.email || null,
    telefone: user.telefone || null,
    credential_kind: user.credential_kind,
    credential_set: Boolean(user.credential_set_at || user.credential_hash),
    credential_set_at: user.credential_set_at || null,
    credential_revoked_at: user.credential_revoked_at || null,
    last_login_at: user.last_login_at || null,
    ativo: user.ativo !== false,
  };
}

export function createCredentialAuthManager(env = process.env, sessionManager) {
  const tenantSlug = clean(env.FITCORE_TENANT_SLUG || "demo", "demo", 80);
  const enabled = clean(env.FITCORE_CREDENTIAL_LOGIN_ENABLED || "false", "false", 12) === "true";
  const publicUrl = clean(env.FITCORE_PUBLIC_URL || "https://fitcore.marcaia.app", "https://fitcore.marcaia.app", 240);

  function recordAudit(context, acao, detalhe, recursoTipo = "auth", status = "ok", recursoId = null) {
    if (!context?.tenant_id || !context?.actor_id || !context?.actor_role) return { ok: false, skipped: "missing_context" };
    try {
      runSql(env, `
        WITH ${tenantScope(context)}
        INSERT INTO fitcore_audit_events (tenant_id, actor_id, actor_role, recurso_tipo, recurso_id, acao, status, detalhe)
        SELECT ${sqlText(context.tenant_id)}::uuid, ${sqlText(context.actor_id)}::uuid, ${sqlText(normalizeRole(context.actor_role))}, ${sqlText(recursoTipo)}, ${recursoId ? `${sqlText(recursoId)}::uuid` : "NULL"}, ${sqlText(acao)}, ${sqlText(status)}, ${sqlText(clean(detalhe, "MVP-19", 260))}
        FROM scope;
      `);
      return { ok: true, persisted: true };
    } catch (error) {
      return { ok: false, persisted: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  function recordSystemAudit(user, acao, detalhe, status = "ok") {
    if (!user?.tenant_id || !user?.id) return { ok: false, skipped: "missing_user" };
    return recordAudit({ tenant_id: user.tenant_id, actor_id: user.id, actor_role: user.papel || "aluno" }, acao, detalhe, "auth", status, user.id);
  }

  function currentProfile(context) {
    const signed = requireSigned(context);
    if (!signed.allowed) return { guard: signed };
    const raw = runSql(env, `
      WITH ${tenantScope(context)}
      SELECT jsonb_build_object(
        'id', id,
        'tenant_id', tenant_id,
        'nome', nome,
        'papel', papel,
        'login_identifier', login_identifier,
        'email', email,
        'telefone', telefone,
        'credential_kind', credential_kind,
        'credential_set_at', credential_set_at,
        'credential_revoked_at', credential_revoked_at,
        'last_login_at', last_login_at,
        'ativo', ativo
      )::text
      FROM fitcore_users, scope
      WHERE tenant_id = ${sqlText(context.tenant_id)}::uuid AND id = ${sqlText(context.actor_id)}::uuid
      LIMIT 1;
    `);
    const user = jsonScalar(raw);
    return { ok: true, mvp: "MVP-19 Credential Login", enabled, user: safeUser(user) };
  }

  function setCredential(context, input = {}) {
    if (!enabled) return { guard: { allowed: false, statusCode: 503, response: { erro: "credential_login_disabled", mensagem: "MVP-19 não está ativo." } } };
    const signed = requireSigned(context);
    if (!signed.allowed) return { guard: signed };
    const loginIdentifier = clean(input.login_identifier || input.identificador || "", "", 120).toLowerCase();
    const secret = input.secret || input.senha || input.codigo_acesso || input.access_code || "";
    const kind = clean(input.credential_kind || input.tipo || (String(secret).length <= 12 ? "access_code" : "password"), "password", 40) === "access_code" ? "access_code" : "password";
    if (loginIdentifier.length < 4) {
      return { guard: { allowed: false, statusCode: 400, response: { erro: "identificador_invalido", mensagem: "Informe identificador com pelo menos 4 caracteres." } } };
    }
    validateSecretPolicy(env, secret, loginIdentifier, kind);
    const credentialHash = hashSecret(secret);
    const raw = runSql(env, `
      WITH ${tenantScope(context)}, updated AS (
        UPDATE fitcore_users
        SET login_identifier = ${sqlText(loginIdentifier)}, credential_kind = ${sqlText(kind)}, credential_hash = ${sqlText(credentialHash)}, credential_set_at = now(), credential_revoked_at = NULL, atualizado_em = now()
        WHERE tenant_id = ${sqlText(context.tenant_id)}::uuid AND id = ${sqlText(context.actor_id)}::uuid AND ativo = true
        RETURNING id, tenant_id, nome, papel, login_identifier, credential_kind, credential_set_at, credential_revoked_at, last_login_at, ativo
      )
      SELECT jsonb_build_object('id', id, 'tenant_id', tenant_id, 'nome', nome, 'papel', papel, 'login_identifier', login_identifier, 'credential_kind', credential_kind, 'credential_set_at', credential_set_at, 'credential_revoked_at', credential_revoked_at, 'last_login_at', last_login_at, 'ativo', ativo)::text FROM updated;
    `);
    const user = jsonScalar(raw);
    recordAudit(context, "credential_set", `kind=${kind}; identifier=${loginIdentifier}`, "auth", "ok", user?.id);
    return { ok: true, mvp: "MVP-19 Credential Login", credential_set: true, user: safeUser(user), audit: { persisted: true } };
  }

  function resolveTenantByUniqueEmail(loginIdentifier) {
    const identifier = clean(loginIdentifier, "", 180).toLowerCase();
    if (!identifier.includes("@")) return { matches: [], tenant_slug: null };
    const raw = runSql(env, `
      SELECT COALESCE(jsonb_agg(jsonb_build_object('tenant_slug', t.slug, 'user_id', u.id) ORDER BY t.slug), '[]'::jsonb)::text
      FROM fitcore_users u
      JOIN fitcore_tenants t ON t.id = u.tenant_id
      WHERE lower(COALESCE(u.email, u.login_identifier)) = ${sqlText(identifier)}
        AND u.ativo = true
        AND u.credential_hash IS NOT NULL
        AND u.credential_revoked_at IS NULL;
    `);
    const matches = jsonScalar(raw) || [];
    return { matches, tenant_slug: matches.length === 1 ? matches[0].tenant_slug : null };
  }

  function findCredentialUser(loginIdentifier, candidateTenantSlug = tenantSlug) {
    const identifier = clean(loginIdentifier, "", 120).toLowerCase();
    const lookupTenantSlug = clean(candidateTenantSlug || tenantSlug, tenantSlug, 80);
    const raw = runSql(env, `
      WITH ${tenantCte(lookupTenantSlug)}
      SELECT jsonb_build_object(
        'id', u.id,
        'tenant_id', u.tenant_id,
        'tenant_slug', tenant.slug,
        'nome', u.nome,
        'papel', u.papel,
        'login_identifier', u.login_identifier,
        'email', u.email,
        'telefone', u.telefone,
        'credential_kind', u.credential_kind,
        'credential_hash', u.credential_hash,
        'credential_set_at', u.credential_set_at,
        'credential_revoked_at', u.credential_revoked_at,
        'ativo', u.ativo
      )::text
      FROM fitcore_users u, tenant, scope
      WHERE u.tenant_id = tenant.id
        AND lower(u.login_identifier) = ${sqlText(identifier)}
        AND u.ativo = true
      LIMIT 1;
    `);
    return jsonScalar(raw);
  }

  function credentialLogin(input = {}) {
    if (!enabled) return { guard: { allowed: false, statusCode: 503, response: { erro: "credential_login_disabled", mensagem: "MVP-19 não está ativo." } } };
    const loginIdentifier = clean(input.login_identifier || input.identificador || "", "", 180).toLowerCase();
    const secret = input.secret || input.senha || input.codigo_acesso || input.access_code || "";
    const requestedTenantSlug = clean(input.tenant_slug || input.tenant || "", "", 80);
    let lookupTenantSlug = requestedTenantSlug || tenantSlug;
    if (!requestedTenantSlug && loginIdentifier.includes("@")) {
      const resolved = resolveTenantByUniqueEmail(loginIdentifier);
      if (resolved.matches.length > 1) {
        return { guard: { allowed: false, statusCode: 409, response: { erro: "unidade_obrigatoria", mensagem: "Este e-mail pertence a mais de uma unidade. Informe a unidade para continuar." } } };
      }
      if (resolved.tenant_slug) lookupTenantSlug = resolved.tenant_slug;
    }
    const user = findCredentialUser(loginIdentifier, lookupTenantSlug);
    if (!user || !user.credential_hash || user.credential_revoked_at || !verifySecret(user.credential_hash, secret)) {
      if (user) recordSystemAudit(user, "credential_login_failed", `identifier=${loginIdentifier}`, "erro");
      return { guard: { allowed: false, statusCode: 401, response: { erro: "credencial_invalida", mensagem: "Identificador ou senha/código inválido." } } };
    }
    runSql(env, `WITH ${tenantCte(lookupTenantSlug)} UPDATE fitcore_users SET last_login_at = now(), atualizado_em = now() FROM tenant, scope WHERE fitcore_users.id = ${sqlText(user.id)}::uuid AND fitcore_users.tenant_id = tenant.id RETURNING fitcore_users.id;`);
    recordSystemAudit(user, "credential_login_ok", `identifier=${loginIdentifier}`, "ok");
    const created = sessionManager.createSessionForUserRecord({ ...user, tenant_slug: user.tenant_slug || lookupTenantSlug }, { source: "mvp19_credential", tenant_slug: user.tenant_slug || lookupTenantSlug });
    return { ok: true, mvp: "MVP-19 Credential Login", login: true, credential_login: true, session: created.session, cookie: created.cookie, user: safeUser(user) };
  }

  function revokeCredential(context, input = {}) {
    if (!enabled) return { guard: { allowed: false, statusCode: 503, response: { erro: "credential_login_disabled" } } };
    const signed = requireSigned(context);
    if (!signed.allowed) return { guard: signed };
    const targetUserId = clean(input.user_id || context.actor_id, context.actor_id, 80);
    if (targetUserId !== context.actor_id && normalizeRole(context.actor_role) !== "gestor") {
      return { guard: { allowed: false, statusCode: 403, response: { erro: "acesso_negado", mensagem: "Somente gestor pode revogar credencial de outro usuário." } } };
    }
    const raw = runSql(env, `
      WITH ${tenantScope(context)}, updated AS (
        UPDATE fitcore_users
        SET credential_revoked_at = now(), credential_hash = NULL, atualizado_em = now()
        WHERE tenant_id = ${sqlText(context.tenant_id)}::uuid AND id = ${sqlText(targetUserId)}::uuid
        RETURNING id, tenant_id, nome, papel, login_identifier, credential_kind, credential_set_at, credential_revoked_at, last_login_at, ativo
      )
      SELECT jsonb_build_object('id', id, 'tenant_id', tenant_id, 'nome', nome, 'papel', papel, 'login_identifier', login_identifier, 'credential_kind', credential_kind, 'credential_set_at', credential_set_at, 'credential_revoked_at', credential_revoked_at, 'last_login_at', last_login_at, 'ativo', ativo)::text FROM updated;
    `);
    const user = jsonScalar(raw);
    recordAudit(context, "credential_revoked", `target=${targetUserId}`, "auth", "ok", user?.id);
    return { ok: true, mvp: "MVP-19 Credential Login", credential_revoked: true, user: safeUser(user) };
  }

  function requestRecovery(input = {}) {
    if (!enabled) return { guard: { allowed: false, statusCode: 503, response: { erro: "credential_login_disabled" } } };
    const loginIdentifier = clean(input.login_identifier || input.identificador || "", "", 120).toLowerCase();
    const lookupTenantSlug = clean(input.tenant_slug || input.tenant || tenantSlug, tenantSlug, 80);
    const user = findCredentialUser(loginIdentifier, lookupTenantSlug);
    if (!user) {
      return { ok: true, mvp: "MVP-19 Credential Login", recovery_requested: true, delivered: false, message: "Se o usuário existir, um token de recuperação será emitido pelo canal configurado." };
    }
    const token = randomBytes(32).toString("base64url");
    const tokenHash = sha256(token);
    const raw = runSql(env, `
      WITH ${tenantCte(tenantSlug)}, created AS (
        INSERT INTO fitcore_user_recovery_tokens (tenant_id, user_id, token_hash, expires_at)
        SELECT tenant.id, ${sqlText(user.id)}::uuid, ${sqlText(tokenHash)}, now() + interval '1 hour'
        FROM tenant, scope
        RETURNING id, expires_at
      )
      SELECT jsonb_build_object('id', id, 'expires_at', expires_at)::text FROM created;
    `);
    const recovery = jsonScalar(raw);
    recordSystemAudit(user, "recovery_requested", `identifier=${loginIdentifier}; token=${recovery?.id}`, "pendente");
    return {
      ok: true,
      mvp: "MVP-19 Credential Login",
      recovery_requested: true,
      delivered: "demo_response",
      token,
      recovery_link: `${publicUrl}/mvp-19.html?tenant_slug=${encodeURIComponent(lookupTenantSlug)}&recovery=${encodeURIComponent(token)}`,
      recovery: { id: recovery?.id, expires_at: recovery?.expires_at },
    };
  }

  function completeRecovery(input = {}) {
    if (!enabled) return { guard: { allowed: false, statusCode: 503, response: { erro: "credential_login_disabled" } } };
    const token = clean(input.token || input.recovery_token || "", "", 500);
    const secret = input.new_secret || input.senha || input.codigo_acesso || input.secret || "";
    const kind = clean(input.credential_kind || "password", "password", 40) === "access_code" ? "access_code" : "password";
    validateSecretPolicy(env, secret, "", kind);
    const lookupTenantSlug = clean(input.tenant_slug || input.tenant || tenantSlug, tenantSlug, 80);
    const tokenHash = sha256(token);
    const credentialHash = hashSecret(secret);
    const raw = runSql(env, `
      WITH ${tenantCte(lookupTenantSlug)}, target AS (
        SELECT r.id AS recovery_id, u.id, u.tenant_id, u.nome, u.papel
        FROM fitcore_user_recovery_tokens r
        JOIN fitcore_users u ON u.id = r.user_id AND u.tenant_id = r.tenant_id
        JOIN tenant ON tenant.id = r.tenant_id
        JOIN scope ON true
        WHERE r.token_hash = ${sqlText(tokenHash)} AND r.status = 'pendente' AND r.expires_at > now() AND u.ativo = true
        LIMIT 1
      ), updated_user AS (
        UPDATE fitcore_users u
        SET credential_hash = ${sqlText(credentialHash)}, credential_kind = ${sqlText(kind)}, credential_set_at = now(), credential_revoked_at = NULL, atualizado_em = now()
        FROM target
        WHERE u.id = target.id AND u.tenant_id = target.tenant_id
        RETURNING u.id, u.tenant_id, u.nome, u.papel, u.login_identifier, u.credential_kind, u.credential_set_at, u.credential_revoked_at, u.last_login_at, u.ativo
      ), used AS (
        UPDATE fitcore_user_recovery_tokens r
        SET status = 'usado', usado_em = now(), atualizado_em = now()
        FROM target
        WHERE r.id = target.recovery_id
        RETURNING r.id
      )
      SELECT jsonb_build_object('id', id, 'tenant_id', tenant_id, 'nome', nome, 'papel', papel, 'login_identifier', login_identifier, 'credential_kind', credential_kind, 'credential_set_at', credential_set_at, 'credential_revoked_at', credential_revoked_at, 'last_login_at', last_login_at, 'ativo', ativo)::text FROM updated_user;
    `);
    const user = jsonScalar(raw);
    if (!user) return { guard: { allowed: false, statusCode: 400, response: { erro: "recovery_token_invalido", mensagem: "Token inválido, expirado ou já usado." } } };
    recordSystemAudit(user, "recovery_completed", `identifier=${user.login_identifier}`, "ok");
    const created = sessionManager.createSessionForUserRecord(user, { source: "mvp19_recovery" });
    return { ok: true, mvp: "MVP-19 Credential Login", recovery_completed: true, session: created.session, cookie: created.cookie, user: safeUser(user) };
  }

  function publicHealth(context = {}) {
    return {
      ok: true,
      mvp: "MVP-19 Credential Login",
      enabled,
      tenant_slug: context?.tenant_slug || tenantSlug,
      session_signed: Boolean(context?.session_signed),
      actor_role: context?.actor_role || null,
      invite_not_only_entry: true,
      demo_replacement_ready: true,
      recovery_and_revocation: true,
      credential_storage: "scrypt_hash_salted_no_plaintext",
      credential_policy: clean(env.FITCORE_AUTH_HARDENING_ENABLED || "false", "false", 12) === "true" ? "strict" : "basic",
      endpoints: [
        "GET /api/mvp-19/status",
        "GET /api/mvp-19/credentials/me",
        "POST /api/mvp-19/credentials/set",
        "POST /api/mvp-19/login",
        "POST /api/mvp-19/recovery/request",
        "POST /api/mvp-19/recovery/complete",
        "POST /api/mvp-19/credentials/revoke",
      ],
    };
  }

  return { enabled, publicHealth, currentProfile, setCredential, credentialLogin, revokeCredential, requestRecovery, completeRecovery, requireGestor };
}
