// FITCORE PRO — MVP-17
// Navegação por papel resolvida a partir da sessão assinada e do papel vindo do banco.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { FITCORE_ROLES, normalizeRole } from "./access-context.mjs";

export const FITCORE_NAV_ITEMS = Object.freeze([
  { id: "home", label: "Início", href: "/", roles: ["gestor", "professor", "aluno"], section: "base" },
  { id: "tenant_onboarding", label: "Meu negócio", href: "/mvp-21.html", roles: ["gestor"], section: "base" },
  { id: "student_panel", label: "Meu treino", href: "/mvp-04.html", roles: ["aluno"], section: "aluno" },
  { id: "checkins", label: "Check-in", href: "/mvp-02.html", roles: ["gestor", "professor", "aluno"], section: "operação" },
  { id: "students_real", label: "Alunos", href: "/mvp-23.html", roles: ["gestor", "professor"], section: "operação" },
  { id: "student_workout", label: "Aluno + Treino", href: "/mvp-01.html", roles: ["gestor", "professor"], section: "operação" },
  { id: "prescriptions", label: "Prescrição", href: "/mvp-24.html", roles: ["gestor", "professor", "aluno"], section: "operação" },
  { id: "teacher", label: "Professor", href: "/mvp-03.html", roles: ["gestor", "professor"], section: "operação" },
  { id: "media", label: "Biblioteca", href: "/mvp-06.html", roles: ["gestor", "professor"], section: "operação" },
  { id: "ops", label: "Operação", href: "/mvp-13.html", roles: ["gestor", "professor"], section: "gestão" },
  { id: "roles", label: "Papéis", href: "/mvp-05.html", roles: ["gestor"], section: "admin" },
  { id: "postgres", label: "PostgreSQL", href: "/mvp-11.html", roles: ["gestor"], section: "admin" },
  { id: "smoke", label: "Smoke", href: "/mvp-12.html", roles: ["gestor"], section: "admin" },
  { id: "auth", label: "Sessão", href: "/mvp-15.html", roles: ["gestor"], section: "admin" },
  { id: "login_ui", label: "Login UI", href: "/mvp-16.html", roles: ["gestor"], section: "admin" },
  { id: "navigation", label: "Navegação", href: "/mvp-17.html", roles: ["gestor"], section: "admin" },
  { id: "users", label: "Usuários", href: "/mvp-18.html", roles: ["gestor"], section: "admin" },
  { id: "tenant_users", label: "Equipe", href: "/mvp-22.html", roles: ["gestor"], section: "admin" },
  { id: "credential_login", label: "Login real", href: "/mvp-19.html", roles: ["gestor", "professor", "aluno"], section: "base" },
  { id: "auth_hardening", label: "Segurança", href: "/mvp-20.html", roles: ["gestor"], section: "admin" },
  { id: "lgpd", label: "LGPD", href: "/legal/privacy", roles: ["gestor", "professor", "aluno"], section: "base" },
]);

function clean(value, fallback = "", max = 220) {
  const text = String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return text || fallback;
}

function sqlText(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

function sha256(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
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
    timeout: 15000,
    maxBuffer: 1024 * 1024,
  }).trim();
}

export function createRoleNavigation(context = {}) {
  const role = normalizeRole(context.actor_role || "aluno");
  const items = FITCORE_NAV_ITEMS.filter((item) => item.roles.includes(role));
  const hidden = FITCORE_NAV_ITEMS.filter((item) => !item.roles.includes(role)).map((item) => ({
    id: item.id,
    label: item.label,
    href: item.href,
    reason: `indisponível para papel ${role}`,
    allowed_roles: item.roles,
  }));

  return {
    ok: true,
    mvp: "MVP-17 Role Navigation RBAC",
    tenant_slug: context.tenant_slug || "demo",
    actor_role: role,
    actor_name: context.actor_name || `${role} demo`,
    session_signed: Boolean(context.session_signed),
    role_from_db: Boolean(context.role_from_db),
    headers_trusted: context.headers_trusted === false ? false : Boolean(context.headers_trusted),
    source: context.session_signed ? "signed_session_database" : "soft_context",
    items,
    hidden_items: hidden,
    policy: {
      aluno_nao_ve_professor: role === "aluno" ? !items.some((item) => item.href === "/mvp-03.html") : true,
      professor_sem_admin_indevindo: role === "professor" ? !items.some((item) => item.section === "admin") : true,
      gestor_operacao_completa: role === "gestor" ? ["/mvp-01.html", "/mvp-02.html", "/mvp-03.html", "/mvp-13.html", "/mvp-17.html"].every((href) => items.some((item) => item.href === href)) : true,
      audit_required: true,
      lgpd: "registrar apenas papel, tenant, ação de navegação e hash técnico mínimo",
    },
  };
}

export function recordNavigationAudit(env = process.env, context = {}, action = {}) {
  if (!context?.tenant_id || !context?.actor_id || !context?.actor_role) return { ok: false, skipped: "missing_signed_context" };
  const role = normalizeRole(context.actor_role);
  const acao = clean(action.acao || "menu_resolvido", "menu_resolvido", 80);
  const status = clean(action.status || "ok", "ok", 40);
  const detalhe = clean(action.detalhe || "MVP-17 navegação por papel", "MVP-17 navegação por papel", 240);
  try {
    runSql(env, `
      WITH scope AS (SELECT set_config('app.tenant_id', ${sqlText(context.tenant_id)}, true))
      INSERT INTO fitcore_audit_events (tenant_id, actor_id, actor_role, recurso_tipo, acao, status, detalhe, user_agent_hash)
      SELECT ${sqlText(context.tenant_id)}::uuid, ${sqlText(context.actor_id)}::uuid, ${sqlText(role)}, 'navigation', ${sqlText(acao)}, ${sqlText(status)}, ${sqlText(detalhe)}, ${sqlText(sha256(action.userAgent || "mvp17"))}
      FROM scope;
    `);
    return { ok: true, persisted: true };
  } catch (error) {
    return { ok: false, persisted: false, error: error instanceof Error ? error.message : String(error) };
  }
}
