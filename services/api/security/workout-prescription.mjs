// FITCORE PRO — MVP-24
// Prescrição real de treino vinculada ao aluno, professor, tenant e auditoria.

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { normalizeRole } from "./access-context.mjs";

const PRESCRIPTION_STATUS = new Set(["em_revisao", "aprovado", "ajustes_solicitados", "arquivado"]);

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

function intValue(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(Math.max(safe, min), max);
}

function dbConnection(env = process.env) {
  const dbUrl = clean(env.FITCORE_DATABASE_URL || env.DATABASE_URL || "", "", 900);
  if (!dbUrl) throw new Error("FITCORE_DATABASE_URL ausente para MVP-24.");
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
    maxBuffer: 12 * 1024 * 1024,
  }).trim();
}

function scalar(env, sql) {
  return runSql(env, sql).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1) || "";
}

function requireSigned(context = {}) {
  if (!context?.session_signed || !context?.tenant_id) {
    return { allowed: false, statusCode: 401, response: { erro: "sessao_obrigatoria", mensagem: "Faça login para acessar prescrições." } };
  }
  return { allowed: true };
}

function requireStaff(context = {}) {
  const signed = requireSigned(context);
  if (!signed.allowed) return signed;
  const role = normalizeRole(context.actor_role);
  if (!["gestor", "professor"].includes(role)) {
    return { allowed: false, statusCode: 403, response: { erro: "acesso_negado", mensagem: "Somente gestor ou professor prescreve treino.", papel: role } };
  }
  return { allowed: true };
}

function requireAluno(context = {}) {
  const signed = requireSigned(context);
  if (!signed.allowed) return signed;
  if (normalizeRole(context.actor_role) !== "aluno") {
    return { allowed: false, statusCode: 403, response: { erro: "acesso_negado", mensagem: "Esta rota é exclusiva do aluno logado.", papel: context.actor_role } };
  }
  return { allowed: true };
}

function setTenantSession(context) {
  if (!context?.tenant_id) throw new Error("tenant_id ausente na sessão assinada.");
  return `SELECT set_config('app.tenant_id', ${sqlText(context.tenant_id)}, false);`;
}

function tenantScope(context) {
  if (!context?.tenant_id) throw new Error("tenant_id ausente na sessão assinada.");
  return `scope AS (SELECT set_config('app.tenant_id', ${sqlText(context.tenant_id)}, true))`;
}

function assertRequestedTenant(context = {}, requestedSlug = "") {
  const requested = clean(requestedSlug || "", "", 80);
  if (requested && requested !== context.tenant_slug) {
    return { allowed: false, statusCode: 403, response: { erro: "tenant_cross_access_blocked", mensagem: "A sessão só pode acessar prescrições do próprio tenant.", session_tenant_slug: context.tenant_slug, requested_tenant_slug: requested } };
  }
  return { allowed: true };
}

function normalizePrescriptionStatus(value, fallback = "em_revisao") {
  const status = clean(value || fallback, fallback, 40).toLowerCase();
  return PRESCRIPTION_STATUS.has(status) ? status : fallback;
}

function parseItems(input = {}) {
  if (Array.isArray(input.exercicios)) return input.exercicios.slice(0, 40);
  const raw = String(input.exercicios || input.exercises || "").trim();
  if (!raw) {
    return [
      { nome: "Agachamento técnico", series: 3, repeticoes: "10", observacao: "controle de amplitude" },
      { nome: "Remada guiada", series: 3, repeticoes: "12", observacao: "escápulas estáveis" },
      { nome: "Prancha", series: 3, repeticoes: "30s", observacao: "abdômen ativo" },
    ];
  }
  return raw.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean).slice(0, 40).map((nome) => ({ nome, series: 3, repeticoes: "10-12" }));
}

function publicPrescription(row) {
  if (!row) return null;
  const payload = row.payload || {};
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    tenant_slug: row.tenant_slug || null,
    student_id: row.student_id,
    student_name: row.student_name || null,
    student_user_id: row.student_user_id || null,
    professor_id: row.professor_id || payload.professor_id || null,
    professor_name: row.professor_name || null,
    review_id: row.review_id || null,
    review_status: row.review_status || null,
    nome_treino: payload.nome_treino || row.objetivo || "Treino prescrito",
    objetivo: row.objetivo,
    modalidade: row.modalidade,
    foco: row.foco,
    dias_semana: row.dias_semana,
    status: row.status,
    exercicios: payload.exercicios || [],
    orientacoes: payload.orientacoes || null,
    observacoes_revisao: row.observacoes_revisao || null,
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
    aprovado_em: row.aprovado_em || null,
  };
}

export function createWorkoutPrescriptionManager(env = process.env) {
  const enabled = boolEnv(env.FITCORE_WORKOUT_PRESCRIPTION_ENABLED, true);

  function status(context = {}) {
    return {
      ok: true,
      mvp: "MVP-24 Workout Prescription",
      enabled,
      tenant_slug: context?.tenant_slug || null,
      actor_role: context?.actor_role || null,
      tenant_scoped: true,
      student_bound: true,
      professor_review_required: true,
      aluno_own_workouts_only: true,
      endpoints: [
        "GET /api/mvp-24/status",
        "GET /api/mvp-24/prescriptions",
        "POST /api/mvp-24/prescriptions",
        "GET /api/mvp-24/prescriptions/:id",
        "POST /api/mvp-24/prescriptions/:id/review",
        "GET /api/mvp-24/my-workouts",
      ],
    };
  }

  function recordEvent(context = {}, workoutId, studentId, evento, detalhe, payload = {}, statusValue = "ok") {
    if (!context?.tenant_id) return { ok: false, skipped: "missing_tenant" };
    const actorSql = context.actor_id ? `${sqlText(context.actor_id)}::uuid` : "NULL";
    const workoutSql = workoutId ? `${sqlText(workoutId)}::uuid` : "NULL";
    const studentSql = studentId ? `${sqlText(studentId)}::uuid` : "NULL";
    try {
      runSql(env, `
        ${setTenantSession(context)}
        WITH ${tenantScope(context)}, event_created AS (
          INSERT INTO fitcore_workout_prescription_events (tenant_id, actor_id, workout_id, student_id, evento, status, detalhe, payload)
          SELECT ${sqlText(context.tenant_id)}::uuid, ${actorSql}, ${workoutSql}, ${studentSql}, ${sqlText(clean(evento, "workout_prescription_event", 90))}, ${sqlText(clean(statusValue, "ok", 40))}, ${sqlText(displayClean(detalhe, "MVP-24 prescrição", 420))}, ${sqlJson(payload)}
          FROM scope RETURNING id
        ), audit AS (
          INSERT INTO fitcore_audit_events (tenant_id, actor_id, actor_role, recurso_tipo, recurso_id, acao, status, detalhe)
          SELECT ${sqlText(context.tenant_id)}::uuid, ${actorSql}, ${sqlText(normalizeRole(context.actor_role || "sistema"))}, 'workout_prescription', ${workoutSql}, ${sqlText(clean(evento, "workout_prescription_event", 90))}, ${sqlText(clean(statusValue, "ok", 40))}, ${sqlText(displayClean(detalhe, "MVP-24 prescrição", 420))}
          FROM scope
        ) SELECT count(*)::text FROM event_created;
      `);
      return { ok: true, persisted: true };
    } catch (error) {
      return { ok: false, persisted: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  function listPrescriptions(context = {}, url = null, ownOnly = false) {
    if (!enabled) return { guard: { allowed: false, statusCode: 503, response: { erro: "workout_prescription_disabled" } } };
    const signed = ownOnly ? requireAluno(context) : requireSigned(context);
    if (!signed.allowed) return { guard: signed };
    const tenantGuard = assertRequestedTenant(context, url?.searchParams?.get("tenant_slug") || url?.searchParams?.get("tenant") || "");
    if (!tenantGuard.allowed) return { guard: tenantGuard };
    const role = normalizeRole(context.actor_role);
    const query = displayClean(url?.searchParams?.get("search") || "", "", 80).toLowerCase();
    const statusFilter = clean(url?.searchParams?.get("status") || "", "", 40).toLowerCase();
    const limit = intValue(url?.searchParams?.get("limit"), 40, 1, 200);
    const accessWhere = ownOnly || role === "aluno"
      ? `s.user_id = ${sqlText(context.actor_id)}::uuid`
      : role === "professor"
        ? `(s.professor_id = ${sqlText(context.actor_id)}::uuid OR r.professor_id = ${sqlText(context.actor_id)}::uuid OR (w.payload->>'professor_id') = ${sqlText(context.actor_id)})`
        : "true";
    const where = [
      `w.tenant_id = ${sqlText(context.tenant_id)}::uuid`,
      accessWhere,
      query ? `(lower(coalesce(s.nome_publico,'')) LIKE ${sqlText(`%${query}%`)} OR lower(coalesce(w.objetivo,'')) LIKE ${sqlText(`%${query}%`)} OR lower(coalesce(w.payload->>'nome_treino','')) LIKE ${sqlText(`%${query}%`)})` : "true",
      statusFilter && PRESCRIPTION_STATUS.has(statusFilter) ? `w.status = ${sqlText(statusFilter)}` : "true",
    ].join(" AND ");
    const raw = scalar(env, `
      ${setTenantSession(context)}
      WITH ${tenantScope(context)}, rows AS (
        SELECT w.*, s.nome_publico AS student_name, s.user_id AS student_user_id,
          r.id AS review_id, r.status AS review_status, r.observacoes AS observacoes_revisao, r.professor_id,
          p.nome AS professor_name
        FROM fitcore_workouts w
        JOIN fitcore_students s ON s.id = w.student_id AND s.tenant_id = w.tenant_id
        LEFT JOIN LATERAL (SELECT rr.* FROM fitcore_professor_reviews rr WHERE rr.workout_id = w.id AND rr.tenant_id = w.tenant_id ORDER BY rr.atualizado_em DESC, rr.criado_em DESC LIMIT 1) r ON true
        LEFT JOIN fitcore_users p ON p.id = COALESCE(r.professor_id, s.professor_id) AND p.tenant_id = w.tenant_id
        JOIN scope ON true
        WHERE ${where}
        ORDER BY w.atualizado_em DESC, w.criado_em DESC
        LIMIT ${limit}
      )
      SELECT jsonb_build_object(
        'prescriptions', COALESCE(jsonb_agg(jsonb_build_object(
          'id', rows.id, 'tenant_id', rows.tenant_id, 'tenant_slug', ${sqlText(context.tenant_slug || "")},
          'student_id', rows.student_id, 'student_name', rows.student_name, 'student_user_id', rows.student_user_id,
          'professor_id', rows.professor_id, 'professor_name', rows.professor_name,
          'review_id', rows.review_id, 'review_status', rows.review_status, 'observacoes_revisao', rows.observacoes_revisao,
          'objetivo', rows.objetivo, 'modalidade', rows.modalidade, 'foco', rows.foco, 'dias_semana', rows.dias_semana,
          'status', rows.status, 'payload', rows.payload, 'aprovado_em', rows.aprovado_em,
          'criado_em', rows.criado_em, 'atualizado_em', rows.atualizado_em
        )), '[]'::jsonb),
        'total', (SELECT count(*) FROM rows),
        'aprovados', (SELECT count(*) FROM rows WHERE status = 'aprovado'),
        'em_revisao', (SELECT count(*) FROM rows WHERE status = 'em_revisao'),
        'ajustes', (SELECT count(*) FROM rows WHERE status = 'ajustes_solicitados')
      )::text FROM rows LIMIT 1;
    `);
    const data = jsonScalar(raw) || { prescriptions: [], total: 0, aprovados: 0, em_revisao: 0, ajustes: 0 };
    return { ok: true, mvp: "MVP-24 Workout Prescription", tenant_slug: context.tenant_slug, actor_role: role, own_only: ownOnly || role === "aluno", prescriptions: data.prescriptions.map(publicPrescription), total: data.total || 0, aprovados: data.aprovados || 0, em_revisao: data.em_revisao || 0, ajustes: data.ajustes || 0 };
  }

  function createPrescription(context = {}, input = {}) {
    if (!enabled) return { guard: { allowed: false, statusCode: 503, response: { erro: "workout_prescription_disabled" } } };
    const guard = requireStaff(context);
    if (!guard.allowed) return { guard };
    const tenantGuard = assertRequestedTenant(context, input.tenant_slug || input.tenant || "");
    if (!tenantGuard.allowed) return { guard: tenantGuard };
    const studentId = clean(input.student_id || input.aluno_id || "", "", 90);
    if (!studentId) return { guard: { allowed: false, statusCode: 400, response: { erro: "student_id_obrigatorio" } } };
    const nomeTreino = displayClean(input.nome_treino || input.nome || "Treino prescrito", "Treino prescrito", 120);
    const objetivo = displayClean(input.objetivo || "evolução", "evolução", 100);
    const modalidade = clean(input.modalidade || "academia", "academia", 60);
    const foco = displayClean(input.foco || "completo", "completo", 100);
    const diasSemana = intValue(input.dias_semana || input.frequencia_semana, 3, 1, 7);
    const orientacoes = displayClean(input.orientacoes || "Executar com controle e registrar percepção de esforço.", "Executar com controle e registrar percepção de esforço.", 700);
    const exercicios = parseItems(input);
    const role = normalizeRole(context.actor_role);
    const professorIdInput = clean(input.professor_id || "", "", 90);
    const professorFallback = role === "professor" ? context.actor_id : "";
    const sourceMvpId = `mvp24-${Date.now()}-${randomBytes(3).toString("hex")}`;
    const payload = { origem: "mvp24_prescription", nome_treino: nomeTreino, exercicios, orientacoes, professor_id: professorIdInput || professorFallback || null, criado_por_role: role };
    const raw = scalar(env, `
      ${setTenantSession(context)}
      WITH ${tenantScope(context)}, student_row AS (
        SELECT s.* FROM fitcore_students s, scope
        WHERE s.tenant_id = ${sqlText(context.tenant_id)}::uuid AND s.id = ${sqlText(studentId)}::uuid AND s.status <> 'inativo'
        LIMIT 1
      ), professor_row AS (
        SELECT u.id, u.nome FROM fitcore_users u, student_row
        WHERE u.tenant_id = ${sqlText(context.tenant_id)}::uuid
          AND u.papel = 'professor'
          AND u.ativo = true
          AND u.id = COALESCE(NULLIF(${sqlText(professorIdInput)}, '')::uuid, NULLIF(${sqlText(professorFallback)}, '')::uuid, student_row.professor_id)
        LIMIT 1
      ), workout_created AS (
        INSERT INTO fitcore_workouts (tenant_id, source_mvp_id, student_id, objetivo, modalidade, foco, dias_semana, status, criado_por, payload, atualizado_em)
        SELECT ${sqlText(context.tenant_id)}::uuid, ${sqlText(sourceMvpId)}, student_row.id, ${sqlText(objetivo)}, ${sqlText(modalidade)}, ${sqlText(foco)}, ${diasSemana}, 'em_revisao', ${sqlText(context.actor_id)}::uuid, ${sqlJson(payload)}, now()
        FROM student_row, scope
        RETURNING id, tenant_id, student_id, objetivo, modalidade, foco, dias_semana, status, payload, aprovado_em, criado_em, atualizado_em
      ), review_created AS (
        INSERT INTO fitcore_professor_reviews (tenant_id, source_mvp_id, workout_id, professor_id, status, observacoes, ajustes, payload, atualizado_em)
        SELECT ${sqlText(context.tenant_id)}::uuid, ${sqlText(sourceMvpId)}, workout_created.id, (SELECT id FROM professor_row), 'em_revisao', ${sqlText('Revisão pendente do professor responsável')}, '[]'::jsonb, ${sqlJson({ origem: "mvp24_prescription" })}, now()
        FROM workout_created
        RETURNING id, workout_id, professor_id, status, observacoes
      )
      SELECT jsonb_build_object(
        'id', workout_created.id, 'tenant_id', workout_created.tenant_id, 'tenant_slug', ${sqlText(context.tenant_slug || "")},
        'student_id', workout_created.student_id, 'student_name', (SELECT nome_publico FROM student_row), 'student_user_id', (SELECT user_id FROM student_row),
        'professor_id', (SELECT professor_id FROM review_created), 'professor_name', (SELECT nome FROM professor_row),
        'review_id', (SELECT id FROM review_created), 'review_status', (SELECT status FROM review_created), 'observacoes_revisao', (SELECT observacoes FROM review_created),
        'objetivo', workout_created.objetivo, 'modalidade', workout_created.modalidade, 'foco', workout_created.foco, 'dias_semana', workout_created.dias_semana,
        'status', workout_created.status, 'payload', workout_created.payload, 'aprovado_em', workout_created.aprovado_em,
        'criado_em', workout_created.criado_em, 'atualizado_em', workout_created.atualizado_em
      )::text
      FROM workout_created;
    `);
    const workout = publicPrescription(jsonScalar(raw));
    if (!workout) return { guard: { allowed: false, statusCode: 404, response: { erro: "aluno_nao_encontrado", mensagem: "Aluno não pertence ao tenant atual." } } };
    const audit = recordEvent(context, workout.id, workout.student_id, "workout_prescribed", `aluno=${workout.student_name}; professor=${workout.professor_name || "pendente"}`, { status: workout.status, exercicios: workout.exercicios.length });
    return { ok: true, mvp: "MVP-24 Workout Prescription", created: true, tenant_slug: context.tenant_slug, prescription: workout, audit };
  }

  function getPrescription(context = {}, id = "") {
    const signed = requireSigned(context);
    if (!signed.allowed) return { guard: signed };
    const prescriptionId = clean(id, "", 90);
    if (!prescriptionId) return { guard: { allowed: false, statusCode: 400, response: { erro: "prescription_id_obrigatorio" } } };
    const role = normalizeRole(context.actor_role);
    const accessWhere = role === "aluno"
      ? `s.user_id = ${sqlText(context.actor_id)}::uuid`
      : role === "professor"
        ? `(s.professor_id = ${sqlText(context.actor_id)}::uuid OR r.professor_id = ${sqlText(context.actor_id)}::uuid OR (w.payload->>'professor_id') = ${sqlText(context.actor_id)})`
        : "true";
    const raw = scalar(env, `
      ${setTenantSession(context)}
      WITH ${tenantScope(context)}
      SELECT jsonb_build_object(
        'id', w.id, 'tenant_id', w.tenant_id, 'tenant_slug', ${sqlText(context.tenant_slug || "")},
        'student_id', w.student_id, 'student_name', s.nome_publico, 'student_user_id', s.user_id,
        'professor_id', r.professor_id, 'professor_name', p.nome,
        'review_id', r.id, 'review_status', r.status, 'observacoes_revisao', r.observacoes,
        'objetivo', w.objetivo, 'modalidade', w.modalidade, 'foco', w.foco, 'dias_semana', w.dias_semana,
        'status', w.status, 'payload', w.payload, 'aprovado_em', w.aprovado_em,
        'criado_em', w.criado_em, 'atualizado_em', w.atualizado_em
      )::text
      FROM fitcore_workouts w
      JOIN fitcore_students s ON s.id = w.student_id AND s.tenant_id = w.tenant_id
      LEFT JOIN LATERAL (SELECT rr.* FROM fitcore_professor_reviews rr WHERE rr.workout_id = w.id AND rr.tenant_id = w.tenant_id ORDER BY rr.atualizado_em DESC, rr.criado_em DESC LIMIT 1) r ON true
      LEFT JOIN fitcore_users p ON p.id = COALESCE(r.professor_id, s.professor_id) AND p.tenant_id = w.tenant_id
      JOIN scope ON true
      WHERE w.tenant_id = ${sqlText(context.tenant_id)}::uuid AND w.id = ${sqlText(prescriptionId)}::uuid AND ${accessWhere}
      LIMIT 1;
    `);
    const prescription = publicPrescription(jsonScalar(raw));
    if (!prescription) return { guard: { allowed: false, statusCode: 404, response: { erro: "prescricao_nao_encontrada" } } };
    return { ok: true, mvp: "MVP-24 Workout Prescription", tenant_slug: context.tenant_slug, prescription };
  }

  function reviewPrescription(context = {}, id = "", input = {}) {
    if (!enabled) return { guard: { allowed: false, statusCode: 503, response: { erro: "workout_prescription_disabled" } } };
    const guard = requireStaff(context);
    if (!guard.allowed) return { guard };
    const current = getPrescription(context, id);
    if (current.guard) return current;
    const prescription = current.prescription;
    const role = normalizeRole(context.actor_role);
    if (role === "professor" && prescription.professor_id && prescription.professor_id !== context.actor_id) {
      return { guard: { allowed: false, statusCode: 403, response: { erro: "professor_nao_responsavel", mensagem: "Professor só revisa treino atribuído a ele." } } };
    }
    const decision = clean(input.decision || input.status || "aprovado", "aprovado", 40).toLowerCase();
    const nextStatus = decision === "aprovar" || decision === "aprovado" ? "aprovado" : decision === "arquivar" ? "arquivado" : decision === "ajustes" || decision === "ajustes_solicitados" ? "ajustes_solicitados" : "em_revisao";
    const observacoes = displayClean(input.observacoes || input.observation || (nextStatus === "aprovado" ? "Treino aprovado para o aluno." : "Ajustes solicitados."), "Treino revisado.", 700);
    const ajustes = input.ajustes || [];
    const raw = scalar(env, `
      ${setTenantSession(context)}
      WITH ${tenantScope(context)}, updated_workout AS (
        UPDATE fitcore_workouts
        SET status = ${sqlText(nextStatus)}, aprovado_por = CASE WHEN ${sqlText(nextStatus)} = 'aprovado' THEN ${sqlText(context.actor_id)}::uuid ELSE aprovado_por END, aprovado_em = CASE WHEN ${sqlText(nextStatus)} = 'aprovado' THEN now() ELSE aprovado_em END, atualizado_em = now()
        WHERE tenant_id = ${sqlText(context.tenant_id)}::uuid AND id = ${sqlText(prescription.id)}::uuid
        RETURNING id, tenant_id, student_id, objetivo, modalidade, foco, dias_semana, status, payload, aprovado_em, criado_em, atualizado_em
      ), review_upsert AS (
        INSERT INTO fitcore_professor_reviews (tenant_id, source_mvp_id, workout_id, professor_id, status, observacoes, ajustes, payload, atualizado_em)
        SELECT ${sqlText(context.tenant_id)}::uuid, ${sqlText(`mvp24-review-${prescription.id}`)}, updated_workout.id, ${sqlText(context.actor_id)}::uuid, ${sqlText(nextStatus)}, ${sqlText(observacoes)}, ${sqlJson(ajustes)}, ${sqlJson({ origem: "mvp24_review", decision: nextStatus })}, now()
        FROM updated_workout
        ON CONFLICT (tenant_id, source_mvp_id) DO UPDATE SET professor_id = EXCLUDED.professor_id, status = EXCLUDED.status, observacoes = EXCLUDED.observacoes, ajustes = EXCLUDED.ajustes, atualizado_em = now()
        RETURNING id, workout_id, professor_id, status, observacoes
      )
      SELECT jsonb_build_object(
        'id', updated_workout.id, 'tenant_id', updated_workout.tenant_id, 'tenant_slug', ${sqlText(context.tenant_slug || "")},
        'student_id', updated_workout.student_id, 'student_name', s.nome_publico, 'student_user_id', s.user_id,
        'professor_id', review_upsert.professor_id, 'professor_name', p.nome,
        'review_id', review_upsert.id, 'review_status', review_upsert.status, 'observacoes_revisao', review_upsert.observacoes,
        'objetivo', updated_workout.objetivo, 'modalidade', updated_workout.modalidade, 'foco', updated_workout.foco, 'dias_semana', updated_workout.dias_semana,
        'status', updated_workout.status, 'payload', updated_workout.payload, 'aprovado_em', updated_workout.aprovado_em,
        'criado_em', updated_workout.criado_em, 'atualizado_em', updated_workout.atualizado_em
      )::text
      FROM updated_workout
      JOIN fitcore_students s ON s.id = updated_workout.student_id AND s.tenant_id = updated_workout.tenant_id
      LEFT JOIN review_upsert ON review_upsert.workout_id = updated_workout.id
      LEFT JOIN fitcore_users p ON p.id = review_upsert.professor_id AND p.tenant_id = updated_workout.tenant_id
      JOIN scope ON true;
    `);
    const reviewed = publicPrescription(jsonScalar(raw));
    const audit = recordEvent(context, reviewed?.id, reviewed?.student_id, "workout_reviewed", `status=${nextStatus}; aluno=${reviewed?.student_name || ""}`, { status: nextStatus, review_id: reviewed?.review_id });
    return { ok: true, mvp: "MVP-24 Workout Prescription", reviewed: true, tenant_slug: context.tenant_slug, prescription: reviewed, audit };
  }

  return { enabled, status, listPrescriptions, createPrescription, getPrescription, reviewPrescription };
}
