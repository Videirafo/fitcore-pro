import { execFileSync } from "node:child_process";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { modeFromLoginSource, normalizeInternalProductMode, resolveProductEntitlements } from "./product-entitlements.mjs";

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

function hashSecret(value) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(String(value || ""), salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
  return `scrypt:16384:8:1:${salt}:${hash}`;
}

function jsonScalar(value) {
  const text = String(value || "").trim();
  return text ? JSON.parse(text) : null;
}

function dbConnection(env = process.env) {
  const dbUrl = clean(env.FITCORE_DATABASE_URL || env.DATABASE_URL || "", "", 900);
  if (!dbUrl) throw new Error("FITCORE_DATABASE_URL ausente para platform owner.");
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

function verifySecret(stored, candidate) {
  const parts = String(stored || "").split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, expectedHex] = parts;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = scryptSync(String(candidate || ""), salt, expected.length, {
    N: Number(n), r: Number(r), p: Number(p),
  });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function requireSigned(context) {
  if (!context?.session_signed || !context?.actor_id || !context?.tenant_id) {
    return { allowed: false, statusCode: 401, response: { erro: "sessao_obrigatoria", mensagem: "Faça login como proprietário da plataforma." } };
  }
  return { allowed: true };
}

export function createPlatformOwnerManager(env = process.env, sessionManager) {
  const enabled = clean(env.FITCORE_PLATFORM_OWNER_ENABLED || "false", "false", 12).toLowerCase() === "true";

  function recordAudit(platformAdminId, actorUserId, action, targetTenantId = null, detail = {}) {
    runSql(env, `
      INSERT INTO fitcore_platform_admin_audit_events (
        platform_admin_id, actor_user_id, action, target_tenant_id, detail
      ) VALUES (
        ${sqlText(platformAdminId)}::uuid,
        ${actorUserId ? `${sqlText(actorUserId)}::uuid` : "NULL"},
        ${sqlText(action)},
        ${targetTenantId ? `${sqlText(targetTenantId)}::uuid` : "NULL"},
        ${sqlText(JSON.stringify(detail))}::jsonb
      );
    `);
  }

  function findPrincipal(loginIdentifier) {
    const identifier = clean(loginIdentifier, "", 180).toLowerCase();
    if (!enabled || !identifier) return null;
    return jsonScalar(runSql(env, `
      SELECT jsonb_build_object(
        'platform_admin_id', pa.id,
        'user_id', u.id,
        'tenant_id', u.tenant_id,
        'tenant_slug', t.slug,
        'nome', u.nome,
        'papel', u.papel,
        'login_identifier', u.login_identifier,
        'credential_hash', u.credential_hash,
        'credential_revoked_at', u.credential_revoked_at,
        'platform_role', pa.role
      )::text
      FROM fitcore_platform_admins pa
      JOIN fitcore_users u ON u.id = pa.principal_user_id
      JOIN fitcore_tenants t ON t.id = u.tenant_id
      WHERE pa.active = true AND u.ativo = true
        AND lower(COALESCE(u.email, u.login_identifier)) = ${sqlText(identifier)}
      LIMIT 1;
    `));
  }

  function globalLogin(input = {}) {
    const identifier = clean(input.login_identifier || input.identificador || "", "", 180).toLowerCase();
    const secret = input.secret || input.senha || input.codigo_acesso || input.access_code || "";
    const principal = findPrincipal(identifier);
    if (!principal) return { matched: false };

    if (!principal.credential_hash || principal.credential_revoked_at || !verifySecret(principal.credential_hash, secret)) {
      recordAudit(principal.platform_admin_id, principal.user_id, "global_login_failed", null, { source: principal.platform_role });
      return {
        matched: true,
        guard: { allowed: false, statusCode: 401, response: { erro: "credencial_invalida", mensagem: "E-mail ou senha inválidos." } },
      };
    }

    runSql(env, `
      UPDATE fitcore_users
      SET last_login_at = now(), atualizado_em = now()
      WHERE id = ${sqlText(principal.user_id)}::uuid;
    `);
    recordAudit(principal.platform_admin_id, principal.user_id, "global_login_ok", null, { source: principal.platform_role });
    const created = sessionManager.createSessionForUserRecord({
      id: principal.user_id,
      tenant_id: principal.tenant_id,
      tenant_slug: principal.tenant_slug,
      nome: principal.nome,
      papel: "gestor",
    }, { source: `${principal.platform_role}_login:full`, tenant_slug: principal.tenant_slug });

    return {
      matched: true,
      ok: true,
      platform_owner: principal.platform_role === "platform_owner",
      platform_internal: true,
      platform_role: principal.platform_role,
      session: created.session,
      cookie: created.cookie,
      user: { id: principal.user_id, nome: principal.nome, papel: principal.platform_role, login_identifier: identifier },
    };
  }

  function resolvePlatformAdmin(context) {
    const signed = requireSigned(context);
    if (!signed.allowed) return null;
    return jsonScalar(runSql(env, `
      SELECT jsonb_build_object(
        'id', pa.id,
        'principal_user_id', pa.principal_user_id,
        'role', pa.role
      )::text
      FROM fitcore_platform_admins pa
      WHERE pa.active = true
        AND (
          pa.principal_user_id = ${sqlText(context.actor_id)}::uuid
          OR EXISTS (
            SELECT 1
            FROM fitcore_platform_admin_bridges b
            WHERE b.platform_admin_id = pa.id
              AND b.user_id = ${sqlText(context.actor_id)}::uuid
          )
        )
      LIMIT 1;
    `));
  }

  function requirePlatformInternal(context) {
    const signed = requireSigned(context);
    if (!signed.allowed) return { guard: signed };
    const platformAdmin = resolvePlatformAdmin(context);
    if (!platformAdmin) {
      return { guard: { allowed: false, statusCode: 403, response: { erro: "platform_internal_required", mensagem: "Acesso interno da plataforma obrigatório." } } };
    }
    return { platformAdmin };
  }

  function requireRootOwner(context) {
    const access = requirePlatformInternal(context);
    if (access.guard) return access;
    if (access.platformAdmin.role !== "platform_owner") {
      return { guard: { allowed: false, statusCode: 403, response: { erro: "root_owner_required", mensagem: "Somente o proprietário raiz pode convidar acessos internos." } } };
    }
    return access;
  }

  function listTenants(context) {
    const access = requirePlatformInternal(context);
    if (access.guard) return access;
    const tenants = jsonScalar(runSql(env, `
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id,
        'slug', slug,
        'nome', nome,
        'status', status,
        'tipo_negocio', tipo_negocio,
        'plano', plano
      ) ORDER BY nome), '[]'::jsonb)::text
      FROM fitcore_tenants
      WHERE slug <> 'platform-control' AND status <> 'suspenso';
    `)) || [];
    return {
      ok: true, platform_owner: access.platformAdmin.role === "platform_owner", platform_internal: true, platform_role: access.platformAdmin.role, tenants,
      internal_product_access: {
        billing_exempt: true,
        checkout_required: false,
        default_mode: "full",
        modes: ["full", "essencial", "profissional", "business", "enterprise"],
      },
    };
  }

  function switchTenant(context, input = {}) {
    const access = requirePlatformInternal(context);
    if (access.guard) return access;
    const tenantSlug = clean(input.tenant_slug || input.slug || "", "", 80);
    const tenantId = clean(input.tenant_id || "", "", 80);
    const internalMode = normalizeInternalProductMode(input.internal_product_mode || input.mode || "full");
    if (!tenantSlug && !tenantId) {
      return { guard: { allowed: false, statusCode: 400, response: { erro: "tenant_required", mensagem: "Informe a unidade para continuar." } } };
    }

    const target = jsonScalar(runSql(env, `
      SELECT jsonb_build_object('id', id, 'slug', slug, 'nome', nome, 'status', status, 'plano', plano)::text
      FROM fitcore_tenants
      WHERE slug <> 'platform-control'
        AND status <> 'suspenso'
        AND (${tenantId ? `id = ${sqlText(tenantId)}::uuid` : `slug = ${sqlText(tenantSlug)}`})
      LIMIT 1;
    `));
    if (!target) {
      return { guard: { allowed: false, statusCode: 404, response: { erro: "tenant_not_found", mensagem: "Unidade não encontrada ou indisponível." } } };
    }

    const bridgeExternalId = `${access.platformAdmin.role}-${access.platformAdmin.id}`;
    const bridge = jsonScalar(runSql(env, `
      WITH scope AS (SELECT set_config('app.tenant_id', ${sqlText(target.id)}, true)), upsert_user AS (
        INSERT INTO fitcore_users (tenant_id, nome, papel, externo_id, ativo, atualizado_em)
        SELECT ${sqlText(target.id)}::uuid, CASE WHEN ${sqlText(access.platformAdmin.role)}='platform_owner' THEN 'Proprietário da plataforma' ELSE 'Delegate interno' END, 'gestor', ${sqlText(bridgeExternalId)}, true, now()
        FROM scope
        ON CONFLICT (tenant_id, externo_id) DO UPDATE SET
          nome = EXCLUDED.nome, papel = 'gestor', ativo = true, atualizado_em = now()
        RETURNING id, tenant_id, nome, papel
      )
      SELECT jsonb_build_object('id', id, 'tenant_id', tenant_id, 'nome', nome, 'papel', papel)::text
      FROM upsert_user;
    `));

    runSql(env, `
      INSERT INTO fitcore_platform_admin_bridges (platform_admin_id, tenant_id, user_id, atualizado_em)
      VALUES (
        ${sqlText(access.platformAdmin.id)}::uuid,
        ${sqlText(target.id)}::uuid,
        ${sqlText(bridge.id)}::uuid,
        now()
      )
      ON CONFLICT (platform_admin_id, tenant_id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        atualizado_em = now();
    `);

    recordAudit(access.platformAdmin.id, context.actor_id, "tenant_selected", target.id, { tenant_slug: target.slug, platform_role: access.platformAdmin.role, internal_product_mode: internalMode, billing_exempt: true, checkout_required: false });
    const created = sessionManager.createSessionForUserRecord({
      id: bridge.id,
      tenant_id: target.id,
      tenant_slug: target.slug,
      nome: bridge.nome,
      papel: "gestor",
    }, { source: `${access.platformAdmin.role}_bridge:${internalMode}`, tenant_slug: target.slug });

    return {
      ok: true,
      platform_owner: access.platformAdmin.role === "platform_owner",
      platform_internal: true,
      platform_role: access.platformAdmin.role,
      tenant: target,
      entitlements: resolveProductEntitlements({
        tenantPlan: target.plano || "trial",
        platformInternalRole: access.platformAdmin.role,
        internalVerified: true,
        internalMode,
      }),
      session: created.session,
      cookie: created.cookie,
    };
  }

  function listInternalInvites(context) {
    const access = requireRootOwner(context);
    if (access.guard) return access;
    const invites = jsonScalar(runSql(env, `
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'email', email, 'status', status,
        'expires_at', expires_at, 'accepted_at', accepted_at,
        'revoked_at', revoked_at, 'criado_em', criado_em
      ) ORDER BY criado_em DESC), '[]'::jsonb)::text
      FROM fitcore_platform_admin_invites;
    `)) || [];
    return { ok: true, platform_role: access.platformAdmin.role, invites };
  }

  function createInternalInvite(context, input = {}) {
    const access = requireRootOwner(context);
    if (access.guard) return access;
    const email = clean(input.email || "", "", 180).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { guard: { allowed: false, statusCode: 400, response: { erro: "email_invalido" } } };
    }
    const rootEmail = clean(env.FITCORE_PLATFORM_ROOT_EMAIL || "", "", 180).toLowerCase();
    if (rootEmail && email === rootEmail) {
      return { guard: { allowed: false, statusCode: 409, response: { erro: "root_owner_nao_pode_ser_delegate" } } };
    }
    const token = randomBytes(32).toString("base64url");
    const tokenHash = sha256(token);
    const invite = jsonScalar(runSql(env, `
      UPDATE fitcore_platform_admin_invites
      SET status='expired', atualizado_em=now()
      WHERE status='pending' AND expires_at <= now();
      WITH created AS (
        INSERT INTO fitcore_platform_admin_invites (email, token_hash, invited_by, expires_at)
        VALUES (${sqlText(email)}, ${sqlText(tokenHash)}, ${sqlText(access.platformAdmin.id)}::uuid, now() + interval '72 hours')
        RETURNING id,email,status,expires_at,criado_em
      )
      SELECT jsonb_build_object('id',id,'email',email,'status',status,'expires_at',expires_at,'criado_em',criado_em)::text FROM created;
    `));
    recordAudit(access.platformAdmin.id, context.actor_id, "delegate_invited", null, { email });
    const base = clean(env.FITCORE_PUBLIC_URL || "https://fitcore.marcaia.app", "https://fitcore.marcaia.app", 240).replace(/\/$/, "");
    return { ok: true, invite, token, invite_url: `${base}/admin/convite?token=${encodeURIComponent(token)}` };
  }

  function inspectInternalInvite(tokenValue) {
    const token = clean(tokenValue || "", "", 400);
    if (!token) return { ok: false, statusCode: 400, erro: "token_obrigatorio" };
    const invite = jsonScalar(runSql(env, `
      SELECT jsonb_build_object('id',i.id,'email',i.email,'status',i.status,'expires_at',i.expires_at)::text
      FROM fitcore_platform_admin_invites i
      JOIN fitcore_platform_admins owner ON owner.id=i.invited_by
      WHERE i.token_hash=${sqlText(sha256(token))}
        AND i.status='pending' AND i.expires_at>now()
        AND owner.active=true AND owner.role='platform_owner'
      LIMIT 1;
    `));
    return invite ? { ok: true, invite } : { ok: false, statusCode: 404, erro: "convite_indisponivel" };
  }

  function acceptInternalInvite(input = {}) {
    const token = clean(input.token || "", "", 400);
    const inspected = inspectInternalInvite(token);
    if (!inspected.ok) return { guard: { allowed: false, statusCode: inspected.statusCode || 400, response: inspected } };
    const email = clean(input.email || "", "", 180).toLowerCase();
    const name = clean(input.nome || input.name || "Delegate interno", "Delegate interno", 120);
    const secret = String(input.secret || input.senha || "");
    if (email !== String(inspected.invite.email || "").toLowerCase()) {
      return { guard: { allowed: false, statusCode: 403, response: { erro: "email_nao_corresponde_ao_convite" } } };
    }
    if (secret.length < 8) {
      return { guard: { allowed: false, statusCode: 400, response: { erro: "senha_curta" } } };
    }
    const hash = hashSecret(secret);
    const created = jsonScalar(runSql(env, `
      WITH tenant AS (
        SELECT id FROM fitcore_tenants WHERE slug='platform-control' LIMIT 1
      ), upsert_user AS (
        INSERT INTO fitcore_users (
          tenant_id,nome,papel,externo_id,ativo,login_identifier,email,
          credential_kind,credential_hash,credential_set_at,credential_revoked_at,atualizado_em
        ) SELECT tenant.id,${sqlText(name)},'gestor',${sqlText(`platform-delegate-${inspected.invite.id}`)},true,
          ${sqlText(email)},${sqlText(email)},'password',${sqlText(hash)},now(),NULL,now()
          FROM tenant
        ON CONFLICT (tenant_id, externo_id) DO UPDATE SET
          nome=EXCLUDED.nome, ativo=true, login_identifier=EXCLUDED.login_identifier,
          email=EXCLUDED.email, credential_kind='password', credential_hash=EXCLUDED.credential_hash,
          credential_set_at=now(), credential_revoked_at=NULL, atualizado_em=now()
        RETURNING id,tenant_id,nome
      ), admin_row AS (
        INSERT INTO fitcore_platform_admins (principal_user_id,role,active,invited_by,invited_at,atualizado_em)
        SELECT u.id,'platform_delegate',true,i.invited_by,now(),now()
        FROM upsert_user u JOIN fitcore_platform_admin_invites i ON i.id=${sqlText(inspected.invite.id)}::uuid
        ON CONFLICT (principal_user_id) DO UPDATE SET
          role='platform_delegate', active=true, invited_by=EXCLUDED.invited_by, invited_at=now(), atualizado_em=now()
        RETURNING id,principal_user_id,role
      ), accepted AS (
        UPDATE fitcore_platform_admin_invites SET status='accepted',accepted_by=(SELECT id FROM admin_row),accepted_at=now(),atualizado_em=now()
        WHERE id=${sqlText(inspected.invite.id)}::uuid AND status='pending'
        RETURNING id
      )
      SELECT jsonb_build_object('admin_id',a.id,'user_id',a.principal_user_id,'role',a.role,'tenant_id',u.tenant_id,'nome',u.nome)::text
      FROM admin_row a JOIN upsert_user u ON u.id=a.principal_user_id;
    `));
    recordAudit(created.admin_id, created.user_id, "delegate_invite_accepted", null, { invite_id: inspected.invite.id });
    return { ok: true, accepted: true, platform_role: "platform_delegate" };
  }

  function revokeInternalAccess(context, input = {}) {
    const access = requireRootOwner(context);
    if (access.guard) return access;
    const inviteId = clean(input.invite_id || "", "", 80);
    const adminId = clean(input.platform_admin_id || "", "", 80);
    if (!inviteId && !adminId) return { guard: { allowed: false, statusCode: 400, response: { erro: "target_required" } } };
    if (inviteId) runSql(env, `UPDATE fitcore_platform_admin_invites SET status='revoked',revoked_at=now(),atualizado_em=now() WHERE id=${sqlText(inviteId)}::uuid AND status='pending';`);
    if (adminId) runSql(env, `
      UPDATE fitcore_platform_admins SET active=false,atualizado_em=now() WHERE id=${sqlText(adminId)}::uuid AND role='platform_delegate';
      UPDATE fitcore_users SET ativo=false,atualizado_em=now() WHERE id IN (SELECT user_id FROM fitcore_platform_admin_bridges WHERE platform_admin_id=${sqlText(adminId)}::uuid);
    `);
    recordAudit(access.platformAdmin.id, context.actor_id, "delegate_revoked", null, { invite_id: inviteId || null, platform_admin_id: adminId || null });
    return { ok: true };
  }

  function resolveEntitlements(context) {
    const loginSource = String(context?.login_source || "");
    if (!context?.session_signed || !(loginSource.startsWith("platform_owner") || loginSource.startsWith("platform_delegate"))) return null;
    const platformAdmin = resolvePlatformAdmin(context);
    if (!platformAdmin) return null;
    const tenantPlan = clean(runSql(env, `
      SELECT plano FROM fitcore_tenants WHERE id = ${sqlText(context.tenant_id)}::uuid LIMIT 1;
    `), "trial", 40);
    return resolveProductEntitlements({
      tenantPlan,
      platformInternalRole: platformAdmin.role,
      internalVerified: true,
      internalMode: modeFromLoginSource(loginSource),
    });
  }

  function auditLogout(context) {
    const platformAdmin = resolvePlatformAdmin(context);
    if (!platformAdmin) return false;
    recordAudit(platformAdmin.id, context.actor_id, "logout", context.tenant_slug === "platform-control" ? null : context.tenant_id, {});
    return true;
  }

  return { enabled, globalLogin, listTenants, switchTenant, resolvePlatformAdmin, resolveEntitlements, listInternalInvites, createInternalInvite, inspectInternalInvite, acceptInternalInvite, revokeInternalAccess, auditLogout };
}
