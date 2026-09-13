import { execFileSync } from "node:child_process";
import { scryptSync, timingSafeEqual } from "node:crypto";

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
        'credential_revoked_at', u.credential_revoked_at
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
      recordAudit(principal.platform_admin_id, principal.user_id, "global_login_failed", null, { source: "platform_owner" });
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
    recordAudit(principal.platform_admin_id, principal.user_id, "global_login_ok", null, { source: "platform_owner" });
    const created = sessionManager.createSessionForUserRecord({
      id: principal.user_id,
      tenant_id: principal.tenant_id,
      tenant_slug: principal.tenant_slug,
      nome: principal.nome,
      papel: "gestor",
    }, { source: "platform_owner_login", tenant_slug: principal.tenant_slug });

    return {
      matched: true,
      ok: true,
      platform_owner: true,
      session: created.session,
      cookie: created.cookie,
      user: { id: principal.user_id, nome: principal.nome, papel: "platform_owner", login_identifier: identifier },
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

  function requirePlatformOwner(context) {
    const signed = requireSigned(context);
    if (!signed.allowed) return { guard: signed };
    const platformAdmin = resolvePlatformAdmin(context);
    if (!platformAdmin) {
      return { guard: { allowed: false, statusCode: 403, response: { erro: "platform_owner_required", mensagem: "Acesso exclusivo do proprietário da plataforma." } } };
    }
    return { platformAdmin };
  }

  function listTenants(context) {
    const access = requirePlatformOwner(context);
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
    return { ok: true, platform_owner: true, tenants };
  }

  function switchTenant(context, input = {}) {
    const access = requirePlatformOwner(context);
    if (access.guard) return access;
    const tenantSlug = clean(input.tenant_slug || input.slug || "", "", 80);
    const tenantId = clean(input.tenant_id || "", "", 80);
    if (!tenantSlug && !tenantId) {
      return { guard: { allowed: false, statusCode: 400, response: { erro: "tenant_required", mensagem: "Informe a unidade para continuar." } } };
    }

    const target = jsonScalar(runSql(env, `
      SELECT jsonb_build_object('id', id, 'slug', slug, 'nome', nome, 'status', status)::text
      FROM fitcore_tenants
      WHERE slug <> 'platform-control'
        AND status <> 'suspenso'
        AND (${tenantId ? `id = ${sqlText(tenantId)}::uuid` : `slug = ${sqlText(tenantSlug)}`})
      LIMIT 1;
    `));
    if (!target) {
      return { guard: { allowed: false, statusCode: 404, response: { erro: "tenant_not_found", mensagem: "Unidade não encontrada ou indisponível." } } };
    }

    const bridgeExternalId = `platform-owner-${access.platformAdmin.id}`;
    const bridge = jsonScalar(runSql(env, `
      WITH scope AS (SELECT set_config('app.tenant_id', ${sqlText(target.id)}, true)), upsert_user AS (
        INSERT INTO fitcore_users (tenant_id, nome, papel, externo_id, ativo, atualizado_em)
        SELECT ${sqlText(target.id)}::uuid, 'Proprietário da plataforma', 'gestor', ${sqlText(bridgeExternalId)}, true, now()
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

    recordAudit(access.platformAdmin.id, context.actor_id, "tenant_selected", target.id, { tenant_slug: target.slug });
    const created = sessionManager.createSessionForUserRecord({
      id: bridge.id,
      tenant_id: target.id,
      tenant_slug: target.slug,
      nome: bridge.nome,
      papel: "gestor",
    }, { source: "platform_owner_bridge", tenant_slug: target.slug });

    return {
      ok: true,
      platform_owner: true,
      tenant: target,
      session: created.session,
      cookie: created.cookie,
    };
  }

  function auditLogout(context) {
    const platformAdmin = resolvePlatformAdmin(context);
    if (!platformAdmin) return false;
    recordAudit(platformAdmin.id, context.actor_id, "logout", context.tenant_slug === "platform-control" ? null : context.tenant_id, {});
    return true;
  }

  return { enabled, globalLogin, listTenants, switchTenant, resolvePlatformAdmin, auditLogout };
}
