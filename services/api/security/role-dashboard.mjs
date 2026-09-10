// FITCORE PRO — MVP-37
// Dashboard consolidado por papel: dados reais do tenant, treino do aluno e contexto para IA.

import { normalizeRole } from "./access-context.mjs";

function makeUrl(path, params = {}) {
  const url = new URL(path, "http://fitcore.local");
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  return url;
}

function requireSigned(context = {}) {
  if (!context?.session_signed || !context?.tenant_id || !context?.actor_id) return { allowed: false, statusCode: 401, response: { erro: "sessao_obrigatoria", mensagem: "Faça login para abrir o dashboard real." } };
  return { allowed: true };
}

function safeNumber(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function compactList(items = [], limit = 5) {
  return Array.isArray(items) ? items.slice(0, limit) : [];
}

function safeCall(fn, fallback) {
  try {
    const result = fn();
    if (result?.guard && !result.guard.allowed) return { ...fallback, _guard: result.guard.response?.erro || "guard" };
    return result || fallback;
  } catch (error) {
    return { ...fallback, _error: error instanceof Error ? error.message : String(error) };
  }
}

function countByStatus(items = []) {
  return items.reduce((acc, item) => {
    const key = String(item?.status || item?.review_status || "sem_status");
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function exerciseMedia(item = {}, index = 0) {
  const slug = item.slug || ["0024-barbell-bench-front-squat", "0026-barbell-bench-squat", "0150-cable-bar-lateral-pulldown", "0289-dumbbell-bench-press"][index % 4];
  return { ...item, slug, gif_url: `/media/exercises/${slug}.gif`, ordem: index + 1 };
}

function buildWorkoutToday(prescriptions = [], executions = []) {
  const approved = prescriptions.find((item) => item.status === "aprovado") || prescriptions[0] || null;
  const active = executions.find((item) => item.status === "em_execucao") || null;
  if (!approved && !active) return null;
  const source = approved || active;
  const exercises = Array.isArray(source?.exercicios) ? source.exercicios : [];
  return {
    workout_id: source?.id || source?.workout_id || null,
    execution_id: active?.id || null,
    title: source?.nome_treino || source?.objetivo || "Treino do dia",
    student_name: source?.student_name || active?.student_name || null,
    status: active?.status || source?.status || "aprovado",
    exercises: compactList(exercises, 6).map(exerciseMedia),
  };
}

function metric(label, value, hint = "") { return { label, value, hint }; }

function buildKpis(role, data) {
  const users = data.team?.users || [];
  const students = data.students?.students || [];
  const prescriptions = data.prescriptions?.prescriptions || [];
  const executions = data.executions?.executions || [];
  const evolutionSummary = data.evolution?.summary || {};
  if (role === "gestor") return [
    metric("Alunos", safeNumber(data.students?.total || students.length), "ativos no tenant"),
    metric("Equipe", safeNumber(data.team?.total_users || users.length), "usuários e papéis"),
    metric("Treinos", safeNumber(data.prescriptions?.total || prescriptions.length), "prescrições"),
    metric("Execuções", safeNumber(data.executions?.total || executions.length), "registradas"),
    metric("Evolução", `${safeNumber(evolutionSummary.completed || data.executions?.concluidos)} concluídas`, "dados reais"),
    metric("Setup", `${safeNumber(data.setup?.progress_percent)}%`, "por tenant"),
  ];
  if (role === "professor") return [
    metric("Alunos", safeNumber(data.students?.total || students.length), "sob acompanhamento"),
    metric("Pendentes", safeNumber(data.prescriptions?.em_revisao || countByStatus(prescriptions).em_revisao), "para revisar"),
    metric("Aprovados", safeNumber(data.prescriptions?.aprovados || countByStatus(prescriptions).aprovado), "liberados"),
    metric("Execuções", safeNumber(data.executions?.total || executions.length), "acompanhamento"),
    metric("Esforço médio", safeNumber(evolutionSummary.average_effort || 0), "últimos treinos"),
  ];
  return [
    metric("Treinos", safeNumber(data.prescriptions?.total || prescriptions.length), "liberados"),
    metric("Em execução", safeNumber(data.executions?.em_execucao || countByStatus(executions).em_execucao), "agora"),
    metric("Concluídos", safeNumber(data.executions?.concluidos || countByStatus(executions).concluido), "histórico"),
    metric("Esforço", data.evolution?.student?.average_effort ?? "—", "média"),
    metric("Frequência", data.evolution?.student?.weekly_frequency ?? 0, "semanal"),
  ];
}

function buildProfile(role, context) {
  const title = role === "gestor" ? "Dashboard executivo do dono" : role === "professor" ? "Painel real do professor" : "Treino e evolução do aluno";
  const summary = role === "gestor" ? "Operação completa do tenant com dados consolidados." : role === "professor" ? "Fila de alunos, prescrições e progresso sob responsabilidade técnica." : "Treino aprovado, execução e histórico próprios.";
  return { role, title, summary, actor_name: context.actor_name || null, tenant_slug: context.tenant_slug || null };
}

function buildActions(role, data) {
  if (role === "gestor") return [
    { label: "Continuar setup", href: "/setup", hint: `${safeNumber(data.setup?.progress_percent)}% concluído` },
    { label: "Gerenciar equipe", href: "/equipe", hint: "professores e alunos" },
    { label: "Ver relatórios", href: "/relatorios", hint: "indicadores do tenant" },
  ];
  if (role === "professor") return [
    { label: "Revisar treinos", href: "/treinos", hint: "fila de prescrições" },
    { label: "Abrir IA", href: "/agents", hint: "ajuste de carga e orientação" },
    { label: "Ver evolução", href: "/evolucao", hint: "progresso dos alunos" },
  ];
  return [
    { label: "Iniciar treino", href: "/execucao", hint: "treino aprovado" },
    { label: "Minha evolução", href: "/evolucao", hint: "histórico e frequência" },
    { label: "Ver biblioteca", href: "/biblioteca", hint: "GIFs e técnica" },
  ];
}

function buildAgentContext(role, data) {
  return {
    role,
    source: "mvp37_consolidated_dashboard",
    tenant_scoped: true,
    facts: buildKpis(role, data).map((item) => `${item.label}: ${item.value}`),
    allowed_actions: role === "aluno" ? ["explicar exercício", "orientar execução segura", "resumir evolução"] : ["criar treino", "ajustar carga", "revisar progresso", "orientar aluno"],
  };
}

export function createRoleDashboardManager(env = process.env, deps = {}) {
  const enabled = true;
  function status(context = {}) {
    return { ok: true, mvp: "MVP-37 Role Dashboard", enabled, tenant_slug: context?.tenant_slug || null, actor_role: context?.actor_role || null, consolidated_endpoint: true, endpoint: "GET /api/mvp-37/dashboard" };
  }
  function dashboard(context = {}, url = null) {
    if (!enabled) return { guard: { allowed: false, statusCode: 503, response: { erro: "role_dashboard_disabled" } } };
    const guard = requireSigned(context); if (!guard.allowed) return { guard };
    const role = normalizeRole(context.actor_role);
    const limit = url?.searchParams?.get("limit") || "100";
    const data = {
      setup: role === "gestor" ? safeCall(() => deps.guidedSetupManager?.currentSetup?.(context) || deps.guidedSetupManager?.getSetup?.(context) || deps.guidedSetupManager?.status?.(context), { steps: [], progress_percent: 0 }) : { steps: [], progress_percent: 0 },
      team: role === "gestor" ? safeCall(() => deps.tenantUserManagement?.listUsers(context, makeUrl("/api/mvp-22/users", { limit })), { users: [], invites: [], total_users: 0 }) : { users: [], invites: [], total_users: 0 },
      students: ["gestor", "professor"].includes(role) ? safeCall(() => deps.studentManagement?.listStudents(context, makeUrl("/api/mvp-23/students", { limit })), { students: [], total: 0 }) : { students: [], total: 0 },
      prescriptions: role === "aluno" ? safeCall(() => deps.workoutPrescriptionManager?.listPrescriptions(context, makeUrl("/api/mvp-24/my-workouts", { status: "aprovado", limit }), true), { prescriptions: [], total: 0 }) : safeCall(() => deps.workoutPrescriptionManager?.listPrescriptions(context, makeUrl("/api/mvp-24/prescriptions", { limit }), false), { prescriptions: [], total: 0 }),
      executions: role === "aluno" ? safeCall(() => deps.workoutExecutionManager?.listExecutions(context, makeUrl("/api/mvp-25/my-executions", { limit }), true), { executions: [], total: 0 }) : safeCall(() => deps.workoutExecutionManager?.listExecutions(context, makeUrl("/api/mvp-25/executions", { limit }), false), { executions: [], total: 0 }),
      evolution: role === "aluno" ? safeCall(() => deps.studentEvolutionManager?.studentEvolution(context, "", makeUrl("/api/mvp-26/my-evolution", { limit }), true), { student: null, by_workout: [], history: [] }) : ["gestor", "professor"].includes(role) ? safeCall(() => deps.studentEvolutionManager?.tenantEvolution(context, makeUrl("/api/mvp-26/evolution", { limit })), { students: [], weekly: [], summary: {} }) : { students: [], weekly: [], summary: {} },
    };
    const prescriptions = data.prescriptions?.prescriptions || [];
    const executions = data.executions?.executions || [];
    return { ok: true, mvp: "MVP-37 Role Dashboard", source: "consolidated_endpoint", tenant_slug: context.tenant_slug, actor_role: role, profile: buildProfile(role, context), kpis: buildKpis(role, data), actions: buildActions(role, data), workout_today: buildWorkoutToday(prescriptions, executions), data, agent_context: buildAgentContext(role, data), security: { session_signed: true, tenant_scoped: true, rbac: true, lgpd: "dados mínimos, auditoria por tenant e acesso por papel" } };
  }
  return { enabled, status, dashboard };
}
