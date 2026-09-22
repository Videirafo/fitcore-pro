// FITCORE PRO — #91 Athlete 360
// Unified operational read model over existing sources; only structured goals are new persistence.

import { execFileSync } from "node:child_process";
import { normalizeRole } from "./access-context.mjs";

function clean(value, fallback = "", max = 240) {
  const text = String(value ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ").trim().slice(0, max);
  return text || fallback;
}
function displayClean(value, fallback = "", max = 240) {
  const text = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return text || fallback;
}
function sqlText(value) { return `'${String(value ?? "").replace(/'/g, "''")}'`; }
function jsonScalar(value) { const text = String(value || "").trim(); return text ? JSON.parse(text) : null; }
function boolEnv(value, fallback = true) {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  return ["1","true","yes","on","sim"].includes(String(value).trim().toLowerCase());
}
function dbConnection(env = process.env) {
  const dbUrl = clean(env.FITCORE_DATABASE_URL || env.DATABASE_URL || "", "", 900);
  if (!dbUrl) throw new Error("FITCORE_DATABASE_URL ausente para Athlete 360.");
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
    maxBuffer: 16 * 1024 * 1024,
  }).trim();
}
function scalar(env, sql) { return runSql(env, sql).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1) || ""; }
function tenantSession(context) {
  if (!context?.tenant_id) throw new Error("tenant_id ausente na sessão assinada.");
  return `SELECT set_config('app.tenant_id', ${sqlText(context.tenant_id)}, false);`;
}
function signedGuard(context = {}) {
  if (!context?.session_signed || !context?.tenant_id || !context?.actor_id) {
    return { allowed: false, statusCode: 401, response: { erro: "sessao_obrigatoria", mensagem: "Faça login para acessar o Athlete 360." } };
  }
  const role = normalizeRole(context.actor_role);
  if (!["gestor","professor","aluno"].includes(role)) {
    return { allowed: false, statusCode: 403, response: { erro: "athlete360_role_forbidden", mensagem: "Perfil sem acesso ao Athlete 360." } };
  }
  return { allowed: true, role };
}
function sqlUuid(value) { return value ? `${sqlText(clean(value, "", 90))}::uuid` : "NULL"; }
function sqlNumeric(value) {
  if (value === null || value === undefined || value === "") return "NULL";
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw Object.assign(new Error("athlete360_goal_invalid"), { statusCode: 400 });
  return String(n);
}
function sqlDate(value) {
  const raw = clean(value, "", 20);
  if (!raw) return "NULL";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw Object.assign(new Error("athlete360_goal_invalid"), { statusCode: 400 });
  return `${sqlText(raw)}::date`;
}
function mapDbError(error) {
  const message = error instanceof Error ? String(error.message || "") : String(error || "");
  const codes = [
    "athlete360_session_required","athlete360_tenant_context_mismatch","athlete360_role_forbidden",
    "athlete360_student_not_found_or_forbidden","athlete360_goal_invalid","athlete360_goal_not_found",
  ];
  const code = codes.find((item) => message.includes(item));
  if (!code) return error;
  const statusCode =
    code === "athlete360_session_required" ? 401 :
    code.includes("forbidden") || code.includes("tenant_context") ? 403 :
    code === "athlete360_goal_not_found" ? 404 : 400;
  return Object.assign(new Error(code), { statusCode, code });
}

export function createAthlete360Manager(env = process.env, assessmentManager = null) {
  const enabled = boolEnv(env.FITCORE_ATHLETE_360_ENABLED, true);

  function status(context = {}) {
    return {
      ok: true,
      product: "Athlete 360",
      issue: 91,
      enabled,
      tenant_scoped: true,
      roles: ["gestor","professor","aluno"],
      source_of_truth: ["fitcore_students","fitcore_workouts","fitcore_workout_executions","fitcore_execution_decisions","fitcore_athlete_goals","fitcore_assessments"],
      new_persistence: ["fitcore_athlete_goals","fitcore_athlete_goal_events"],
      availability: { physical_assessments: Boolean(assessmentManager?.enabled), physical_assessments_issue: 92, pr_engine: false, pr_engine_issue: 95 },
      privacy: { minimum_identity: true, health_assessment_summary_included: Boolean(assessmentManager?.enabled), raw_anamnesis_in_snapshot: false, clinical_inference: false, ai_consent_respected: true },
      endpoints: [
        "GET /api/vnext/athlete-360/status",
        "GET /api/vnext/athlete-360/me",
        "GET /api/vnext/athlete-360/students/:id",
        "POST /api/vnext/athlete-360/me/goals",
        "POST /api/vnext/athlete-360/students/:id/goals",
        "POST /api/vnext/athlete-360/goals/:id",
      ],
      actor_role: normalizeRole(context.actor_role || "visitante"),
    };
  }

  function snapshot(context = {}, studentId = "") {
    if (!enabled) return { guard: { allowed: false, statusCode: 503, response: { erro: "athlete360_disabled" } } };
    const guard = signedGuard(context); if (!guard.allowed) return { guard };
    try {
      const raw = scalar(env, `
        ${tenantSession(context)}
        SELECT fitcore_athlete_360_snapshot(
          ${sqlText(context.tenant_id)}::uuid,
          ${sqlText(context.actor_id)}::uuid,
          ${sqlText(guard.role)},
          ${sqlUuid(studentId)}
        )::text;
      `);
      const athlete = jsonScalar(raw);
      if (!athlete?.student_id) return { guard: { allowed: false, statusCode: 404, response: { erro: "athlete360_not_found" } } };
      if (assessmentManager?.enabled) {
        const assessmentResult = assessmentManager.summary(context, athlete.student_id);
        if (!assessmentResult?.guard && assessmentResult?.summary) {
          athlete.assessments = assessmentResult.summary;
          athlete.availability = { ...(athlete.availability || {}), physical_assessments: true, physical_assessments_issue: 92 };
          athlete.privacy = { ...(athlete.privacy || {}), health_assessment_summary_included: true, raw_anamnesis_in_snapshot: false, clinical_inference: false };
        }
      }
      return { ok: true, product: "Athlete 360", tenant_slug: context.tenant_slug, actor_role: guard.role, athlete };
    } catch (error) {
      const mapped = mapDbError(error);
      return { guard: { allowed: false, statusCode: mapped.statusCode || 500, response: { erro: mapped.code || mapped.message || "athlete360_failed" } } };
    }
  }

  function createGoal(context = {}, studentId = "", input = {}) {
    if (!enabled) return { guard: { allowed: false, statusCode: 503, response: { erro: "athlete360_disabled" } } };
    const guard = signedGuard(context); if (!guard.allowed) return { guard };
    const title = displayClean(input.title || input.titulo, "", 180);
    const goalCode = clean(input.goal_code || input.codigo || "general_progress", "general_progress", 80).toLowerCase().replace(/[^a-z0-9_.:-]+/g, "_");
    const unit = displayClean(input.target_unit || input.unidade, "", 40);
    const priority = clean(input.priority || input.prioridade || "medium", "medium", 20).toLowerCase();
    const targetStudent = studentId || (guard.role === "aluno" ? "" : clean(input.student_id, "", 90));
    try {
      const raw = scalar(env, `
        ${tenantSession(context)}
        SELECT fitcore_athlete_goal_create(
          ${sqlText(context.tenant_id)}::uuid,
          ${sqlText(context.actor_id)}::uuid,
          ${sqlText(guard.role)},
          ${targetStudent ? `${sqlText(targetStudent)}::uuid` : `fitcore_athlete_360_accessible_student(${sqlText(context.tenant_id)}::uuid,${sqlText(context.actor_id)}::uuid,${sqlText(guard.role)},NULL)`},
          ${sqlText(title)},
          ${sqlText(goalCode)},
          ${sqlNumeric(input.target_value ?? input.valor_alvo)},
          ${unit ? sqlText(unit) : "NULL"},
          ${sqlDate(input.target_date || input.data_alvo)},
          ${sqlText(priority)}
        )::text;
      `);
      const goal = jsonScalar(raw);
      recordAudit(context, goal?.student_id || targetStudent || null, "athlete_goal_created", { goal_id: goal?.id, goal_code: goal?.goal_code });
      return { ok: true, product: "Athlete 360", goal };
    } catch (error) {
      const mapped = mapDbError(error);
      return { guard: { allowed: false, statusCode: mapped.statusCode || 500, response: { erro: mapped.code || mapped.message || "athlete360_goal_failed" } } };
    }
  }

  function updateGoal(context = {}, goalId = "", input = {}) {
    if (!enabled) return { guard: { allowed: false, statusCode: 503, response: { erro: "athlete360_disabled" } } };
    const guard = signedGuard(context); if (!guard.allowed) return { guard };
    const statusValue = clean(input.status || "", "", 20).toLowerCase();
    const reason = clean(input.reason_code || "goal_updated", "goal_updated", 120).toLowerCase().replace(/[^a-z0-9_.:-]+/g, "_");
    try {
      const raw = scalar(env, `
        ${tenantSession(context)}
        SELECT fitcore_athlete_goal_update(
          ${sqlText(context.tenant_id)}::uuid,
          ${sqlText(context.actor_id)}::uuid,
          ${sqlText(guard.role)},
          ${sqlText(clean(goalId, "", 90))}::uuid,
          ${sqlNumeric(input.progress_value ?? input.progresso)},
          ${statusValue ? sqlText(statusValue) : "NULL"},
          ${sqlText(reason)}
        )::text;
      `);
      const goal = jsonScalar(raw);
      recordAudit(context, goal?.student_id || null, "athlete_goal_updated", { goal_id: goal?.id, status: goal?.status });
      return { ok: true, product: "Athlete 360", goal };
    } catch (error) {
      const mapped = mapDbError(error);
      return { guard: { allowed: false, statusCode: mapped.statusCode || 500, response: { erro: mapped.code || mapped.message || "athlete360_goal_failed" } } };
    }
  }

  function recordAudit(context, studentId, action, detail = {}) {
    try {
      scalar(env, `
        ${tenantSession(context)}
        INSERT INTO fitcore_audit_events(
          tenant_id,actor_id,actor_role,recurso_tipo,recurso_id,acao,status,detalhe
        ) VALUES (
          ${sqlText(context.tenant_id)}::uuid,
          ${sqlText(context.actor_id)}::uuid,
          ${sqlText(normalizeRole(context.actor_role))},
          'athlete_360',
          ${studentId ? `${sqlText(studentId)}::uuid` : "NULL"},
          ${sqlText(action)},
          'ok',
          ${sqlText(JSON.stringify(detail).slice(0,420))}
        ) RETURNING id::text;
      `);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  return { enabled, status, snapshot, createGoal, updateGoal };
}
