// FITCORE PRO — MVP-33 / Issue #1
// Evidence-First Coach: contexto verificável -> sinais -> recomendações -> revisão humana.

import { normalizeRole } from "./access-context.mjs";

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function confidenceFor(sampleCount) {
  if (sampleCount >= 12) return "alta";
  if (sampleCount >= 4) return "media";
  return "baixa";
}

export function buildStudentContextPack(evolution = {}) {
  const student = evolution.student || {};
  const total = number(student.total_executions);
  const completed = number(student.completed_executions);
  const weekly = number(student.weekly_frequency);
  const effort = student.average_effort == null ? null : number(student.average_effort);
  const adherence = total > 0 ? Math.round((completed / total) * 100) : null;
  return {
    student_id: student.student_id || null,
    student_name: student.student_name || "Aluno",
    evidence_count: total,
    confidence: confidenceFor(total),
    metrics: {
      total_executions: total,
      completed_executions: completed,
      weekly_frequency: weekly,
      adherence_percent: adherence,
      average_effort: effort,
      average_duration: student.average_duration == null ? null : number(student.average_duration),
      last_execution_at: student.last_execution_at || null,
    },
    provenance: ["fitcore_workout_executions", "fitcore_students", "fitcore_workouts"],
  };
}

export function evaluateFeedbackQuality(contextPack) {
  const metrics = contextPack.metrics;
  const missing = [];
  if (!contextPack.evidence_count) missing.push("historico_de_execucao");
  if (metrics.average_effort == null) missing.push("percepcao_de_esforco");
  if (!metrics.last_execution_at) missing.push("ultima_execucao");
  return {
    sufficient: contextPack.evidence_count >= 2,
    missing,
    score: Math.max(0, 100 - (missing.length * 25)),
  };
}

export function buildCoachRecommendations(contextPack) {
  const m = contextPack.metrics;
  const recommendations = [];
  if (!contextPack.evidence_count) {
    recommendations.push({ priority: "alta", kind: "evidence", title: "Registrar a primeira execução", reason: "Ainda não há histórico suficiente para orientar progressão.", next_action: "Executar e concluir um treino com percepção de esforço." });
    return recommendations;
  }
  if (m.weekly_frequency === 0) recommendations.push({ priority: "alta", kind: "adherence", title: "Retomar consistência", reason: "Nenhuma execução foi registrada nos últimos 7 dias.", next_action: "Professor e aluno devem revisar uma meta de frequência realista." });
  if (m.adherence_percent != null && m.adherence_percent < 60) recommendations.push({ priority: "media", kind: "adherence", title: "Revisar aderência ao plano", reason: `A conclusão histórica está em ${m.adherence_percent}%.`, next_action: "Revisar dificuldade, rotina e clareza do plano antes de aumentar volume." });
  if (m.average_effort != null && m.average_effort >= 9) recommendations.push({ priority: "alta", kind: "load_review", title: "Revisar percepção de esforço", reason: `Esforço médio registrado em ${m.average_effort}/10.`, next_action: "Professor deve conferir carga, volume, descanso e execução antes de progredir." });
  if (m.weekly_frequency >= 2 && (m.adherence_percent ?? 0) >= 75 && (m.average_effort == null || m.average_effort <= 8)) recommendations.push({ priority: "baixa", kind: "progression", title: "Manter progressão gradual", reason: "Frequência e aderência estão consistentes nos dados disponíveis.", next_action: "Professor pode avaliar progressão conservadora mantendo técnica e recuperação." });
  if (!recommendations.length) recommendations.push({ priority: "media", kind: "review", title: "Revisar contexto com o professor", reason: "Os sinais atuais não justificam uma mudança automática.", next_action: "Manter o plano e coletar mais evidências antes da próxima decisão." });
  return recommendations;
}

function requireCoachAccess(context = {}) {
  if (!context?.session_signed || !context?.tenant_id || !context?.actor_id) return { allowed: false, statusCode: 401, response: { erro: "sessao_obrigatoria", mensagem: "Faça login para usar o Coach." } };
  const role = normalizeRole(context.actor_role);
  if (!["gestor", "professor", "aluno"].includes(role)) return { allowed: false, statusCode: 403, response: { erro: "acesso_negado" } };
  return { allowed: true, role };
}

export function createEvidenceCoachManager(env = process.env, studentEvolutionManager) {
  const enabled = String(env.FITCORE_EVIDENCE_COACH_ENABLED ?? "true").toLowerCase() !== "false";
  function status(context = {}) {
    return { ok: true, mvp: "MVP-33 Evidence-First Coach", enabled, tenant_scoped: true, evidence_first: true, human_review: true, medical_autonomy: false, actor_role: context.actor_role || null };
  }
  function studentCoach(context = {}, studentId = "", url = null, ownOnly = false) {
    if (!enabled) return { guard: { allowed: false, statusCode: 503, response: { erro: "evidence_coach_disabled" } } };
    const guard = requireCoachAccess(context); if (!guard.allowed) return { guard };
    const evolution = studentEvolutionManager.studentEvolution(context, studentId, url, ownOnly || guard.role === "aluno");
    if (evolution.guard && !evolution.guard.allowed) return evolution;
    const contextPack = buildStudentContextPack(evolution);
    const feedbackQuality = evaluateFeedbackQuality(contextPack);
    const recommendations = buildCoachRecommendations(contextPack);
    return {
      ok: true,
      mvp: "MVP-33 Evidence-First Coach",
      tenant_slug: context.tenant_slug,
      actor_role: guard.role,
      context_pack: contextPack,
      feedback_quality: feedbackQuality,
      recommendations,
      guardrails: {
        evidence_only: true,
        insufficient_data_is_explicit: !feedbackQuality.sufficient,
        no_diagnosis: true,
        no_automatic_sensitive_action: true,
        professor_review_required_for_training_change: true,
      },
    };
  }
  function tenantBrief(context = {}, url = null) {
    if (!enabled) return { guard: { allowed: false, statusCode: 503, response: { erro: "evidence_coach_disabled" } } };
    const guard = requireCoachAccess(context); if (!guard.allowed) return { guard };
    if (guard.role === "aluno") return { guard: { allowed: false, statusCode: 403, response: { erro: "acesso_negado", mensagem: "Aluno usa apenas o próprio Coach." } } };
    const evolution = studentEvolutionManager.tenantEvolution(context, url);
    if (evolution.guard && !evolution.guard.allowed) return evolution;
    const students = evolution.students || [];
    const attention = students.map((student) => ({ student_id: student.student_id, student_name: student.student_name, weekly_frequency: number(student.weekly_frequency), progress_percent: number(student.progress_percent), average_effort: student.average_effort == null ? null : number(student.average_effort) }))
      .filter((item) => item.weekly_frequency === 0 || item.progress_percent < 60 || (item.average_effort != null && item.average_effort >= 9))
      .slice(0, 12);
    return { ok: true, mvp: "MVP-33 Evidence-First Coach", tenant_slug: context.tenant_slug, summary: evolution.summary || {}, attention, next_action_count: attention.length, claim: "Sinais operacionais baseados apenas nos dados visíveis da unidade; não substituem avaliação profissional." };
  }
  return { enabled, status, studentCoach, tenantBrief };
}
