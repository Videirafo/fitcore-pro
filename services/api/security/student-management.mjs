// FITCORE PRO — MVP-23
// Cadastro operacional de aluno real: entidade completa do tenant, vínculos, status e auditoria.

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { normalizeRole } from "./access-context.mjs";

const STUDENT_STATUS = new Set(["ativo", "inativo", "teste"]);
const LEVELS = new Set(["iniciante", "intermediario", "avancado"]);

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
  if (!dbUrl) throw new Error("FITCORE_DATABASE_URL ausente para MVP-23.");
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

function requireStaff(context = {}) {
  if (!context?.session_signed || !context?.tenant_id) {
    return { allowed: false, statusCode: 401, response: { erro: "sessao_obrigatoria", mensagem: "Faça login para administrar alunos." } };
  }
  const role = normalizeRole(context.actor_role);
  if (!["gestor", "professor"].includes(role)) {
    return { allowed: false, statusCode: 403, response: { erro: "acesso_negado", mensagem: "Somente gestor ou professor administra cadastro operacional de aluno.", papel: role } };
  }
  return { allowed: true };
}

function tenantScope(context) {
  if (!context?.tenant_id) throw new Error("tenant_id ausente na sessão assinada.");
  return `scope AS (SELECT set_config('app.tenant_id', ${sqlText(context.tenant_id)}, true))`;
}

function setTenantSession(context) {
  if (!context?.tenant_id) throw new Error("tenant_id ausente na sessão assinada.");
  return `SELECT set_config('app.tenant_id', ${sqlText(context.tenant_id)}, false);`;
}

function assertRequestedTenant(context = {}, requestedSlug = "") {
  const requested = clean(requestedSlug || "", "", 80);
  if (requested && requested !== context.tenant_slug) {
    return { allowed: false, statusCode: 403, response: { erro: "tenant_cross_access_blocked", mensagem: "A sessão só pode acessar alunos do próprio tenant.", session_tenant_slug: context.tenant_slug, requested_tenant_slug: requested } };
  }
  return { allowed: true };
}

function normalizeStatus(value) {
  const status = clean(value || "ativo", "ativo", 30).toLowerCase();
  return STUDENT_STATUS.has(status) ? status : "ativo";
}

function normalizeLevel(value) {
  const level = clean(value || "iniciante", "iniciante", 40).toLowerCase();
  return LEVELS.has(level) ? level : "iniciante";
}

function normalizeTags(value) {
  if (Array.isArray(value)) return value.map((item) => displayClean(item, "", 40)).filter(Boolean).slice(0, 12);
  return String(value || "").split(",").map((item) => displayClean(item, "", 40)).filter(Boolean).slice(0, 12);
}

function publicStudent(student) {
  if (!student) return null;
  return {
    id: student.id,
    tenant_id: student.tenant_id,
    tenant_slug: student.tenant_slug || null,
    nome_publico: student.nome_publico,
    codigo_publico: student.codigo_publico || null,
    nivel: student.nivel,
    status: student.status,
    objetivo: student.objetivo || null,
    modalidade_preferida: student.modalidade_preferida || null,
    frequencia_semana: student.frequencia_semana || null,
    professor_id: student.professor_id || null,
    professor_nome: student.professor_nome || null,
    user_id: student.user_id || null,
    user_nome: student.user_nome || null,
    etiquetas: student.etiquetas || [],
    observacoes_minimas: student.observacoes_minimas || null,
    consentimento_lgpd: student.consentimento_lgpd !== false,
    criado_em: student.criado_em || null,
    atualizado_em: student.atualizado_em || null,
  };
}

export function createStudentManagement(env = process.env) {
  const enabled = boolEnv(env.FITCORE_STUDENT_MANAGEMENT_ENABLED, true);

  function status(context = {}) {
    return {
      ok: true,
      mvp: "MVP-23 Student Management",
      enabled,
      tenant_slug: context?.tenant_slug || null,
      actor_role: context?.actor_role || null,
      tenant_scoped: true,
      cross_tenant_block: true,
      student_entity_complete: true,
      endpoints: [
        "GET /api/mvp-23/status",
        "GET /api/mvp-23/students",
        "POST /api/mvp-23/students",
        "GET /api/mvp-23/students/:id",
        "POST /api/mvp-23/students/:id/status",
      ],
    };
  }

  function recordEvent(context = {}, studentId, evento, detalhe, payload = {}, statusValue = "ok") {
    if (!context?.tenant_id) return { ok: false, skipped: "missing_tenant" };
    const actorSql = context.actor_id ? `${sqlText(context.actor_id)}::uuid` : "NULL";
    const studentSql = studentId ? `${sqlText(studentId)}::uuid` : "NULL";
    try {
      runSql(env, `
        WITH ${tenantScope(context)}, student_event AS (
          INSERT INTO fitcore_student_events (tenant_id, actor_id, student_id, evento, status, detalhe, payload)
          SELECT ${sqlText(context.tenant_id)}::uuid, ${actorSql}, ${studentSql}, ${sqlText(clean(evento, "student_event", 90))}, ${sqlText(clean(statusValue, "ok", 40))}, ${sqlText(displayClean(detalhe, "MVP-23 aluno", 420))}, ${sqlJson(payload)}
          FROM scope
          RETURNING id
        ), audit AS (
          INSERT INTO fitcore_audit_events (tenant_id, actor_id, actor_role, recurso_tipo, recurso_id, acao, status, detalhe)
          SELECT ${sqlText(context.tenant_id)}::uuid, ${actorSql}, ${sqlText(normalizeRole(context.actor_role || "sistema"))}, 'student', ${studentSql}, ${sqlText(clean(evento, "student_event", 90))}, ${sqlText(clean(statusValue, "ok", 40))}, ${sqlText(displayClean(detalhe, "MVP-23 aluno", 420))}
          FROM scope
        ) SELECT count(*)::text FROM student_event;
      `);
      return { ok: true, persisted: true };
    } catch (error) {
      return { ok: false, persisted: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  function validateProfessor(context = {}, professorId = "") {
    const id = clean(professorId || "", "", 90);
    if (!id) return null;
    const exists = scalar(env, `WITH ${tenantScope(context)} SELECT id::text FROM fitcore_users, scope WHERE tenant_id = ${sqlText(context.tenant_id)}::uuid AND id = ${sqlText(id)}::uuid AND papel = 'professor' AND ativo = true LIMIT 1;`);
    if (!exists) {
      const error = new Error("Professor não pertence ao tenant atual ou está inativo.");
      error.statusCode = 400;
      throw error;
    }
    return id;
  }

  function validateAlunoUser(context = {}, userId = "") {
    const id = clean(userId || "", "", 90);
    if (!id) return null;
    const exists = scalar(env, `WITH ${tenantScope(context)} SELECT id::text FROM fitcore_users, scope WHERE tenant_id = ${sqlText(context.tenant_id)}::uuid AND id = ${sqlText(id)}::uuid AND papel = 'aluno' AND ativo = true LIMIT 1;`);
    if (!exists) {
      const error = new Error("Usuário aluno não pertence ao tenant atual ou está inativo.");
      error.statusCode = 400;
      throw error;
    }
    return id;
  }

  function listStudents(context = {}, url = null) {
    if (!enabled) return { guard: { allowed: false, statusCode: 503, response: { erro: "student_management_disabled" } } };
    const guard = requireStaff(context);
    if (!guard.allowed) return { guard };
    const tenantGuard = assertRequestedTenant(context, url?.searchParams?.get("tenant_slug") || url?.searchParams?.get("tenant") || "");
    if (!tenantGuard.allowed) return { guard: tenantGuard };
    const query = displayClean(url?.searchParams?.get("search") || "", "", 80).toLowerCase();
    const statusFilter = clean(url?.searchParams?.get("status") || "", "", 30).toLowerCase();
    const limit = intValue(url?.searchParams?.get("limit"), 40, 1, 200);
    const where = [
      `s.tenant_id = ${sqlText(context.tenant_id)}::uuid`,
      query ? `(lower(s.nome_publico) LIKE ${sqlText(`%${query}%`)} OR lower(coalesce(s.codigo_publico,'')) LIKE ${sqlText(`%${query}%`)} OR lower(coalesce(s.objetivo,'')) LIKE ${sqlText(`%${query}%`)})` : "true",
      statusFilter && STUDENT_STATUS.has(statusFilter) ? `s.status = ${sqlText(statusFilter)}` : "true",
    ].join(" AND ");
    const raw = scalar(env, `
      ${setTenantSession(context)}
      WITH ${tenantScope(context)}, rows AS (
        SELECT s.*, p.nome AS professor_nome, u.nome AS user_nome
        FROM fitcore_students s
        LEFT JOIN fitcore_users p ON p.id = s.professor_id AND p.tenant_id = s.tenant_id
        LEFT JOIN fitcore_users u ON u.id = s.user_id AND u.tenant_id = s.tenant_id
        WHERE ${where}
        ORDER BY s.atualizado_em DESC, s.criado_em DESC
        LIMIT ${limit}
      )
      SELECT jsonb_build_object(
        'students', COALESCE(jsonb_agg(jsonb_build_object(
          'id', rows.id,
          'tenant_id', rows.tenant_id,
          'tenant_slug', ${sqlText(context.tenant_slug || "")},
          'nome_publico', rows.nome_publico,
          'codigo_publico', rows.codigo_publico,
          'nivel', rows.nivel,
          'status', rows.status,
          'objetivo', rows.objetivo,
          'modalidade_preferida', rows.modalidade_preferida,
          'frequencia_semana', rows.frequencia_semana,
          'professor_id', rows.professor_id,
          'professor_nome', rows.professor_nome,
          'user_id', rows.user_id,
          'user_nome', rows.user_nome,
          'etiquetas', rows.etiquetas,
          'observacoes_minimas', rows.observacoes_minimas,
          'consentimento_lgpd', rows.consentimento_lgpd,
          'criado_em', rows.criado_em,
          'atualizado_em', rows.atualizado_em
        ) ORDER BY rows.atualizado_em DESC), '[]'::jsonb),
        'total', (SELECT count(*) FROM fitcore_students s WHERE s.tenant_id = ${sqlText(context.tenant_id)}::uuid),
        'ativos', (SELECT count(*) FROM fitcore_students s WHERE s.tenant_id = ${sqlText(context.tenant_id)}::uuid AND s.status = 'ativo')
      )::text FROM rows, scope;
    `);
    const data = jsonScalar(raw) || { students: [], total: 0, ativos: 0 };
    return { ok: true, mvp: "MVP-23 Student Management", tenant_slug: context.tenant_slug, total: Number(data.total || 0), ativos: Number(data.ativos || 0), students: (data.students || []).map(publicStudent) };
  }

  function getStudent(context = {}, id = "") {
    if (!enabled) return { guard: { allowed: false, statusCode: 503, response: { erro: "student_management_disabled" } } };
    const guard = requireStaff(context);
    if (!guard.allowed) return { guard };
    const studentId = clean(id, "", 90);
    const raw = scalar(env, `
      ${setTenantSession(context)}
      WITH ${tenantScope(context)}
      SELECT jsonb_build_object(
        'id', s.id,
        'tenant_id', s.tenant_id,
        'tenant_slug', ${sqlText(context.tenant_slug || "")},
        'nome_publico', s.nome_publico,
        'codigo_publico', s.codigo_publico,
        'nivel', s.nivel,
        'status', s.status,
        'objetivo', s.objetivo,
        'modalidade_preferida', s.modalidade_preferida,
        'frequencia_semana', s.frequencia_semana,
        'professor_id', s.professor_id,
        'professor_nome', p.nome,
        'user_id', s.user_id,
        'user_nome', u.nome,
        'etiquetas', s.etiquetas,
        'observacoes_minimas', s.observacoes_minimas,
        'consentimento_lgpd', s.consentimento_lgpd,
        'payload', s.payload,
        'criado_em', s.criado_em,
        'atualizado_em', s.atualizado_em
      )::text
      FROM fitcore_students s
      LEFT JOIN fitcore_users p ON p.id = s.professor_id AND p.tenant_id = s.tenant_id
      LEFT JOIN fitcore_users u ON u.id = s.user_id AND u.tenant_id = s.tenant_id
      JOIN scope ON true
      WHERE s.tenant_id = ${sqlText(context.tenant_id)}::uuid AND s.id = ${sqlText(studentId)}::uuid
      LIMIT 1;
    `);
    const student = jsonScalar(raw);
    if (!student) return { guard: { allowed: false, statusCode: 404, response: { erro: "aluno_nao_encontrado" } } };
    return { ok: true, mvp: "MVP-23 Student Management", tenant_slug: context.tenant_slug, student: publicStudent(student) };
  }

  function createStudent(context = {}, input = {}) {
    if (!enabled) return { guard: { allowed: false, statusCode: 503, response: { erro: "student_management_disabled" } } };
    const guard = requireStaff(context);
    if (!guard.allowed) return { guard };
    const tenantGuard = assertRequestedTenant(context, input.tenant_slug || input.tenant || "");
    if (!tenantGuard.allowed) return { guard: tenantGuard };
    const nome = displayClean(input.nome_publico || input.nome || input.aluno_nome || "", "", 120);
    if (nome.length < 2) return { guard: { allowed: false, statusCode: 400, response: { erro: "nome_aluno_invalido", mensagem: "Informe o nome público do aluno." } } };
    let professorId;
    try { professorId = validateProfessor(context, input.professor_id || (normalizeRole(context.actor_role) === "professor" ? context.actor_id : "")); }
    catch (error) { return { guard: { allowed: false, statusCode: error.statusCode || 400, response: { erro: "professor_invalido", mensagem: error.message } } }; }
    let alunoUserId;
    try { alunoUserId = validateAlunoUser(context, input.user_id || input.aluno_user_id || ""); }
    catch (error) { return { guard: { allowed: false, statusCode: error.statusCode || 400, response: { erro: "usuario_aluno_invalido", mensagem: error.message } } }; }
    const nivel = normalizeLevel(input.nivel || input.level);
    const statusAluno = normalizeStatus(input.status || "ativo");
    const objetivo = displayClean(input.objetivo || "evolucao", "evolucao", 80);
    const modalidade = displayClean(input.modalidade_preferida || input.modalidade || "academia", "academia", 80);
    const frequencia = intValue(input.frequencia_semana || input.dias_semana, 3, 1, 7);
    const observacoes = displayClean(input.observacoes_minimas || input.observacoes || "", "", 800);
    const etiquetas = normalizeTags(input.etiquetas || input.tags || []);
    const codigo = clean(input.codigo_publico || `ALU-${Date.now().toString(36)}-${randomBytes(2).toString("hex")}`, "", 80).toUpperCase();
    const sourceId = clean(input.source_mvp_id || `mvp23-${Date.now()}-${randomBytes(3).toString("hex")}`, "", 140);
    const actorSql = context.actor_id ? `${sqlText(context.actor_id)}::uuid` : "NULL";

    const raw = scalar(env, `
      WITH ${tenantScope(context)}, created AS (
        INSERT INTO fitcore_students (
          tenant_id, user_id, professor_id, source_mvp_id, codigo_publico, nome_publico, nivel, status,
          objetivo, modalidade_preferida, frequencia_semana, observacoes_minimas, etiquetas, origem,
          consentimento_lgpd, payload, criado_por, atualizado_em
        )
        SELECT ${sqlText(context.tenant_id)}::uuid,
          ${alunoUserId ? `${sqlText(alunoUserId)}::uuid` : "NULL"},
          ${professorId ? `${sqlText(professorId)}::uuid` : "NULL"},
          ${sqlText(sourceId)}, ${sqlText(codigo)}, ${sqlText(nome)}, ${sqlText(nivel)}, ${sqlText(statusAluno)},
          ${sqlText(objetivo)}, ${sqlText(modalidade)}, ${frequencia}, ${observacoes ? sqlText(observacoes) : "NULL"}, ${sqlJson(etiquetas)}, 'mvp23_operacional',
          true, ${sqlJson({ source: "mvp23_student_management", objetivo, modalidade, frequencia_semana: frequencia, etiquetas })}, ${actorSql}, now()
        FROM scope
        RETURNING id, tenant_id, user_id, professor_id, codigo_publico, nome_publico, nivel, status, objetivo, modalidade_preferida, frequencia_semana, observacoes_minimas, etiquetas, consentimento_lgpd, criado_em, atualizado_em
      )
      SELECT jsonb_build_object(
        'id', id,
        'tenant_id', tenant_id,
        'tenant_slug', ${sqlText(context.tenant_slug || "")},
        'nome_publico', nome_publico,
        'codigo_publico', codigo_publico,
        'nivel', nivel,
        'status', status,
        'objetivo', objetivo,
        'modalidade_preferida', modalidade_preferida,
        'frequencia_semana', frequencia_semana,
        'professor_id', professor_id,
        'professor_nome', NULL,
        'user_id', user_id,
        'user_nome', NULL,
        'etiquetas', etiquetas,
        'observacoes_minimas', observacoes_minimas,
        'consentimento_lgpd', consentimento_lgpd,
        'criado_em', criado_em,
        'atualizado_em', atualizado_em
      )::text
      FROM created;
    `);
    const student = jsonScalar(raw);
    const audit = recordEvent(context, student?.id, "student_created", `aluno=${nome}; codigo=${codigo}`, { objetivo, modalidade, frequencia_semana: frequencia, etiquetas });
    return { ok: true, mvp: "MVP-23 Student Management", created: true, tenant_slug: context.tenant_slug, student: publicStudent(student), audit };
  }

  function updateStudentStatus(context = {}, id = "", input = {}) {
    if (!enabled) return { guard: { allowed: false, statusCode: 503, response: { erro: "student_management_disabled" } } };
    const guard = requireStaff(context);
    if (!guard.allowed) return { guard };
    const studentId = clean(id, "", 90);
    const statusAluno = normalizeStatus(input.status || input.aluno_status || "ativo");
    const detalhe = displayClean(input.detalhe || `status=${statusAluno}`, `status=${statusAluno}`, 240);
    const raw = scalar(env, `
      ${setTenantSession(context)}
      WITH ${tenantScope(context)}, updated AS (
        UPDATE fitcore_students
        SET status = ${sqlText(statusAluno)}, atualizado_em = now()
        FROM scope
        WHERE fitcore_students.tenant_id = ${sqlText(context.tenant_id)}::uuid AND fitcore_students.id = ${sqlText(studentId)}::uuid
        RETURNING fitcore_students.id, fitcore_students.tenant_id, fitcore_students.nome_publico, fitcore_students.codigo_publico, fitcore_students.nivel, fitcore_students.status, fitcore_students.objetivo, fitcore_students.modalidade_preferida, fitcore_students.frequencia_semana, fitcore_students.professor_id, fitcore_students.user_id, fitcore_students.etiquetas, fitcore_students.observacoes_minimas, fitcore_students.consentimento_lgpd, fitcore_students.criado_em, fitcore_students.atualizado_em
      )
      SELECT jsonb_build_object('id', id, 'tenant_id', tenant_id, 'tenant_slug', ${sqlText(context.tenant_slug || "")}, 'nome_publico', nome_publico, 'codigo_publico', codigo_publico, 'nivel', nivel, 'status', status, 'objetivo', objetivo, 'modalidade_preferida', modalidade_preferida, 'frequencia_semana', frequencia_semana, 'professor_id', professor_id, 'user_id', user_id, 'etiquetas', etiquetas, 'observacoes_minimas', observacoes_minimas, 'consentimento_lgpd', consentimento_lgpd, 'criado_em', criado_em, 'atualizado_em', atualizado_em)::text FROM updated;
    `);
    const student = jsonScalar(raw);
    if (!student) return { guard: { allowed: false, statusCode: 404, response: { erro: "aluno_nao_encontrado" } } };
    const audit = recordEvent(context, student.id, "student_status_updated", detalhe, { status: statusAluno });
    return { ok: true, mvp: "MVP-23 Student Management", updated: true, tenant_slug: context.tenant_slug, student: publicStudent(student), audit };
  }

  return { enabled, status, listStudents, getStudent, createStudent, updateStudentStatus };
}
