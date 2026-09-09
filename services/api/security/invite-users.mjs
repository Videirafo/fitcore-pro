// FITCORE PRO — MVP-18
// Perfis reais e convites por token. O papel final vem do PostgreSQL, não de headers.

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { normalizeRole } from "./access-context.mjs";

function clean(value, fallback = "", max = 220) {
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
  if (!dbUrl) throw new Error("FITCORE_DATABASE_URL ausente para MVP-18.");
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
    maxBuffer: 4 * 1024 * 1024,
  }).trim();
}

function tenantScope(context) {
  if (!context?.tenant_id) throw new Error("tenant_id ausente na sessão assinada.");
  return `scope AS (SELECT set_config('app.tenant_id', ${sqlText(context.tenant_id)}, true))`;
}

function requireGestor(context, signedMode = true) {
  if (signedMode && !context?.session_signed) {
    return { allowed: false, statusCode: 401, response: { erro: "sessao_obrigatoria", mensagem: "Faça login como gestor para gerenciar usuários." } };
  }
  if (normalizeRole(context?.actor_role) !== "gestor") {
    return { allowed: false, statusCode: 403, response: { erro: "acesso_negado", mensagem: "Somente gestor pode criar usuários e convites.", papel: context?.actor_role || "desconhecido" } };
  }
  return { allowed: true };
}

export function createInviteUserManager(env = process.env, sessionManager) {
  const tenantSlug = clean(env.FITCORE_TENANT_SLUG || "demo", "demo", 80);

  function recordAudit(context, acao, detalhe, recursoTipo = "user_invite", status = "ok", recursoId = null) {
    if (!context?.tenant_id || !context?.actor_id || !context?.actor_role) return { ok: false, skipped: "missing_context" };
    try {
      runSql(env, `
        WITH ${tenantScope(context)}
        INSERT INTO fitcore_audit_events (tenant_id, actor_id, actor_role, recurso_tipo, recurso_id, acao, status, detalhe)
        SELECT ${sqlText(context.tenant_id)}::uuid, ${sqlText(context.actor_id)}::uuid, ${sqlText(normalizeRole(context.actor_role))}, ${sqlText(recursoTipo)}, ${recursoId ? `${sqlText(recursoId)}::uuid` : "NULL"}, ${sqlText(acao)}, ${sqlText(status)}, ${sqlText(clean(detalhe, "MVP-18", 240))}
        FROM scope;
      `);
      return { ok: true, persisted: true };
    } catch (error) {
      return { ok: false, persisted: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  function listUsers(context) {
    const guard = requireGestor(context, Boolean(sessionManager?.signedMode));
    if (!guard.allowed) return { guard };
    const raw = runSql(env, `
      WITH ${tenantScope(context)}
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', u.id,
        'nome', u.nome,
        'papel', u.papel,
        'ativo', u.ativo,
        'externo_id', u.externo_id,
        'criado_em', u.criado_em,
        'atualizado_em', u.atualizado_em
      ) ORDER BY u.criado_em DESC), '[]'::jsonb)::text
      FROM fitcore_users u, scope
      WHERE u.tenant_id = ${sqlText(context.tenant_id)}::uuid;
    `);
    const users = jsonScalar(raw) || [];
    return { ok: true, users, total: users.length };
  }

  function listInvites(context) {
    const guard = requireGestor(context, Boolean(sessionManager?.signedMode));
    if (!guard.allowed) return { guard };
    const raw = runSql(env, `
      WITH ${tenantScope(context)}
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', id,
        'nome_convidado', nome_convidado,
        'papel', papel,
        'status', status,
        'expires_at', expires_at,
        'aceito_em', aceito_em,
        'criado_em', criado_em
      ) ORDER BY criado_em DESC), '[]'::jsonb)::text
      FROM fitcore_user_invites, scope
      WHERE tenant_id = ${sqlText(context.tenant_id)}::uuid;
    `);
    const invites = jsonScalar(raw) || [];
    return { ok: true, invites, total: invites.length };
  }

  function createInvite(context, input = {}) {
    const guard = requireGestor(context, Boolean(sessionManager?.signedMode));
    if (!guard.allowed) return { guard };
    const role = normalizeRole(input.papel || input.role || "professor");
    if (!["professor", "aluno"].includes(role)) {
      return { guard: { allowed: false, statusCode: 400, response: { erro: "papel_invalido", mensagem: "Convite MVP-18 aceita professor ou aluno." } } };
    }
    const nome = clean(input.nome || input.nome_convidado || input.actor_name || `${role} convidado`, `${role} convidado`, 120);
    const ttlHours = Math.min(Math.max(Number.parseInt(input.ttl_horas || input.ttl_hours || "72", 10) || 72, 1), 168);
    const token = randomBytes(32).toString("base64url");
    const tokenHash = sha256(token);
    const raw = runSql(env, `
      WITH ${tenantScope(context)}, created AS (
        INSERT INTO fitcore_user_invites (tenant_id, criado_por, nome_convidado, papel, token_hash, expires_at)
        SELECT ${sqlText(context.tenant_id)}::uuid, ${sqlText(context.actor_id)}::uuid, ${sqlText(nome)}, ${sqlText(role)}, ${sqlText(tokenHash)}, now() + (${ttlHours} || ' hours')::interval
        FROM scope
        RETURNING id, nome_convidado, papel, status, expires_at, criado_em
      )
      SELECT jsonb_build_object('id', id, 'nome_convidado', nome_convidado, 'papel', papel, 'status', status, 'expires_at', expires_at, 'criado_em', criado_em)::text FROM created;
    `);
    const invite = jsonScalar(raw);
    recordAudit(context, "convite_criado", `papel=${role}; convite=${invite.id}`, "user_invite", "pendente", invite.id);
    return {
      ok: true,
      mvp: "MVP-18 User Invites",
      invite,
      token,
      invite_link: `/mvp-18.html?token=${encodeURIComponent(token)}`,
      full_invite_url: `${clean(env.FITCORE_PUBLIC_URL || "https://fitcore.marcaia.app", "https://fitcore.marcaia.app", 240)}/mvp-18.html?token=${encodeURIComponent(token)}`,
      audit: { created: true },
    };
  }

  function inspectInvite(token) {
    const tokenValue = clean(token, "", 400);
    if (!tokenValue) return { ok: false, erro: "token_obrigatorio", statusCode: 400 };
    const tokenHash = sha256(tokenValue);
    const raw = runSql(env, `
      WITH tenant AS (SELECT id FROM fitcore_tenants WHERE slug = ${sqlText(tenantSlug)} LIMIT 1),
      scope AS (SELECT set_config('app.tenant_id', (SELECT id::text FROM tenant), true))
      SELECT jsonb_build_object('id', i.id, 'tenant_slug', ${sqlText(tenantSlug)}, 'nome_convidado', i.nome_convidado, 'papel', i.papel, 'status', i.status, 'expires_at', i.expires_at, 'aceito_em', i.aceito_em)::text
      FROM fitcore_user_invites i, tenant, scope
      WHERE i.tenant_id = tenant.id AND i.token_hash = ${sqlText(tokenHash)}
      LIMIT 1;
    `);
    const invite = jsonScalar(raw);
    if (!invite) return { ok: false, erro: "convite_nao_encontrado", statusCode: 404 };
    const expired = new Date(invite.expires_at).getTime() <= Date.now();
    return { ok: true, mvp: "MVP-18 User Invites", invite: { ...invite, expirado: expired }, can_accept: invite.status === "pendente" && !expired };
  }

  function acceptInvite(input = {}) {
    const token = clean(input.token || "", "", 400);
    const inspected = inspectInvite(token);
    if (!inspected.ok) return { guard: { allowed: false, statusCode: inspected.statusCode || 400, response: inspected } };
    if (!inspected.can_accept) return { guard: { allowed: false, statusCode: 409, response: { erro: "convite_indisponivel", convite: inspected.invite } } };
    const invite = inspected.invite;
    const nome = clean(input.nome || input.actor_name || invite.nome_convidado, invite.nome_convidado, 120);
    const raw = runSql(env, `
      WITH tenant AS (SELECT id FROM fitcore_tenants WHERE slug = ${sqlText(tenantSlug)} LIMIT 1),
      scope AS (SELECT set_config('app.tenant_id', (SELECT id::text FROM tenant), true)),
      upsert_user AS (
        INSERT INTO fitcore_users (tenant_id, nome, papel, externo_id, ativo, atualizado_em)
        SELECT tenant.id, ${sqlText(nome)}, ${sqlText(invite.papel)}, ${sqlText(`mvp18-invite-${invite.id}`)}, true, now()
        FROM tenant, scope WHERE tenant.id IS NOT NULL
        ON CONFLICT (tenant_id, externo_id) DO UPDATE SET nome = EXCLUDED.nome, papel = EXCLUDED.papel, ativo = true, atualizado_em = now()
        RETURNING id, tenant_id, nome, papel
      ), accepted AS (
        UPDATE fitcore_user_invites i
        SET status = 'aceito', aceito_por = (SELECT id FROM upsert_user), aceito_em = now(), atualizado_em = now()
        FROM tenant, scope
        WHERE i.tenant_id = tenant.id AND i.id = ${sqlText(invite.id)}::uuid AND i.status = 'pendente'
        RETURNING i.id
      ), audit AS (
        INSERT INTO fitcore_audit_events (tenant_id, actor_id, actor_role, recurso_tipo, recurso_id, acao, status, detalhe)
        SELECT tenant.id, upsert_user.id, upsert_user.papel, 'user_invite', ${sqlText(invite.id)}::uuid, 'convite_aceito', 'ok', 'MVP-18 aceite por token assinado'
        FROM tenant, upsert_user, scope
      )
      SELECT jsonb_build_object('user_id', id, 'tenant_id', tenant_id, 'nome', nome, 'papel', papel)::text FROM upsert_user;
    `);
    const user = jsonScalar(raw);
    const createdSession = sessionManager.createSessionForUserRecord(user, { source: "mvp18_invite" });
    return { ok: true, mvp: "MVP-18 User Invites", accepted: true, invite, user, session: createdSession.session, cookie: createdSession.cookie };
  }

  function publicHealth(context) {
    return {
      ok: true,
      mvp: "MVP-18 User Invites",
      tenant_slug: context?.tenant_slug || tenantSlug,
      actor_role: context?.actor_role || null,
      session_signed: Boolean(context?.session_signed),
      role_from_db: Boolean(context?.role_from_db),
      demo_login_required_for_invited_users: false,
      endpoints: [
        "GET /api/mvp-18/users",
        "POST /api/mvp-18/users/invite",
        "GET /api/mvp-18/invites/inspect?token=...",
        "POST /api/mvp-18/invites/accept",
      ],
    };
  }

  return { requireGestor, listUsers, listInvites, createInvite, inspectInvite, acceptInvite, publicHealth };
}
