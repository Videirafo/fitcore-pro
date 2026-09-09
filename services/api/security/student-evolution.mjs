// FITCORE PRO — MVP-26
// Histórico e evolução do aluno: execuções, esforço médio, frequência e progresso por tenant.

import { execFileSync } from "node:child_process";
import { normalizeRole } from "./access-context.mjs";

function clean(value, fallback = "", max = 240) {
  const text = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return text || fallback;
}
function displayClean(value, fallback = "", max = 240) {
  const text = String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return text || fallback;
}
function sqlText(value) { return `'${String(value ?? "").replace(/'/g, "''")}'`; }
function jsonScalar(value) { const text = String(value || "").trim(); return text ? JSON.parse(text) : null; }
function boolEnv(value, fallback = false) {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  return ["1", "true", "yes", "on", "sim"].includes(String(value).trim().toLowerCase());
}
function intValue(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(Math.max(safe, min), max);
}
function dbConnection(env = process.env) {
  const dbUrl = clean(env.FITCORE_DATABASE_URL || env.DATABASE_URL || "", "", 900);
  if (!dbUrl) throw new Error("FITCORE_DATABASE_URL ausente para MVP-26.");
  const parsed = new URL(dbUrl);
  return { args: ["-h", parsed.hostname, "-p", parsed.port || "5432", "-U", decodeURIComponent(parsed.username), "-d", decodeURIComponent(parsed.pathname.replace(/^\//, ""))], env: { PGPASSWORD: decodeURIComponent(parsed.password || ""), PGCONNECT_TIMEOUT: "5", PGSSLMODE: parsed.searchParams.get("sslmode") || "disable" } };
}
function runSql(env, sql) {
  const connection = dbConnection(env);
  return execFileSync(clean(env.FITCORE_PSQL_BIN || "psql", "psql", 120), [...connection.args, "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8", env: { ...process.env, ...connection.env }, timeout: 25000, maxBuffer: 12 * 1024 * 1024 }).trim();
}
function scalar(env, sql) { return runSql(env, sql).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1) || ""; }
function tenantScope(context) {
  if (!context?.tenant_id) throw new Error("tenant_id ausente na sessão assinada.");
  return `scope AS (SELECT set_config('app.tenant_id', ${sqlText(context.tenant_id)}, true))`;
}
function setTenantSession(context) {
  if (!context?.tenant_id) throw new Error("tenant_id ausente na sessão assinada.");
  return `SELECT set_config('app.tenant_id', ${sqlText(context.tenant_id)}, false);`;
}
function requireSigned(context = {}) {
  if (!context?.session_signed || !context?.tenant_id || !context?.actor_id) return { allowed: false, statusCode: 401, response: { erro: "sessao_obrigatoria", mensagem: "Faça login para ver evolução." } };
  return { allowed: true };
}
function requireStaff(context = {}) {
  const signed = requireSigned(context); if (!signed.allowed) return signed;
  const role = normalizeRole(context.actor_role);
  if (!["gestor", "professor"].includes(role)) return { allowed: false, statusCode: 403, response: { erro: "acesso_negado", mensagem: "Somente gestor ou professor acessa painel de evolução do tenant.", papel: role } };
  return { allowed: true };
}
function assertRequestedTenant(context = {}, requestedSlug = "") {
  const requested = clean(requestedSlug || "", "", 80);
  if (requested && requested !== context.tenant_slug) return { allowed: false, statusCode: 403, response: { erro: "tenant_cross_access_blocked", mensagem: "A sessão só pode acessar evolução do próprio tenant.", session_tenant_slug: context.tenant_slug, requested_tenant_slug: requested } };
  return { allowed: true };
}
function baseRowsSql(context, extraWhere = "true") {
  return `
    WITH ${tenantScope(context)}, latest_review AS (
      SELECT DISTINCT ON (workout_id) * FROM fitcore_professor_reviews WHERE tenant_id = ${sqlText(context.tenant_id)}::uuid ORDER BY workout_id, atualizado_em DESC, criado_em DESC
    ), rows AS (
      SELECT e.id, e.tenant_id, e.workout_id, e.student_id, e.status, e.percepcao_esforco, e.duracao_minutos, e.iniciado_em, e.concluido_em, e.atualizado_em,
        COALESCE(jsonb_array_length(e.exercise_progress), 0) AS exercicios_total,
        COALESCE((SELECT count(*) FROM jsonb_array_elements(e.exercise_progress) item WHERE item->>'status' = 'feito'), 0) AS exercicios_feitos,
        s.nome_publico AS student_name, s.user_id AS student_user_id, s.professor_id AS student_professor_id,
        COALESCE(w.payload->>'nome_treino','Treino') AS nome_treino, w.objetivo, w.dias_semana,
        COALESCE(r.professor_id, s.professor_id, w.professor_responsavel_id) AS professor_id,
        p.nome AS professor_name
      FROM fitcore_workout_executions e
      JOIN fitcore_workouts w ON w.id = e.workout_id AND w.tenant_id = e.tenant_id
      JOIN fitcore_students s ON s.id = e.student_id AND s.tenant_id = e.tenant_id
      LEFT JOIN latest_review r ON r.workout_id = w.id AND r.tenant_id = w.tenant_id
      LEFT JOIN fitcore_users p ON p.id = COALESCE(r.professor_id, s.professor_id, w.professor_responsavel_id) AND p.tenant_id = e.tenant_id
      JOIN scope ON true
      WHERE e.tenant_id = ${sqlText(context.tenant_id)}::uuid AND ${extraWhere}
    )`;
}
function accessWhere(context = {}, mode = "staff") {
  const role = normalizeRole(context.actor_role);
  if (mode === "own" || role === "aluno") return `s.user_id = ${sqlText(context.actor_id)}::uuid`;
  if (role === "professor") return `(s.professor_id = ${sqlText(context.actor_id)}::uuid OR r.professor_id = ${sqlText(context.actor_id)}::uuid OR w.professor_responsavel_id = ${sqlText(context.actor_id)}::uuid)`;
  return "true";
}
function publicStudent(item = {}) {
  const total = Number(item.total_executions || 0);
  const completed = Number(item.completed_executions || 0);
  const progress = total ? Math.round((completed / total) * 100) : 0;
  return { student_id: item.student_id, student_name: item.student_name, professor_id: item.professor_id || null, professor_name: item.professor_name || null, total_executions: total, completed_executions: completed, active_executions: Number(item.active_executions || 0), average_effort: item.average_effort === null ? null : Number(item.average_effort), average_duration: item.average_duration === null ? null : Number(item.average_duration), weekly_frequency: Number(item.weekly_frequency || 0), progress_percent: progress, last_execution_at: item.last_execution_at || null };
}
export function createStudentEvolutionManager(env = process.env) {
  const enabled = boolEnv(env.FITCORE_STUDENT_EVOLUTION_ENABLED, true);
  function status(context = {}) {
    return { ok: true, mvp: "MVP-26 Student Evolution", enabled, tenant_slug: context?.tenant_slug || null, actor_role: context?.actor_role || null, tenant_scoped: true, history: true, average_effort: true, weekly_frequency: true, professor_dashboard: true, charts_tables: true, endpoints: ["GET /api/mvp-26/status", "GET /api/mvp-26/evolution", "GET /api/mvp-26/my-evolution", "GET /api/mvp-26/students/:id/evolution"] };
  }
  function recordEvent(context = {}, studentId = null, evento = "evolution_viewed", detalhe = "", payload = {}) {
    try { scalar(env, `WITH ${tenantScope(context)}, ev AS (INSERT INTO fitcore_student_evolution_events (tenant_id, student_id, actor_id, evento, detalhe, payload) SELECT ${sqlText(context.tenant_id)}::uuid, ${studentId ? `${sqlText(studentId)}::uuid` : "NULL"}, ${sqlText(context.actor_id)}::uuid, ${sqlText(evento)}, ${sqlText(displayClean(detalhe, "MVP-26 evolução", 420))}, ${sqlText(JSON.stringify(payload))}::jsonb FROM scope RETURNING id), audit AS (INSERT INTO fitcore_audit_events (tenant_id, actor_id, actor_role, recurso_tipo, recurso_id, acao, status, detalhe) SELECT ${sqlText(context.tenant_id)}::uuid, ${sqlText(context.actor_id)}::uuid, ${sqlText(normalizeRole(context.actor_role || "sistema"))}, 'student_evolution', ${studentId ? `${sqlText(studentId)}::uuid` : "NULL"}, ${sqlText(evento)}, 'ok', ${sqlText(displayClean(detalhe, "MVP-26 evolução", 420))} FROM scope) SELECT count(*)::text FROM ev;`); return { ok: true, persisted: true }; } catch (error) { return { ok: false, persisted: false, error: error instanceof Error ? error.message : String(error) }; }
  }
  function tenantEvolution(context = {}, url = null) {
    if (!enabled) return { guard: { allowed: false, statusCode: 503, response: { erro: "student_evolution_disabled" } } };
    const guard = requireStaff(context); if (!guard.allowed) return { guard };
    const tenantGuard = assertRequestedTenant(context, url?.searchParams?.get("tenant_slug") || url?.searchParams?.get("tenant") || ""); if (!tenantGuard.allowed) return { guard: tenantGuard };
    const limit = intValue(url?.searchParams?.get("limit"), 50, 1, 200);
    const where = accessWhere(context, "staff");
    const raw = scalar(env, `${setTenantSession(context)} ${baseRowsSql(context, where)}, per_student AS (
      SELECT student_id, student_name, professor_id, professor_name,
        count(*) AS total_executions,
        count(*) FILTER (WHERE status = 'concluido') AS completed_executions,
        count(*) FILTER (WHERE status = 'em_execucao') AS active_executions,
        round(avg(percepcao_esforco) FILTER (WHERE percepcao_esforco IS NOT NULL), 1) AS average_effort,
        round(avg(duracao_minutos) FILTER (WHERE duracao_minutos IS NOT NULL), 1) AS average_duration,
        count(*) FILTER (WHERE iniciado_em >= now() - interval '7 days') AS weekly_frequency,
        max(coalesce(concluido_em, iniciado_em, atualizado_em)) AS last_execution_at
      FROM rows GROUP BY student_id, student_name, professor_id, professor_name ORDER BY last_execution_at DESC NULLS LAST LIMIT ${limit}
    ), by_week AS (
      SELECT to_char(date_trunc('week', coalesce(concluido_em, iniciado_em, atualizado_em)), 'YYYY-MM-DD') AS week, count(*) AS executions, count(*) FILTER (WHERE status='concluido') AS completed, round(avg(percepcao_esforco) FILTER (WHERE percepcao_esforco IS NOT NULL), 1) AS average_effort FROM rows GROUP BY 1 ORDER BY 1 DESC LIMIT 8
    ) SELECT jsonb_build_object('students', COALESCE((SELECT jsonb_agg(to_jsonb(per_student)) FROM per_student), '[]'::jsonb), 'weekly', COALESCE((SELECT jsonb_agg(to_jsonb(by_week) ORDER BY week) FROM by_week), '[]'::jsonb), 'summary', jsonb_build_object('students', (SELECT count(DISTINCT student_id) FROM rows), 'executions', (SELECT count(*) FROM rows), 'completed', (SELECT count(*) FROM rows WHERE status='concluido'), 'active', (SELECT count(*) FROM rows WHERE status='em_execucao'), 'average_effort', (SELECT round(avg(percepcao_esforco),1) FROM rows WHERE percepcao_esforco IS NOT NULL), 'average_duration', (SELECT round(avg(duracao_minutos),1) FROM rows WHERE duracao_minutos IS NOT NULL)))::text;`);
    const data = jsonScalar(raw) || { students: [], weekly: [], summary: {} };
    const audit = recordEvent(context, null, "evolution_dashboard_viewed", "painel de evolução do tenant", { students: data.summary?.students || 0 });
    return { ok: true, mvp: "MVP-26 Student Evolution", tenant_slug: context.tenant_slug, actor_role: normalizeRole(context.actor_role), students: (data.students || []).map(publicStudent), weekly: data.weekly || [], summary: data.summary || {}, audit };
  }
  function studentEvolution(context = {}, studentId = "", url = null, ownOnly = false) {
    if (!enabled) return { guard: { allowed: false, statusCode: 503, response: { erro: "student_evolution_disabled" } } };
    const signed = requireSigned(context); if (!signed.allowed) return { guard: signed };
    const tenantGuard = assertRequestedTenant(context, url?.searchParams?.get("tenant_slug") || url?.searchParams?.get("tenant") || ""); if (!tenantGuard.allowed) return { guard: tenantGuard };
    const role = normalizeRole(context.actor_role);
    const cleanStudent = clean(studentId || "", "", 90);
    const access = ownOnly || role === "aluno" ? `s.user_id = ${sqlText(context.actor_id)}::uuid` : role === "professor" ? `(s.professor_id = ${sqlText(context.actor_id)}::uuid OR r.professor_id = ${sqlText(context.actor_id)}::uuid OR w.professor_responsavel_id = ${sqlText(context.actor_id)}::uuid)` : "true";
    const studentFilter = cleanStudent ? `s.id = ${sqlText(cleanStudent)}::uuid` : `s.user_id = ${sqlText(context.actor_id)}::uuid`;
    if (!ownOnly && role === "aluno" && cleanStudent) return { guard: { allowed: false, statusCode: 403, response: { erro: "acesso_negado", mensagem: "Aluno só consulta a própria evolução." } } };
    const raw = scalar(env, `${setTenantSession(context)} ${baseRowsSql(context, `${studentFilter} AND ${access}`)}, ordered AS (SELECT * FROM rows ORDER BY coalesce(concluido_em, iniciado_em, atualizado_em) DESC LIMIT 80), summary AS (SELECT student_id, student_name, professor_id, professor_name, count(*) AS total_executions, count(*) FILTER (WHERE status='concluido') AS completed_executions, count(*) FILTER (WHERE status='em_execucao') AS active_executions, round(avg(percepcao_esforco) FILTER (WHERE percepcao_esforco IS NOT NULL),1) AS average_effort, round(avg(duracao_minutos) FILTER (WHERE duracao_minutos IS NOT NULL),1) AS average_duration, count(*) FILTER (WHERE iniciado_em >= now() - interval '7 days') AS weekly_frequency, max(coalesce(concluido_em,iniciado_em,atualizado_em)) AS last_execution_at FROM rows GROUP BY student_id, student_name, professor_id, professor_name), by_workout AS (SELECT workout_id, nome_treino, objetivo, count(*) AS executions, count(*) FILTER (WHERE status='concluido') AS completed, round(avg(percepcao_esforco) FILTER (WHERE percepcao_esforco IS NOT NULL),1) AS average_effort, round(avg(duracao_minutos) FILTER (WHERE duracao_minutos IS NOT NULL),1) AS average_duration, max(coalesce(concluido_em,iniciado_em,atualizado_em)) AS last_at FROM rows GROUP BY workout_id, nome_treino, objetivo ORDER BY last_at DESC LIMIT 20), history AS (SELECT id, workout_id, nome_treino, objetivo, status, percepcao_esforco, duracao_minutos, exercicios_total, exercicios_feitos, CASE WHEN exercicios_total > 0 THEN round((exercicios_feitos::numeric / exercicios_total::numeric) * 100)::int ELSE 0 END AS progress_percent, iniciado_em, concluido_em FROM ordered) SELECT jsonb_build_object('student', (SELECT to_jsonb(summary) FROM summary LIMIT 1), 'by_workout', COALESCE((SELECT jsonb_agg(to_jsonb(by_workout)) FROM by_workout), '[]'::jsonb), 'history', COALESCE((SELECT jsonb_agg(to_jsonb(history)) FROM history), '[]'::jsonb))::text;`);
    const data = jsonScalar(raw) || { student: null, by_workout: [], history: [] };
    if (!data.student) return { guard: { allowed: false, statusCode: 404, response: { erro: "evolucao_nao_encontrada", mensagem: "Não há execuções visíveis para este aluno." } } };
    const student = publicStudent(data.student);
    const audit = recordEvent(context, student.student_id, "student_evolution_viewed", `evolução consultada: ${student.student_name}`, { executions: student.total_executions });
    return { ok: true, mvp: "MVP-26 Student Evolution", tenant_slug: context.tenant_slug, actor_role: role, own_only: ownOnly || role === "aluno", student, by_workout: data.by_workout || [], history: data.history || [], audit };
  }
  return { enabled, status, tenantEvolution, studentEvolution };
}
