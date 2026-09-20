// FITCORE PRO — MVP-25
// Execução real do treino pelo aluno: iniciar, marcar exercício, registrar esforço/duração e concluir.

import { execFileSync } from "node:child_process";
import { normalizeRole } from "./access-context.mjs";

const EXECUTION_STATUS = new Set(["em_execucao", "concluido", "cancelado"]);

function clean(value, fallback = "", max = 240) {
  const text = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return text || fallback;
}
function displayClean(value, fallback = "", max = 240) {
  const text = String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return text || fallback;
}
function sqlText(value) { return `'${String(value ?? "").replace(/'/g, "''")}'`; }
function sqlJson(value) { return `${sqlText(JSON.stringify(value ?? {}))}::jsonb`; }
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
function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}
function dbConnection(env = process.env) {
  const dbUrl = clean(env.FITCORE_DATABASE_URL || env.DATABASE_URL || "", "", 900);
  if (!dbUrl) throw new Error("FITCORE_DATABASE_URL ausente para MVP-25.");
  const parsed = new URL(dbUrl);
  return {
    args: ["-h", parsed.hostname, "-p", parsed.port || "5432", "-U", decodeURIComponent(parsed.username), "-d", decodeURIComponent(parsed.pathname.replace(/^\//, ""))],
    env: { PGPASSWORD: decodeURIComponent(parsed.password || ""), PGCONNECT_TIMEOUT: "5", PGSSLMODE: parsed.searchParams.get("sslmode") || "disable" },
  };
}
function runSql(env, sql) {
  const connection = dbConnection(env);
  return execFileSync(clean(env.FITCORE_PSQL_BIN || "psql", "psql", 120), [...connection.args, "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8", env: { ...process.env, ...connection.env }, timeout: 25000, maxBuffer: 10 * 1024 * 1024,
  }).trim();
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
  if (!context?.session_signed || !context?.tenant_id || !context?.actor_id) {
    return { allowed: false, statusCode: 401, response: { erro: "sessao_obrigatoria", mensagem: "Faça login para executar treino." } };
  }
  return { allowed: true };
}
function requireAluno(context = {}) {
  const signed = requireSigned(context); if (!signed.allowed) return signed;
  if (normalizeRole(context.actor_role) !== "aluno") return { allowed: false, statusCode: 403, response: { erro: "acesso_negado", mensagem: "Somente o aluno inicia e conclui o próprio treino.", papel: context.actor_role } };
  return { allowed: true };
}
function requireStaff(context = {}) {
  const signed = requireSigned(context); if (!signed.allowed) return signed;
  const role = normalizeRole(context.actor_role);
  if (!["gestor", "professor"].includes(role)) return { allowed: false, statusCode: 403, response: { erro: "acesso_negado", mensagem: "Somente gestor ou professor acompanha execuções.", papel: role } };
  return { allowed: true };
}
function assertRequestedTenant(context = {}, requestedSlug = "") {
  const requested = clean(requestedSlug || "", "", 80);
  if (requested && requested !== context.tenant_slug) return { allowed: false, statusCode: 403, response: { erro: "tenant_cross_access_blocked", mensagem: "A sessão só pode acessar execuções do próprio tenant.", session_tenant_slug: context.tenant_slug, requested_tenant_slug: requested } };
  return { allowed: true };
}
function normalizeItems(items = []) {
  return Array.isArray(items) ? items.map((item, index) => ({ index, nome: displayClean(item?.nome || item?.name || `Exercício ${index + 1}`, `Exercício ${index + 1}`, 120), status: clean(item?.status || "pendente", "pendente", 30), feito_em: item?.feito_em || null, observacao: displayClean(item?.observacao || item?.observacoes || "", "", 240) })) : [];
}
export const WORKOUT_ACTION_IDS = Object.freeze({
  START: "fitcore.workout.execution.start",
  EXERCISE_COMPLETE: "fitcore.workout.exercise.complete",
  FINISH: "fitcore.workout.execution.finish",
});

export function buildWorkoutActionBinding(actionId, { id = "", index = 0, input = {} } = {}) {
  if (actionId === WORKOUT_ACTION_IDS.START) {
    return {
      workout_id: clean(input.workout_id || input.prescription_id || "", "", 90),
      observacoes: displayClean(input.observacoes || "", "", 500),
    };
  }
  if (actionId === WORKOUT_ACTION_IDS.EXERCISE_COMPLETE) {
    return {
      execution_id: clean(id, "", 90),
      index: intValue(index, 0, 0, 500),
      observacao: displayClean(input.observacao || input.observacoes || "", "", 240),
    };
  }
  if (actionId === WORKOUT_ACTION_IDS.FINISH) {
    return {
      execution_id: clean(id, "", 90),
      percepcao_esforco: intValue(input.percepcao_esforco || input.esforco, 5, 1, 10),
      duracao_minutos: intValue(input.duracao_minutos || input.duracao || 30, 1, 1, 480),
      observacoes: displayClean(input.observacoes || input.observacao || "Treino concluído pelo aluno.", "Treino concluído pelo aluno.", 600),
    };
  }
  throw new Error("workout_action_unknown");
}

function publicExecution(row) {
  if (!row) return null;
  const progress = normalizeItems(row.exercise_progress || row.progresso || []);
  const done = progress.filter((item) => item.status === "feito").length;
  return {
    id: row.id, tenant_id: row.tenant_id, tenant_slug: row.tenant_slug || null,
    workout_id: row.workout_id, student_id: row.student_id, student_name: row.student_name || null, student_user_id: row.student_user_id || null,
    professor_id: row.professor_id || null, professor_name: row.professor_name || null,
    nome_treino: row.nome_treino || row.payload?.nome_treino || "Treino",
    objetivo: row.objetivo || null, status: row.status, percepcao_esforco: row.percepcao_esforco || null, duracao_minutos: row.duracao_minutos || null,
    iniciado_em: row.iniciado_em || null, concluido_em: row.concluido_em || null, criado_em: row.criado_em || null, atualizado_em: row.atualizado_em || null,
    exercicios_total: progress.length, exercicios_feitos: done, progresso_percentual: progress.length ? Math.round((done / progress.length) * 100) : 0,
    exercise_progress: progress, observacoes: row.observacoes || null, orientacoes: row.orientacoes || row.payload?.orientacoes || null,
  };
}
export function createWorkoutExecutionManager(env = process.env, { executionKernel = null } = {}) {
  const enabled = boolEnv(env.FITCORE_WORKOUT_EXECUTION_ENABLED, true);
  function requireExecutionCapability(context, actionId, binding, authority = {}) {
    if (!executionKernel?.authorizeEffect) {
      return { allowed: false, statusCode: 503, response: { erro: "execution_kernel_authority_unavailable" } };
    }
    try {
      const execution = executionKernel.authorizeEffect(authority.capability, {
        tenantId: context.tenant_id,
        actorUserId: context.actor_id,
        actionId,
        binding,
      });
      return { allowed: true, execution };
    } catch (error) {
      return {
        allowed: false,
        statusCode: error?.statusCode || 403,
        response: { erro: error?.code || "execution_capability_invalid", mensagem: "A mutação exige capability válida do Execution Kernel." },
      };
    }
  }
  function status(context = {}) {
    return { ok: true, mvp: "MVP-25 Workout Execution", enabled, tenant_slug: context?.tenant_slug || null, actor_role: context?.actor_role || null, tenant_scoped: true, aluno_starts_approved_workout: true, exercise_progress: true, staff_monitoring: true, audit_required: true, endpoints: ["GET /api/mvp-25/status", "POST /api/mvp-25/executions/start", "GET /api/mvp-25/my-executions", "GET /api/mvp-25/executions", "GET /api/mvp-25/executions/:id", "POST /api/mvp-25/executions/:id/exercises/:index/done", "POST /api/mvp-25/executions/:id/finish"] };
  }
  function recordEvent(context = {}, execution = {}, evento = "execution_event", detalhe = "", payload = {}, exerciseIndex = null) {
    try {
      runSql(env, `
        WITH ${tenantScope(context)}, created AS (
          INSERT INTO fitcore_workout_execution_events (tenant_id, execution_id, workout_id, student_id, actor_id, evento, status, exercise_index, detalhe, payload)
          SELECT ${sqlText(context.tenant_id)}::uuid, ${sqlText(execution.id)}::uuid, ${sqlText(execution.workout_id)}::uuid, ${sqlText(execution.student_id)}::uuid, ${sqlText(context.actor_id)}::uuid, ${sqlText(clean(evento, "execution_event", 90))}, 'ok', ${exerciseIndex === null ? "NULL" : intValue(exerciseIndex, 0, 0, 500)}, ${sqlText(displayClean(detalhe, "MVP-25 execução", 420))}, ${sqlJson(payload)} FROM scope RETURNING id
        ), audit AS (
          INSERT INTO fitcore_audit_events (tenant_id, actor_id, actor_role, recurso_tipo, recurso_id, acao, status, detalhe)
          SELECT ${sqlText(context.tenant_id)}::uuid, ${sqlText(context.actor_id)}::uuid, ${sqlText(normalizeRole(context.actor_role || "sistema"))}, 'workout_execution', ${sqlText(execution.id)}::uuid, ${sqlText(clean(evento, "execution_event", 90))}, 'ok', ${sqlText(displayClean(detalhe, "MVP-25 execução", 420))} FROM scope
        ) SELECT count(*)::text FROM created;
      `);
      return { ok: true, persisted: true };
    } catch (error) { return { ok: false, persisted: false, error: error instanceof Error ? error.message : String(error) }; }
  }
  function rowSelect(context, where, limit = 80) {
    const raw = scalar(env, `
      ${setTenantSession(context)}
      WITH ${tenantScope(context)}, latest_review AS (
        SELECT DISTINCT ON (workout_id) * FROM fitcore_professor_reviews WHERE tenant_id = ${sqlText(context.tenant_id)}::uuid ORDER BY workout_id, atualizado_em DESC, criado_em DESC
      ), rows AS (
        SELECT e.*, s.nome_publico AS student_name, s.user_id AS student_user_id, w.objetivo, w.payload AS workout_payload, COALESCE(w.payload->>'nome_treino','Treino') AS nome_treino, COALESCE(w.payload->>'orientacoes','') AS orientacoes, COALESCE(r.professor_id, s.professor_id, w.professor_responsavel_id) AS professor_id, p.nome AS professor_name
        FROM fitcore_workout_executions e
        JOIN fitcore_workouts w ON w.id = e.workout_id AND w.tenant_id = e.tenant_id
        JOIN fitcore_students s ON s.id = e.student_id AND s.tenant_id = e.tenant_id
        LEFT JOIN latest_review r ON r.workout_id = w.id AND r.tenant_id = w.tenant_id
        LEFT JOIN fitcore_users p ON p.id = COALESCE(r.professor_id, s.professor_id, w.professor_responsavel_id) AND p.tenant_id = e.tenant_id
        JOIN scope ON true
        WHERE ${where}
        ORDER BY e.atualizado_em DESC, e.criado_em DESC
        LIMIT ${limit}
      )
      SELECT jsonb_build_object('executions', COALESCE(jsonb_agg(jsonb_build_object(
        'id', rows.id, 'tenant_id', rows.tenant_id, 'tenant_slug', ${sqlText(context.tenant_slug || "")}, 'workout_id', rows.workout_id, 'student_id', rows.student_id, 'student_name', rows.student_name, 'student_user_id', rows.student_user_id, 'professor_id', rows.professor_id, 'professor_name', rows.professor_name, 'nome_treino', rows.nome_treino, 'objetivo', rows.objetivo, 'status', rows.status, 'percepcao_esforco', rows.percepcao_esforco, 'duracao_minutos', rows.duracao_minutos, 'observacoes', rows.observacoes, 'iniciado_em', rows.iniciado_em, 'concluido_em', rows.concluido_em, 'criado_em', rows.criado_em, 'atualizado_em', rows.atualizado_em, 'exercise_progress', rows.exercise_progress, 'orientacoes', rows.orientacoes, 'payload', rows.payload
      )), '[]'::jsonb), 'total', (SELECT count(*) FROM rows), 'em_execucao', (SELECT count(*) FROM rows WHERE status = 'em_execucao'), 'concluidos', (SELECT count(*) FROM rows WHERE status = 'concluido'))::text FROM rows LIMIT 1;
    `);
    return jsonScalar(raw) || { executions: [], total: 0, em_execucao: 0, concluidos: 0 };
  }
  function listExecutions(context = {}, url = null, ownOnly = false) {
    if (!enabled) return { guard: { allowed: false, statusCode: 503, response: { erro: "workout_execution_disabled" } } };
    const signed = requireSigned(context); if (!signed.allowed) return { guard: signed };
    const role = normalizeRole(context.actor_role);
    if (!ownOnly && !["gestor", "professor", "aluno"].includes(role)) return { guard: { allowed: false, statusCode: 403, response: { erro: "acesso_negado" } } };
    const tenantGuard = assertRequestedTenant(context, url?.searchParams?.get("tenant_slug") || url?.searchParams?.get("tenant") || ""); if (!tenantGuard.allowed) return { guard: tenantGuard };
    const statusFilter = clean(url?.searchParams?.get("status") || "", "", 40).toLowerCase();
    const limit = intValue(url?.searchParams?.get("limit"), 60, 1, 200);
    const query = displayClean(url?.searchParams?.get("search") || "", "", 80).toLowerCase();
    const accessWhere = ownOnly || role === "aluno" ? `s.user_id = ${sqlText(context.actor_id)}::uuid` : role === "professor" ? `(s.professor_id = ${sqlText(context.actor_id)}::uuid OR r.professor_id = ${sqlText(context.actor_id)}::uuid OR w.professor_responsavel_id = ${sqlText(context.actor_id)}::uuid)` : "true";
    const where = [`e.tenant_id = ${sqlText(context.tenant_id)}::uuid`, accessWhere, statusFilter && EXECUTION_STATUS.has(statusFilter) ? `e.status = ${sqlText(statusFilter)}` : "true", query ? `(lower(s.nome_publico) LIKE ${sqlText(`%${query}%`)} OR lower(coalesce(w.objetivo,'')) LIKE ${sqlText(`%${query}%`)} OR lower(coalesce(w.payload->>'nome_treino','')) LIKE ${sqlText(`%${query}%`)})` : "true"].join(" AND ");
    const data = rowSelect(context, where, limit);
    return { ok: true, mvp: "MVP-25 Workout Execution", tenant_slug: context.tenant_slug, actor_role: role, own_only: ownOnly || role === "aluno", executions: data.executions.map(publicExecution), total: data.total || 0, em_execucao: data.em_execucao || 0, concluidos: data.concluidos || 0 };
  }
  function validateAction(context = {}, actionId = "", binding = {}) {
    if (!enabled) return { guard: { allowed: false, statusCode: 503, response: { erro: "workout_execution_disabled" } } };
    const guard = requireAluno(context); if (!guard.allowed) return { guard };
    if (actionId === WORKOUT_ACTION_IDS.START) {
      if (!isUuid(binding.workout_id)) return { guard: { allowed: false, statusCode: 400, response: { erro: "workout_id_invalido" } } };
      const found = scalar(env, `
        ${setTenantSession(context)}
        WITH ${tenantScope(context)}
        SELECT EXISTS(
          SELECT 1 FROM fitcore_workouts w
          JOIN fitcore_students s ON s.id=w.student_id AND s.tenant_id=w.tenant_id
          JOIN scope ON true
          WHERE w.tenant_id=${sqlText(context.tenant_id)}::uuid
            AND w.id=${sqlText(binding.workout_id)}::uuid
            AND w.status='aprovado'
            AND s.user_id=${sqlText(context.actor_id)}::uuid
        );
      `);
      if (found !== "t") return { guard: { allowed: false, statusCode: 404, response: { erro: "treino_aprovado_nao_encontrado" } } };
      return { ok: true, summary: "Iniciar treino aprovado do aluno autenticado." };
    }
    if (![WORKOUT_ACTION_IDS.EXERCISE_COMPLETE, WORKOUT_ACTION_IDS.FINISH].includes(actionId)) {
      return { guard: { allowed: false, statusCode: 404, response: { erro: "workout_action_unknown" } } };
    }
    if (!isUuid(binding.execution_id)) return { guard: { allowed: false, statusCode: 400, response: { erro: "execution_id_invalido" } } };
    const current = getExecution(context, binding.execution_id);
    if (current.guard) return current;
    if (current.execution.status !== "em_execucao") {
      return { guard: { allowed: false, statusCode: 409, response: { erro: "execucao_nao_esta_em_andamento" } } };
    }
    if (actionId === WORKOUT_ACTION_IDS.EXERCISE_COMPLETE) {
      const exists = current.execution.exercise_progress.some((item) => item.index === binding.index);
      if (!exists) return { guard: { allowed: false, statusCode: 404, response: { erro: "exercicio_da_execucao_nao_encontrado" } } };
      return { ok: true, summary: `Marcar exercício ${binding.index + 1} como concluído.` };
    }
    return { ok: true, summary: "Concluir execução do treino com esforço e duração informados." };
  }

  function startExecution(context = {}, input = {}, authority = {}) {
    if (!enabled) return { guard: { allowed: false, statusCode: 503, response: { erro: "workout_execution_disabled" } } };
    const guard = requireAluno(context); if (!guard.allowed) return { guard };
    const workoutId = clean(input.workout_id || input.prescription_id || "", "", 90);
    if (!workoutId) return { guard: { allowed: false, statusCode: 400, response: { erro: "workout_id_obrigatorio" } } };
    const binding = buildWorkoutActionBinding(WORKOUT_ACTION_IDS.START, { input });
    const capabilityGuard = requireExecutionCapability(context, WORKOUT_ACTION_IDS.START, binding, authority);
    if (!capabilityGuard.allowed) return { guard: capabilityGuard };
    const sourceMvpId = "execution-kernel:" + capabilityGuard.execution.executionId;
    const raw = scalar(env, `
      ${setTenantSession(context)}
      WITH ${tenantScope(context)}, workout_row AS (
        SELECT w.*, s.user_id AS student_user_id, s.nome_publico AS student_name, COALESCE(w.payload->'exercicios','[]'::jsonb) AS exercicios
        FROM fitcore_workouts w JOIN fitcore_students s ON s.id = w.student_id AND s.tenant_id = w.tenant_id, scope
        WHERE w.tenant_id = ${sqlText(context.tenant_id)}::uuid AND w.id = ${sqlText(workoutId)}::uuid AND w.status = 'aprovado' AND s.user_id = ${sqlText(context.actor_id)}::uuid LIMIT 1
      ), created AS (
        INSERT INTO fitcore_workout_executions (tenant_id, source_mvp_id, workout_id, student_id, status, percepcao_esforco, duracao_minutos, observacoes, iniciado_em, criado_por, started_by, exercise_progress, payload, atualizado_em)
        SELECT ${sqlText(context.tenant_id)}::uuid, ${sqlText(sourceMvpId)}, workout_row.id, workout_row.student_id, 'em_execucao', NULL, NULL, ${sqlText(displayClean(input.observacoes || "", "", 500))}, now(), ${sqlText(context.actor_id)}::uuid, ${sqlText(context.actor_id)}::uuid,
          COALESCE((SELECT jsonb_agg(jsonb_build_object('index', (ord - 1), 'nome', COALESCE(ex->>'nome', ex->>'name', 'Exercício ' || ord), 'status', 'pendente', 'feito_em', NULL, 'observacao', COALESCE(ex->>'observacao',''))) FROM jsonb_array_elements(workout_row.exercicios) WITH ORDINALITY AS arr(ex, ord)), '[]'::jsonb),
          jsonb_build_object('origem','mvp25_execution','nome_treino', COALESCE(workout_row.payload->>'nome_treino','Treino'), 'orientacoes', COALESCE(workout_row.payload->>'orientacoes','')), now()
        FROM workout_row
        ON CONFLICT (tenant_id, source_mvp_id) DO UPDATE
          SET atualizado_em = fitcore_workout_executions.atualizado_em
        RETURNING *
      )
      SELECT jsonb_build_object('id', created.id, 'tenant_id', created.tenant_id, 'tenant_slug', ${sqlText(context.tenant_slug || "")}, 'workout_id', created.workout_id, 'student_id', created.student_id, 'student_name', (SELECT student_name FROM workout_row), 'student_user_id', (SELECT student_user_id FROM workout_row), 'nome_treino', created.payload->>'nome_treino', 'objetivo', (SELECT objetivo FROM workout_row), 'status', created.status, 'percepcao_esforco', created.percepcao_esforco, 'duracao_minutos', created.duracao_minutos, 'observacoes', created.observacoes, 'iniciado_em', created.iniciado_em, 'concluido_em', created.concluido_em, 'criado_em', created.criado_em, 'atualizado_em', created.atualizado_em, 'exercise_progress', created.exercise_progress, 'orientacoes', created.payload->>'orientacoes', 'payload', created.payload)::text FROM created;
    `);
    const execution = publicExecution(jsonScalar(raw));
    if (!execution) return { guard: { allowed: false, statusCode: 404, response: { erro: "treino_aprovado_nao_encontrado", mensagem: "Treino não pertence ao aluno ou não está aprovado." } } };
    const audit = recordEvent(context, execution, "workout_execution_started", `aluno iniciou ${execution.nome_treino}`, { workout_id: execution.workout_id });
    return { ok: true, mvp: "MVP-25 Workout Execution", started: true, tenant_slug: context.tenant_slug, execution, audit };
  }
  function getExecution(context = {}, id = "") {
    const signed = requireSigned(context); if (!signed.allowed) return { guard: signed };
    const executionId = clean(id, "", 90);
    const role = normalizeRole(context.actor_role);
    const access = role === "aluno" ? `s.user_id = ${sqlText(context.actor_id)}::uuid` : role === "professor" ? `(s.professor_id = ${sqlText(context.actor_id)}::uuid OR r.professor_id = ${sqlText(context.actor_id)}::uuid OR w.professor_responsavel_id = ${sqlText(context.actor_id)}::uuid)` : "true";
    const data = rowSelect(context, `e.tenant_id = ${sqlText(context.tenant_id)}::uuid AND e.id = ${sqlText(executionId)}::uuid AND ${access}`, 1);
    const execution = publicExecution((data.executions || [])[0]);
    if (!execution) return { guard: { allowed: false, statusCode: 404, response: { erro: "execucao_nao_encontrada" } } };
    return { ok: true, mvp: "MVP-25 Workout Execution", tenant_slug: context.tenant_slug, execution };
  }
  function markExerciseDone(context = {}, id = "", index = 0, input = {}, authority = {}) {
    const guard = requireAluno(context); if (!guard.allowed) return { guard };
    const binding = buildWorkoutActionBinding(WORKOUT_ACTION_IDS.EXERCISE_COMPLETE, { id, index, input });
    const capabilityGuard = requireExecutionCapability(context, WORKOUT_ACTION_IDS.EXERCISE_COMPLETE, binding, authority);
    if (!capabilityGuard.allowed) return { guard: capabilityGuard };
    const executionId = binding.execution_id; const idx = binding.index;
    const observacao = binding.observacao;
    const raw = scalar(env, `
      ${setTenantSession(context)}
      WITH ${tenantScope(context)}, allowed_execution AS (
        SELECT e.*, s.user_id FROM fitcore_workout_executions e JOIN fitcore_students s ON s.id = e.student_id AND s.tenant_id = e.tenant_id, scope
        WHERE e.tenant_id = ${sqlText(context.tenant_id)}::uuid AND e.id = ${sqlText(executionId)}::uuid AND s.user_id = ${sqlText(context.actor_id)}::uuid AND e.status = 'em_execucao' LIMIT 1
      ), updated AS (
        UPDATE fitcore_workout_executions e SET exercise_progress = (
          SELECT jsonb_agg(CASE WHEN (item->>'index')::int = ${idx} THEN jsonb_set(jsonb_set(item, '{status}', '"feito"'::jsonb), '{feito_em}', to_jsonb(now()::text)) || jsonb_build_object('observacao', ${sqlText(observacao)}) ELSE item END ORDER BY ord)
          FROM jsonb_array_elements(e.exercise_progress) WITH ORDINALITY AS arr(item, ord)
        ), atualizado_em = now()
        FROM allowed_execution WHERE e.id = allowed_execution.id
        RETURNING e.*
      )
      SELECT jsonb_build_object('id', updated.id, 'tenant_id', updated.tenant_id, 'tenant_slug', ${sqlText(context.tenant_slug || "")}, 'workout_id', updated.workout_id, 'student_id', updated.student_id, 'status', updated.status, 'percepcao_esforco', updated.percepcao_esforco, 'duracao_minutos', updated.duracao_minutos, 'observacoes', updated.observacoes, 'iniciado_em', updated.iniciado_em, 'concluido_em', updated.concluido_em, 'criado_em', updated.criado_em, 'atualizado_em', updated.atualizado_em, 'exercise_progress', updated.exercise_progress, 'payload', updated.payload)::text FROM updated;
    `);
    const execution = publicExecution(jsonScalar(raw));
    if (!execution) return { guard: { allowed: false, statusCode: 404, response: { erro: "execucao_em_andamento_nao_encontrada" } } };
    const audit = recordEvent(context, execution, "exercise_marked_done", `exercício ${idx + 1} marcado como feito`, { index: idx, observacao }, idx);
    return { ok: true, mvp: "MVP-25 Workout Execution", exercise_done: true, index: idx, tenant_slug: context.tenant_slug, execution, audit };
  }
  function reconcileAction(context = {}, actionId = "", binding = {}, executionIdentity = {}) {
    const guard = requireAluno(context); if (!guard.allowed) return null;
    if (actionId === WORKOUT_ACTION_IDS.START) {
      const logicalId = clean(executionIdentity.executionId || "", "", 90);
      if (!logicalId) return null;
      const sourceMvpId = "execution-kernel:" + logicalId;
      const data = rowSelect(
        context,
        `e.tenant_id = ${sqlText(context.tenant_id)}::uuid AND e.source_mvp_id = ${sqlText(sourceMvpId)} AND s.user_id = ${sqlText(context.actor_id)}::uuid`,
        1,
      );
      const execution = publicExecution((data.executions || [])[0]);
      return execution ? { ok: true, mvp: "MVP-25 Workout Execution", started: true, recovered: true, execution } : null;
    }
    const current = getExecution(context, binding.execution_id || "");
    if (current.guard || !current.execution) return null;
    if (actionId === WORKOUT_ACTION_IDS.EXERCISE_COMPLETE) {
      const item = current.execution.exercise_progress.find((entry) => entry.index === binding.index);
      return item?.status === "feito"
        ? { ...current, exercise_done: true, recovered: true, index: binding.index }
        : null;
    }
    if (actionId === WORKOUT_ACTION_IDS.FINISH) {
      return current.execution.status === "concluido"
        ? { ...current, finished: true, recovered: true }
        : null;
    }
    return null;
  }

  function finishExecution(context = {}, id = "", input = {}, authority = {}) {
    const guard = requireAluno(context); if (!guard.allowed) return { guard };
    const binding = buildWorkoutActionBinding(WORKOUT_ACTION_IDS.FINISH, { id, input });
    const capabilityGuard = requireExecutionCapability(context, WORKOUT_ACTION_IDS.FINISH, binding, authority);
    if (!capabilityGuard.allowed) return { guard: capabilityGuard };
    const executionId = binding.execution_id;
    const effort = binding.percepcao_esforco;
    const duration = binding.duracao_minutos;
    const observacoes = binding.observacoes;
    const raw = scalar(env, `
      ${setTenantSession(context)}
      WITH ${tenantScope(context)}, allowed_execution AS (
        SELECT e.* FROM fitcore_workout_executions e JOIN fitcore_students s ON s.id = e.student_id AND s.tenant_id = e.tenant_id, scope
        WHERE e.tenant_id = ${sqlText(context.tenant_id)}::uuid AND e.id = ${sqlText(executionId)}::uuid AND s.user_id = ${sqlText(context.actor_id)}::uuid AND e.status = 'em_execucao' LIMIT 1
      ), updated AS (
        UPDATE fitcore_workout_executions e SET status = 'concluido', percepcao_esforco = ${effort}, duracao_minutos = ${duration}, observacoes = ${sqlText(observacoes)}, concluido_em = now(), finished_by = ${sqlText(context.actor_id)}::uuid, atualizado_em = now()
        FROM allowed_execution WHERE e.id = allowed_execution.id RETURNING e.*
      )
      SELECT jsonb_build_object('id', updated.id, 'tenant_id', updated.tenant_id, 'tenant_slug', ${sqlText(context.tenant_slug || "")}, 'workout_id', updated.workout_id, 'student_id', updated.student_id, 'status', updated.status, 'percepcao_esforco', updated.percepcao_esforco, 'duracao_minutos', updated.duracao_minutos, 'observacoes', updated.observacoes, 'iniciado_em', updated.iniciado_em, 'concluido_em', updated.concluido_em, 'criado_em', updated.criado_em, 'atualizado_em', updated.atualizado_em, 'exercise_progress', updated.exercise_progress, 'payload', updated.payload)::text FROM updated;
    `);
    const execution = publicExecution(jsonScalar(raw));
    if (!execution) return { guard: { allowed: false, statusCode: 404, response: { erro: "execucao_em_andamento_nao_encontrada" } } };
    const audit = recordEvent(context, execution, "workout_execution_finished", `esforço=${effort}; duração=${duration}min`, { effort, duration });
    return { ok: true, mvp: "MVP-25 Workout Execution", finished: true, tenant_slug: context.tenant_slug, execution, audit };
  }
  return { enabled, status, listExecutions, validateAction, startExecution, getExecution, markExerciseDone, finishExecution, reconcileAction };
}
