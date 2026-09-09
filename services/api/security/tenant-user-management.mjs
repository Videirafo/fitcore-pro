// FITCORE PRO — MVP-22
// Gestão real de usuários por tenant: criação, convite, credencial, isolamento e auditoria.

import { execFileSync } from "node:child_process";
import { createHash, randomBytes, scryptSync } from "node:crypto";
import { normalizeRole } from "./access-context.mjs";

const USER_ROLES = new Set(["professor", "aluno"]);

function clean(value, fallback = "", max = 240) {
  const text = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
  return text || fallback;
}

function displayClean(value, fallback = "", max = 240) {
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

function sqlJson(value) {
  return `${sqlText(JSON.stringify(value ?? {}))}::jsonb`;
}

function sha256(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

function jsonScalar(value) {
  const text = String(value || "").trim();
  return text ? JSON.parse(text) : null;
}

function boolEnv(value, fallback = false) {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  return ["1", "true", "yes", "on", "sim"].includes(String(value).trim().toLowerCase());
}

function hashSecret(secret) {
  const value = String(secret || "").trim();
  if (value && value.length < 8) {
    const error = new Error("A senha/código precisa ter pelo menos 8 caracteres.");
    error.statusCode = 400;
    throw error;
  }
  if (!value) return null;
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(value, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
  return `scrypt:16384:8:1:${salt}:${hash}`;
}

function dbConnection(env = process.env) {
  const dbUrl = clean(env.FITCORE_DATABASE_URL || env.DATABASE_URL || "", "", 900);
  if (!dbUrl) throw new Error("FITCORE_DATABASE_URL ausente para MVP-22.");
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
    timeout: 25000,
    maxBuffer: 10 * 1024 * 1024,
  }).trim();
}

function scalar(env, sql) {
  return runSql(env, sql).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1) || "";
}

function requireGestor(context = {}) {
  if (!context?.session_signed || !context?.tenant_id) {
    return { allowed: false, statusCode: 401, response: { erro: "sessao_obrigatoria", mensagem: "Faça login como gestor do tenant." } };
  }
  if (normalizeRole(context.actor_role) !== "gestor") {
    return { allowed: false, statusCode: 403, response: { erro: "acesso_negado", mensagem: "Somente gestor administra usuários do tenant.", papel: context.actor_role } };
  }
  return { allowed: true };
}

function tenantScope(context) {
  if (!context?.tenant_id) throw new Error("tenant_id ausente na sessão assinada.");
  return `scope AS (SELECT set_config('app.tenant_id', ${sqlText(context.tenant_id)}, true))`;
}

function tenantCteBySlug(tenantSlug) {
  return `tenant AS (SELECT id, slug FROM fitcore_tenants WHERE slug = ${sqlText(tenantSlug)} LIMIT 1), scope AS (SELECT set_config('app.tenant_id', (SELECT id::text FROM tenant), true))`;
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    tenant_id: user.tenant_id,
    tenant_slug: user.tenant_slug || null,
    nome: user.nome,
    papel: user.papel,
    ativo: user.ativo !== false,
    login_identifier: user.login_identifier || null,
    credential_set: Boolean(user.credential_set_at || user.credential_hash),
    credential_kind: user.credential_kind || null,
    last_login_at: user.last_login_at || null,
    criado_em: user.criado_em || null,
  };
}

function publicInvite(invite, includeToken = false, token = null, publicUrl = "") {
  if (!invite) return null;
  const base = {
    id: invite.id,
    tenant_id: invite.tenant_id,
    tenant_slug: invite.tenant_slug,
    nome_convidado: invite.nome_convidado,
    papel: invite.papel,
    status: invite.status,
    expires_at: invite.expires_at,
    aceito_em: invite.aceito_em || null,
    login_identifier_hint: invite.login_identifier_hint || null,
    criado_em: invite.criado_em || null,
  };
  if (includeToken && token) {
    base.token = token;
    base.invite_link = `/mvp-22.html?tenant_slug=${encodeURIComponent(invite.tenant_slug)}&token=${encodeURIComponent(token)}`;
    base.full_invite_url = `${publicUrl}/mvp-22.html?tenant_slug=${encodeURIComponent(invite.tenant_slug)}&token=${encodeURIComponent(token)}`;
  }
  return base;
}

export function createTenantUserManagement(env = process.env, sessionManager) {
  const enabled = boolEnv(env.FITCORE_TENANT_USER_MANAGEMENT_ENABLED, true);
  const publicUrl = clean(env.FITCORE_PUBLIC_URL || "https://fitcore.marcaia.app", "https://fitcore.marcaia.app", 240);

  function status(context = {}) {
    return {
      ok: true,
      mvp: "MVP-22 Tenant User Management",
      enabled,
      tenant_slug: context?.tenant_slug || null,
      actor_role: context?.actor_role || null,
      tenant_scoped: true,
      cross_tenant_block: true,
      invite_accepts_tenant_slug: true,
      next_ready_frontend: true,
      endpoints: [
        "GET /api/mvp-22/status",
        "GET /api/mvp-22/users",
        "POST /api/mvp-22/users",
        "POST /api/mvp-22/users/invite",
        "GET /api/mvp-22/invites/inspect?tenant_slug=...&token=...",
        "POST /api/mvp-22/invites/accept",
      ],
    };
  }

  function assertRequestedTenant(context = {}, requestedSlug = "") {
    const requested = clean(requestedSlug || "", "", 80);
    if (requested && requested !== context.tenant_slug) {
      return { allowed: false, statusCode: 403, response: { erro: "tenant_cross_access_blocked", mensagem: "A sessão só pode administrar o próprio tenant.", session_tenant_slug: context.tenant_slug, requested_tenant_slug: requested } };
    }
    return { allowed: true };
  }

  function recordEvent(context = {}, event = {}) {
    if (!context?.tenant_id) return { ok: false, skipped: "missing_tenant" };
    const actorSql = context.actor_id ? `${sqlText(context.actor_id)}::uuid` : "NULL";
    const targetSql = event.target_user_id ? `${sqlText(event.target_user_id)}::uuid` : "NULL";
    const inviteSql = event.invite_id ? `${sqlText(event.invite_id)}::uuid` : "NULL";
    const evento = clean(event.evento || event.acao || "tenant_user_event", "tenant_user_event", 90);
    const detalhe = displayClean(event.detalhe || "MVP-22 gestão de usuários", "MVP-22 gestão de usuários", 420);
    const statusValue = clean(event.status || "ok", "ok", 40);
    try {
      runSql(env, `
        WITH ${tenantScope(context)}, created AS (
          INSERT INTO fitcore_tenant_user_events (tenant_id, actor_id, target_user_id, invite_id, evento, status, detalhe, payload)
          SELECT ${sqlText(context.tenant_id)}::uuid, ${actorSql}, ${targetSql}, ${inviteSql}, ${sqlText(evento)}, ${sqlText(statusValue)}, ${sqlText(detalhe)}, ${sqlJson(event.payload || {})}
          FROM scope
          RETURNING id
        ), audit AS (
          INSERT INTO fitcore_audit_events (tenant_id, actor_id, actor_role, recurso_tipo, recurso_id, acao, status, detalhe)
          SELECT ${sqlText(context.tenant_id)}::uuid, ${actorSql}, ${sqlText(normalizeRole(context.actor_role || "sistema"))}, 'tenant_user', COALESCE(${targetSql}, ${inviteSql}), ${sqlText(evento)}, ${sqlText(statusValue)}, ${sqlText(detalhe)}
          FROM scope
        ) SELECT count(*)::text FROM created;
      `);
      return { ok: true, persisted: true };
    } catch (error) {
      return { ok: false, persisted: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  function listUsers(context = {}, url = null) {
    if (!enabled) return { guard: { allowed: false, statusCode: 503, response: { erro: "tenant_user_management_disabled" } } };
    const guard = requireGestor(context);
    if (!guard.allowed) return { guard };
    const tenantGuard = assertRequestedTenant(context, url?.searchParams?.get("tenant_slug") || url?.searchParams?.get("tenant") || "");
    if (!tenantGuard.allowed) return { guard: tenantGuard };
    const raw = scalar(env, `
      WITH ${tenantScope(context)}
      SELECT jsonb_build_object(
        'users', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', u.id,
            'tenant_id', u.tenant_id,
            'tenant_slug', ${sqlText(context.tenant_slug || "")},
            'nome', u.nome,
            'papel', u.papel,
            'ativo', u.ativo,
            'login_identifier', u.login_identifier,
            'credential_kind', u.credential_kind,
            'credential_set_at', u.credential_set_at,
            'last_login_at', u.last_login_at,
            'criado_em', u.criado_em
          ) ORDER BY u.criado_em DESC)
          FROM fitcore_users u WHERE u.tenant_id = ${sqlText(context.tenant_id)}::uuid
        ), '[]'::jsonb),
        'invites', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', i.id,
            'tenant_id', i.tenant_id,
            'tenant_slug', ${sqlText(context.tenant_slug || "")},
            'nome_convidado', i.nome_convidado,
            'papel', i.papel,
            'status', i.status,
            'expires_at', i.expires_at,
            'aceito_em', i.aceito_em,
            'login_identifier_hint', i.login_identifier_hint,
            'criado_em', i.criado_em
          ) ORDER BY i.criado_em DESC)
          FROM fitcore_user_invites i WHERE i.tenant_id = ${sqlText(context.tenant_id)}::uuid
        ), '[]'::jsonb),
        'events', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('evento', e.evento, 'status', e.status, 'detalhe', e.detalhe, 'criado_em', e.criado_em) ORDER BY e.criado_em DESC)
          FROM (SELECT * FROM fitcore_tenant_user_events WHERE tenant_id = ${sqlText(context.tenant_id)}::uuid ORDER BY criado_em DESC LIMIT 20) e
        ), '[]'::jsonb)
      )::text
      FROM scope;
    `);
    const data = jsonScalar(raw) || { users: [], invites: [], events: [] };
    return { ok: true, mvp: "MVP-22 Tenant User Management", tenant_slug: context.tenant_slug, users: data.users.map(publicUser), total_users: data.users.length, invites: data.invites, total_invites: data.invites.length, events: data.events, total_events: data.events.length };
  }

  function createUser(context = {}, input = {}) {
    if (!enabled) return { guard: { allowed: false, statusCode: 503, response: { erro: "tenant_user_management_disabled" } } };
    const guard = requireGestor(context);
    if (!guard.allowed) return { guard };
    const tenantGuard = assertRequestedTenant(context, input.tenant_slug || input.tenant || "");
    if (!tenantGuard.allowed) return { guard: tenantGuard };
    const role = normalizeRole(input.papel || input.role || "professor");
    if (!USER_ROLES.has(role)) return { guard: { allowed: false, statusCode: 400, response: { erro: "papel_invalido", mensagem: "Use professor ou aluno." } } };
    const nome = displayClean(input.nome || input.name || `${role} do tenant`, `${role} do tenant`, 120);
    const loginIdentifier = clean(input.login_identifier || input.identificador || "", "", 120).toLowerCase();
    const credentialHash = hashSecret(input.secret || input.senha || input.codigo_acesso || "");
    const credentialKind = clean(input.credential_kind || (credentialHash ? "password" : "password"), "password", 40) === "access_code" ? "access_code" : "password";
    if (loginIdentifier && loginIdentifier.length < 4) return { guard: { allowed: false, statusCode: 400, response: { erro: "identificador_invalido" } } };

    const externalId = clean(input.externo_id || `mvp22-${role}-${Date.now()}-${randomBytes(3).toString("hex")}`, "", 140);
    const raw = scalar(env, `
      WITH ${tenantScope(context)}, upsert_user AS (
        INSERT INTO fitcore_users (tenant_id, nome, papel, externo_id, ativo, login_identifier, credential_kind, credential_hash, credential_set_at, atualizado_em)
        SELECT ${sqlText(context.tenant_id)}::uuid, ${sqlText(nome)}, ${sqlText(role)}, ${sqlText(externalId)}, true, ${loginIdentifier ? sqlText(loginIdentifier) : "NULL"}, ${sqlText(credentialKind)}, ${credentialHash ? sqlText(credentialHash) : "NULL"}, ${credentialHash ? "now()" : "NULL"}, now()
        FROM scope
        ON CONFLICT (tenant_id, externo_id) DO UPDATE SET nome = EXCLUDED.nome, papel = EXCLUDED.papel, ativo = true, login_identifier = COALESCE(EXCLUDED.login_identifier, fitcore_users.login_identifier), credential_hash = COALESCE(EXCLUDED.credential_hash, fitcore_users.credential_hash), credential_set_at = COALESCE(EXCLUDED.credential_set_at, fitcore_users.credential_set_at), atualizado_em = now()
        RETURNING id, tenant_id, nome, papel, ativo, login_identifier, credential_kind, credential_set_at, last_login_at, criado_em
      )
      SELECT jsonb_build_object('id', id, 'tenant_id', tenant_id, 'tenant_slug', ${sqlText(context.tenant_slug || "")}, 'nome', nome, 'papel', papel, 'ativo', ativo, 'login_identifier', login_identifier, 'credential_kind', credential_kind, 'credential_set_at', credential_set_at, 'last_login_at', last_login_at, 'criado_em', criado_em)::text
      FROM upsert_user;
    `);
    const user = jsonScalar(raw);
    const audit = recordEvent(context, { evento: "tenant_user_created", target_user_id: user?.id, detalhe: `papel=${role}; login=${loginIdentifier || "pendente"}`, payload: { role, credential_set: Boolean(credentialHash) } });
    return { ok: true, mvp: "MVP-22 Tenant User Management", created: true, tenant_slug: context.tenant_slug, user: publicUser(user), audit };
  }

  function createInvite(context = {}, input = {}) {
    if (!enabled) return { guard: { allowed: false, statusCode: 503, response: { erro: "tenant_user_management_disabled" } } };
    const guard = requireGestor(context);
    if (!guard.allowed) return { guard };
    const tenantGuard = assertRequestedTenant(context, input.tenant_slug || input.tenant || "");
    if (!tenantGuard.allowed) return { guard: tenantGuard };
    const role = normalizeRole(input.papel || input.role || "aluno");
    if (!USER_ROLES.has(role)) return { guard: { allowed: false, statusCode: 400, response: { erro: "papel_invalido", mensagem: "Convite aceita professor ou aluno." } } };
    const nome = displayClean(input.nome || input.nome_convidado || `${role} convidado`, `${role} convidado`, 120);
    const loginIdentifierHint = clean(input.login_identifier || input.login_identifier_hint || "", "", 120).toLowerCase();
    const ttlHours = Math.min(Math.max(Number.parseInt(input.ttl_horas || input.ttl_hours || "72", 10) || 72, 1), 168);
    const token = randomBytes(32).toString("base64url");
    const tokenHash = sha256(token);
    const raw = scalar(env, `
      WITH ${tenantScope(context)}, created AS (
        INSERT INTO fitcore_user_invites (tenant_id, criado_por, nome_convidado, papel, token_hash, expires_at, login_identifier_hint, source_mvp, payload)
        SELECT ${sqlText(context.tenant_id)}::uuid, ${sqlText(context.actor_id)}::uuid, ${sqlText(nome)}, ${sqlText(role)}, ${sqlText(tokenHash)}, now() + (${ttlHours} || ' hours')::interval, ${loginIdentifierHint ? sqlText(loginIdentifierHint) : "NULL"}, 'mvp22', ${sqlJson({ tenant_slug: context.tenant_slug, login_identifier_hint: loginIdentifierHint || null })}
        FROM scope
        RETURNING id, tenant_id, nome_convidado, papel, status, expires_at, aceito_em, login_identifier_hint, criado_em
      )
      SELECT jsonb_build_object('id', id, 'tenant_id', tenant_id, 'tenant_slug', ${sqlText(context.tenant_slug || "")}, 'nome_convidado', nome_convidado, 'papel', papel, 'status', status, 'expires_at', expires_at, 'aceito_em', aceito_em, 'login_identifier_hint', login_identifier_hint, 'criado_em', criado_em)::text FROM created;
    `);
    const invite = jsonScalar(raw);
    const audit = recordEvent(context, { evento: "tenant_user_invite_created", invite_id: invite?.id, detalhe: `papel=${role}; convite=${invite?.id}`, payload: { role } });
    return { ok: true, mvp: "MVP-22 Tenant User Management", invite: publicInvite(invite, true, token, publicUrl), token, audit };
  }

  function inspectInvite(input = {}) {
    const token = clean(input.token || "", "", 500);
    const tenantSlug = clean(input.tenant_slug || input.tenant || "", "", 80);
    if (!token || !tenantSlug) return { ok: false, statusCode: 400, erro: "tenant_token_obrigatorio", mensagem: "Informe tenant_slug e token." };
    const tokenHash = sha256(token);
    const raw = scalar(env, `
      WITH ${tenantCteBySlug(tenantSlug)}
      SELECT jsonb_build_object(
        'id', i.id,
        'tenant_id', i.tenant_id,
        'tenant_slug', tenant.slug,
        'nome_convidado', i.nome_convidado,
        'papel', i.papel,
        'status', i.status,
        'expires_at', i.expires_at,
        'aceito_em', i.aceito_em,
        'login_identifier_hint', i.login_identifier_hint,
        'criado_em', i.criado_em
      )::text
      FROM fitcore_user_invites i, tenant, scope
      WHERE i.tenant_id = tenant.id AND i.token_hash = ${sqlText(tokenHash)}
      LIMIT 1;
    `);
    const invite = jsonScalar(raw);
    if (!invite) return { ok: false, statusCode: 404, erro: "convite_nao_encontrado" };
    const expired = new Date(invite.expires_at).getTime() <= Date.now();
    return { ok: true, mvp: "MVP-22 Tenant User Management", invite: { ...publicInvite(invite), expirado: expired }, can_accept: invite.status === "pendente" && !expired };
  }

  function acceptInvite(input = {}) {
    if (!enabled) return { guard: { allowed: false, statusCode: 503, response: { erro: "tenant_user_management_disabled" } } };
    const inspected = inspectInvite(input);
    if (!inspected.ok) return { guard: { allowed: false, statusCode: inspected.statusCode || 400, response: inspected } };
    if (!inspected.can_accept) return { guard: { allowed: false, statusCode: 409, response: { erro: "convite_indisponivel", invite: inspected.invite } } };
    const invite = inspected.invite;
    const nome = displayClean(input.nome || input.actor_name || invite.nome_convidado, invite.nome_convidado, 120);
    const loginIdentifier = clean(input.login_identifier || input.identificador || invite.login_identifier_hint || "", "", 120).toLowerCase();
    if (loginIdentifier.length < 4) return { guard: { allowed: false, statusCode: 400, response: { erro: "identificador_invalido", mensagem: "Defina identificador com pelo menos 4 caracteres." } } };
    const credentialHash = hashSecret(input.secret || input.senha || input.codigo_acesso || "");
    if (!credentialHash) return { guard: { allowed: false, statusCode: 400, response: { erro: "credencial_obrigatoria", mensagem: "Defina senha/código para aceitar o convite." } } };
    const credentialKind = clean(input.credential_kind || "password", "password", 40) === "access_code" ? "access_code" : "password";

    const raw = scalar(env, `
      WITH ${tenantCteBySlug(invite.tenant_slug)}, invite_row AS (
        SELECT i.* FROM fitcore_user_invites i, tenant, scope
        WHERE i.tenant_id = tenant.id AND i.id = ${sqlText(invite.id)}::uuid AND i.status = 'pendente' AND i.expires_at > now()
        LIMIT 1
      ), upsert_user AS (
        INSERT INTO fitcore_users (tenant_id, nome, papel, externo_id, ativo, login_identifier, credential_kind, credential_hash, credential_set_at, atualizado_em)
        SELECT tenant.id, ${sqlText(nome)}, (SELECT papel FROM invite_row), ${sqlText(`mvp22-invite-${invite.id}`)}, true, ${sqlText(loginIdentifier)}, ${sqlText(credentialKind)}, ${sqlText(credentialHash)}, now(), now()
        FROM tenant, invite_row, scope
        ON CONFLICT (tenant_id, externo_id) DO UPDATE SET nome = EXCLUDED.nome, papel = EXCLUDED.papel, ativo = true, login_identifier = EXCLUDED.login_identifier, credential_kind = EXCLUDED.credential_kind, credential_hash = EXCLUDED.credential_hash, credential_set_at = now(), credential_revoked_at = NULL, atualizado_em = now()
        RETURNING id, tenant_id, nome, papel, ativo, login_identifier, credential_kind, credential_set_at, last_login_at, criado_em
      ), accepted AS (
        UPDATE fitcore_user_invites i
        SET status = 'aceito', aceito_por = (SELECT id FROM upsert_user), aceito_em = now(), atualizado_em = now()
        FROM tenant, scope
        WHERE i.tenant_id = tenant.id AND i.id = ${sqlText(invite.id)}::uuid AND i.status = 'pendente'
        RETURNING i.id
      ), tenant_event AS (
        INSERT INTO fitcore_tenant_user_events (tenant_id, actor_id, target_user_id, invite_id, evento, status, detalhe, payload)
        SELECT tenant.id, (SELECT id FROM upsert_user), (SELECT id FROM upsert_user), ${sqlText(invite.id)}::uuid, 'tenant_user_invite_accepted', 'ok', ${sqlText(`tenant=${invite.tenant_slug}; login=${loginIdentifier}`)}, ${sqlJson({ source: "mvp22_invite_accept" })}
        FROM tenant, scope
      ), audit AS (
        INSERT INTO fitcore_audit_events (tenant_id, actor_id, actor_role, recurso_tipo, recurso_id, acao, status, detalhe)
        SELECT tenant.id, (SELECT id FROM upsert_user), (SELECT papel FROM upsert_user), 'tenant_user', (SELECT id FROM upsert_user), 'tenant_user_invite_accepted', 'ok', ${sqlText(`convite=${invite.id}; tenant=${invite.tenant_slug}`)}
        FROM tenant, scope
      )
      SELECT jsonb_build_object('id', id, 'tenant_id', tenant_id, 'tenant_slug', ${sqlText(invite.tenant_slug)}, 'nome', nome, 'papel', papel, 'ativo', ativo, 'login_identifier', login_identifier, 'credential_kind', credential_kind, 'credential_set_at', credential_set_at, 'last_login_at', last_login_at, 'criado_em', criado_em)::text FROM upsert_user;
    `);
    const user = jsonScalar(raw);
    if (!user) return { guard: { allowed: false, statusCode: 409, response: { erro: "convite_indisponivel" } } };
    const created = sessionManager.createSessionForUserRecord(user, { source: "mvp22_invite", tenant_slug: invite.tenant_slug });
    return { ok: true, mvp: "MVP-22 Tenant User Management", accepted: true, invite: { id: invite.id, tenant_slug: invite.tenant_slug, papel: invite.papel }, user: publicUser(user), session: created.session, cookie: created.cookie };
  }

  function crossTenantCheck(context = {}, url = null) {
    const guard = requireGestor(context);
    if (!guard.allowed) return { guard };
    const requested = clean(url?.searchParams?.get("tenant_slug") || url?.searchParams?.get("tenant") || "", "", 80);
    const tenantGuard = assertRequestedTenant(context, requested);
    if (!tenantGuard.allowed) return { guard: tenantGuard };
    return { ok: true, mvp: "MVP-22 Tenant User Management", cross_tenant_block: true, tenant_slug: context.tenant_slug, requested_tenant_slug: requested || context.tenant_slug };
  }

  return { enabled, status, listUsers, createUser, createInvite, inspectInvite, acceptInvite, crossTenantCheck };
}
