// FITCORE PRO — MVP-21
// Onboarding real do tenant: negócio, gestor proprietário, primeiro professor/aluno e sessão real.

import { execFileSync } from "node:child_process";
import { createHash, randomBytes, scryptSync } from "node:crypto";
import { normalizeRole } from "./access-context.mjs";

const BUSINESS_TYPES = new Set(["academia", "estudio", "box", "personal"]);

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

function jsonScalar(value) {
  const text = String(value || "").trim();
  return text ? JSON.parse(text) : null;
}

function boolEnv(value, fallback = false) {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  return ["1", "true", "yes", "on", "sim"].includes(String(value).trim().toLowerCase());
}

function dbConnection(env = process.env) {
  const dbUrl = clean(env.FITCORE_DATABASE_URL || env.DATABASE_URL || "", "", 900);
  if (!dbUrl) throw new Error("FITCORE_DATABASE_URL ausente para MVP-21.");
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

function slugify(value) {
  return clean(value, "fitcore", 80)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || `tenant-${Date.now()}`;
}

function sha256(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

function hashSecret(secret) {
  const value = String(secret || "").trim();
  if (value.length < 8) {
    const error = new Error("A senha/código do gestor precisa ter pelo menos 8 caracteres.");
    error.statusCode = 400;
    throw error;
  }
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(value, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
  return `scrypt:16384:8:1:${salt}:${hash}`;
}

function uniqueSlug(env, desired) {
  const base = slugify(desired);
  let candidate = base;
  for (let index = 0; index < 25; index += 1) {
    const exists = scalar(env, `SELECT 1 FROM fitcore_tenants WHERE slug = ${sqlText(candidate)} LIMIT 1;`);
    if (!exists) return candidate;
    candidate = `${base}-${randomBytes(2).toString("hex")}`.slice(0, 63);
  }
  return `${base}-${Date.now()}`.slice(0, 63);
}

function publicTenant(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    nome: row.nome,
    tipo_negocio: row.tipo_negocio,
    internal_domain: row.internal_domain,
    status: row.status,
    onboarding_status: row.onboarding_status,
    plano: row.plano,
    owner_user_id: row.owner_user_id,
    criado_em: row.criado_em,
  };
}

export function createTenantOnboardingManager(env = process.env, sessionManager) {
  const enabled = boolEnv(env.FITCORE_TENANT_ONBOARDING_ENABLED, true);
  const publicUrl = clean(env.FITCORE_PUBLIC_URL || "https://fitcore.marcaia.app", "https://fitcore.marcaia.app", 240);

  function status(context = {}) {
    return {
      ok: true,
      mvp: "MVP-21 Tenant Onboarding",
      enabled,
      current_tenant_slug: context?.tenant_slug || null,
      current_actor_role: context?.actor_role || null,
      demo_is_no_longer_only_flow: true,
      creates: ["tenant", "owner_gestor", "first_professor", "first_student", "owner_credential", "signed_session"],
      endpoints: [
        "GET /api/mvp-21/status",
        "POST /api/mvp-21/onboarding",
        "GET /api/mvp-21/tenant",
      ],
    };
  }

  function currentTenant(context = {}) {
    if (!context?.session_signed || !context?.tenant_id) {
      return { guard: { allowed: false, statusCode: 401, response: { erro: "sessao_obrigatoria", mensagem: "Faça login para ver o tenant atual." } } };
    }
    const raw = scalar(env, `
      WITH scope AS (SELECT set_config('app.tenant_id', ${sqlText(context.tenant_id)}, true))
      SELECT jsonb_build_object(
        'id', t.id,
        'slug', t.slug,
        'nome', t.nome,
        'tipo_negocio', t.tipo_negocio,
        'internal_domain', t.internal_domain,
        'status', t.status,
        'onboarding_status', t.onboarding_status,
        'plano', t.plano,
        'owner_user_id', t.owner_user_id,
        'criado_em', t.criado_em,
        'users', (SELECT count(*) FROM fitcore_users u WHERE u.tenant_id = t.id),
        'students', (SELECT count(*) FROM fitcore_students s WHERE s.tenant_id = t.id),
        'workouts', (SELECT count(*) FROM fitcore_workouts w WHERE w.tenant_id = t.id)
      )::text
      FROM fitcore_tenants t, scope
      WHERE t.id = ${sqlText(context.tenant_id)}::uuid
      LIMIT 1;
    `);
    const tenant = jsonScalar(raw);
    return { ok: true, mvp: "MVP-21 Tenant Onboarding", tenant: publicTenant(tenant), counters: { users: tenant?.users || 0, students: tenant?.students || 0, workouts: tenant?.workouts || 0 } };
  }

  function createTenant(input = {}, req = null) {
    if (!enabled) return { guard: { allowed: false, statusCode: 503, response: { erro: "tenant_onboarding_disabled" } } };
    const businessName = displayClean(input.business_name || input.nome_negocio || input.nome || "", "", 120);
    const businessType = clean(input.business_type || input.tipo_negocio || "academia", "academia", 40).toLowerCase();
    const ownerName = displayClean(input.owner_name || input.gestor_nome || "Gestor proprietário", "Gestor proprietário", 120);
    const loginIdentifier = clean(input.login_identifier || input.identificador || "", "", 120).toLowerCase();
    const secret = String(input.secret || input.senha || input.codigo_acesso || "");
    const professorName = displayClean(input.professor_nome || input.first_professor_name || "Professor inicial", "Professor inicial", 120);
    const studentName = displayClean(input.aluno_nome || input.first_student_name || "Aluno inicial", "Aluno inicial", 120);

    if (businessName.length < 3) {
      return { guard: { allowed: false, statusCode: 400, response: { erro: "nome_negocio_invalido", mensagem: "Informe o nome da academia, estúdio, box ou operação." } } };
    }
    if (!BUSINESS_TYPES.has(businessType)) {
      return { guard: { allowed: false, statusCode: 400, response: { erro: "tipo_negocio_invalido", permitidos: [...BUSINESS_TYPES] } } };
    }
    if (loginIdentifier.length < 4) {
      return { guard: { allowed: false, statusCode: 400, response: { erro: "identificador_invalido", mensagem: "Informe identificador do gestor com pelo menos 4 caracteres." } } };
    }

    const slug = uniqueSlug(env, input.slug || businessName);
    const internalDomain = `${slug}.fitcore.local`;
    const ownerCredentialHash = hashSecret(secret);
    const meta = {
      user_agent_hash: sha256(req?.headers?.["user-agent"] || "unknown"),
      ip_hash: sha256(req?.headers?.["x-forwarded-for"] || req?.socket?.remoteAddress || "unknown"),
    };

    const raw = scalar(env, `
      WITH tenant_created AS (
        INSERT INTO fitcore_tenants (slug, nome, status, tipo_negocio, internal_domain, onboarding_status, plano, origem, atualizado_em)
        VALUES (${sqlText(slug)}, ${sqlText(businessName)}, 'ativo', ${sqlText(businessType)}, ${sqlText(internalDomain)}, 'ativo', 'trial', 'mvp21_onboarding', now())
        RETURNING id, slug, nome, status, tipo_negocio, internal_domain, onboarding_status, plano, criado_em
      ), scope AS (
        SELECT set_config('app.tenant_id', (SELECT id::text FROM tenant_created), true)
      ), owner_created AS (
        INSERT INTO fitcore_users (tenant_id, nome, papel, externo_id, ativo, login_identifier, credential_kind, credential_hash, credential_set_at, atualizado_em)
        SELECT id, ${sqlText(ownerName)}, 'gestor', ${sqlText(`mvp21-owner-${slug}`)}, true, ${sqlText(loginIdentifier)}, 'password', ${sqlText(ownerCredentialHash)}, now(), now()
        FROM tenant_created, scope
        RETURNING id, tenant_id, nome, papel, login_identifier
      ), professor_created AS (
        INSERT INTO fitcore_users (tenant_id, nome, papel, externo_id, ativo, atualizado_em)
        SELECT id, ${sqlText(professorName)}, 'professor', ${sqlText(`mvp21-professor-${slug}`)}, true, now()
        FROM tenant_created, scope
        RETURNING id, tenant_id, nome, papel
      ), aluno_user_created AS (
        INSERT INTO fitcore_users (tenant_id, nome, papel, externo_id, ativo, atualizado_em)
        SELECT id, ${sqlText(studentName)}, 'aluno', ${sqlText(`mvp21-aluno-${slug}`)}, true, now()
        FROM tenant_created, scope
        RETURNING id, tenant_id, nome, papel
      ), student_created AS (
        INSERT INTO fitcore_students (tenant_id, source_mvp_id, nome_publico, nivel, status, criado_por, payload, atualizado_em)
        SELECT tenant_created.id, ${sqlText(`mvp21-student-${slug}`)}, ${sqlText(studentName)}, 'iniciante', 'ativo', owner_created.id, ${sqlJson({"origem":"mvp21_onboarding"})}, now()
        FROM tenant_created, owner_created, scope
        RETURNING id, tenant_id, nome_publico
      ), tenant_updated AS (
        UPDATE fitcore_tenants
        SET owner_user_id = (SELECT id FROM owner_created), atualizado_em = now()
        WHERE id = (SELECT id FROM tenant_created)
        RETURNING id
      ), audit_events AS (
        INSERT INTO fitcore_audit_events (tenant_id, actor_id, actor_role, recurso_tipo, recurso_id, acao, status, detalhe, ip_hash, user_agent_hash)
        SELECT tenant_created.id, owner_created.id, 'gestor', 'tenant', tenant_created.id, evento.acao, 'ok', evento.detalhe, ${sqlText(meta['ip_hash'])}, ${sqlText(meta['user_agent_hash'])}
        FROM tenant_created, owner_created, scope,
        (VALUES
          ('tenant_onboarded', ${sqlText(`tipo=${businessType}; slug=${slug}`)}),
          ('owner_created', ${sqlText(`login=${loginIdentifier}`)}),
          ('first_professor_created', ${sqlText(professorName)}),
          ('first_student_created', ${sqlText(studentName)})
        ) AS evento(acao, detalhe)
      ), security_event AS (
        INSERT INTO fitcore_security_events (tenant_id, actor_id, actor_role, acao, status, detalhe, ip_hash, user_agent_hash)
        SELECT tenant_created.id, owner_created.id, 'gestor', 'tenant_onboarding_completed', 'ok', ${sqlText(`slug=${slug}; type=${businessType}`)}, ${sqlText(meta['ip_hash'])}, ${sqlText(meta['user_agent_hash'])}
        FROM tenant_created, owner_created, scope
      ), onboarding_event AS (
        INSERT INTO fitcore_tenant_onboarding_events (tenant_id, actor_id, evento, status, detalhe, payload)
        SELECT tenant_created.id, owner_created.id, 'tenant_onboarding_completed', 'ok', ${sqlText(`Tenant ${slug} criado pelo MVP-21`)}, jsonb_build_object('business_type', ${sqlText(businessType)}, 'internal_domain', ${sqlText(internalDomain)})
        FROM tenant_created, owner_created, scope
      )
      SELECT jsonb_build_object(
        'tenant', (SELECT jsonb_build_object('id', id, 'slug', slug, 'nome', nome, 'status', status, 'tipo_negocio', tipo_negocio, 'internal_domain', internal_domain, 'onboarding_status', onboarding_status, 'plano', plano, 'owner_user_id', (SELECT id FROM owner_created), 'criado_em', criado_em) FROM tenant_created),
        'owner', (SELECT jsonb_build_object('id', id, 'tenant_id', tenant_id, 'tenant_slug', ${sqlText(slug)}, 'nome', nome, 'papel', papel, 'login_identifier', login_identifier) FROM owner_created),
        'first_professor', (SELECT jsonb_build_object('id', id, 'tenant_id', tenant_id, 'nome', nome, 'papel', papel) FROM professor_created),
        'first_student_user', (SELECT jsonb_build_object('id', id, 'tenant_id', tenant_id, 'nome', nome, 'papel', papel) FROM aluno_user_created),
        'first_student', (SELECT jsonb_build_object('id', id, 'tenant_id', tenant_id, 'nome_publico', nome_publico) FROM student_created)
      )::text;
    `);

    const created = jsonScalar(raw);
    const owner = created?.owner;
    const session = sessionManager.createSessionForUserRecord({ ...owner, user_id: owner.id, actor_role: "gestor", tenant_slug: slug }, { source: "mvp21_onboarding", tenant_slug: slug });
    return {
      ok: true,
      mvp: "MVP-21 Tenant Onboarding",
      onboarding_completed: true,
      demo_is_no_longer_only_flow: true,
      tenant: created.tenant,
      owner: { id: owner.id, nome: owner.nome, papel: owner.papel, login_identifier: owner.login_identifier, credential_set: true },
      first_professor: created.first_professor,
      first_student_user: created.first_student_user,
      first_student: created.first_student,
      login: { tenant_slug: slug, login_identifier: owner.login_identifier, url: `${publicUrl}/mvp-19.html?tenant_slug=${encodeURIComponent(slug)}` },
      session: session.session,
      cookie: session.cookie,
    };
  }

  return { enabled, status, currentTenant, createTenant };
}
