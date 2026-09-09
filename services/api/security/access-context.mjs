// FITCORE PRO — MVP-14
// Fundamento de autenticação e papéis.
// Nesta fase ainda não há login real; existe contexto verificável de tenant/papel para preparar RBAC.

export const FITCORE_ROLES = Object.freeze(["gestor", "professor", "aluno"]);

export const FITCORE_ROLE_MATRIX = Object.freeze({
  gestor: ["dashboard", "alunos", "treinos", "revisoes", "checkins", "auditoria", "configuracao"],
  professor: ["dashboard", "alunos", "treinos", "revisoes", "checkins"],
  aluno: ["meu_treino", "meus_checkins"],
});

function clean(value, fallback = "", max = 120) {
  const text = String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
  return text || fallback;
}

function header(req, name) {
  const value = req?.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

export function normalizeRole(value) {
  const role = clean(value, "aluno", 40).toLowerCase();
  return FITCORE_ROLES.includes(role) ? role : "aluno";
}

export function createAccessContext(req, env = process.env) {
  const tenantSlug = clean(
    header(req, "x-fitcore-tenant") || env.FITCORE_TENANT_SLUG,
    "demo",
    80,
  );
  const role = normalizeRole(header(req, "x-fitcore-role") || env.FITCORE_DEFAULT_ROLE || "gestor");
  const actorName = clean(header(req, "x-fitcore-actor") || env.FITCORE_DEFAULT_ACTOR || `${role}-mvp14`, 100);
  const enforcement = clean(env.FITCORE_RBAC_ENFORCEMENT || "soft", "soft", 20).toLowerCase();

  return {
    ok: true,
    mvp: "MVP-14 Auth/RBAC foundation",
    tenant_slug: tenantSlug,
    actor_role: role,
    actor_name: actorName,
    enforcement: enforcement === "strict" ? "strict" : "soft",
    source: "headers_or_safe_defaults",
    capabilities: FITCORE_ROLE_MATRIX[role] || [],
    login_real: false,
    policy: {
      dados_minimos: true,
      tenant_required: true,
      role_required: true,
      lgpd: "não coletar documento, telefone, e-mail, foto, medidas ou dado médico nesta fase",
    },
  };
}

export function canAccess(context, capability) {
  const role = normalizeRole(context?.actor_role);
  return Boolean(FITCORE_ROLE_MATRIX[role]?.includes(capability));
}

export function requireRole(context, allowedRoles) {
  const role = normalizeRole(context?.actor_role);
  const allowed = allowedRoles.includes(role);
  return {
    allowed,
    role,
    enforcement: context?.enforcement || "soft",
    statusCode: allowed ? 200 : 403,
    response: allowed ? null : {
      erro: "acesso_negado",
      mensagem: "Perfil sem permissão para esta ação.",
      papel: role,
      papeis_permitidos: allowedRoles,
      enforcement: context?.enforcement || "soft",
    },
  };
}

export function createAccessHealth(context) {
  return {
    ...context,
    roles: FITCORE_ROLES,
    matrix: FITCORE_ROLE_MATRIX,
    status: context?.enforcement === "strict" ? "rbac_strict" : "rbac_soft_guard",
    next_gate: "login real com sessão assinada e tenant_id por usuário",
  };
}
