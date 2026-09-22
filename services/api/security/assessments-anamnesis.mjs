// FITCORE PRO — #92 Anamnese + Avaliações Físicas
// Sensitive fitness assessment data stays tenant-scoped; AI receives derived descriptive signals only.

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
function boolEnv(value, fallback = true) {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  return ["1","true","yes","on","sim"].includes(String(value).trim().toLowerCase());
}
function sqlText(value) { return `'${String(value ?? "").replace(/'/g, "''")}'`; }
function sqlJson(value) { return `${sqlText(JSON.stringify(value ?? null))}::jsonb`; }
function sqlUuid(value) { return value ? `${sqlText(clean(value, "", 90))}::uuid` : "NULL"; }
function jsonScalar(value) { const text = String(value || "").trim(); return text ? JSON.parse(text) : null; }

function dbConnection(env = process.env) {
  const dbUrl = clean(env.FITCORE_DATABASE_URL || env.DATABASE_URL || "", "", 900);
  if (!dbUrl) throw new Error("FITCORE_DATABASE_URL ausente para Assessments.");
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
    return { allowed: false, statusCode: 401, response: { erro: "sessao_obrigatoria", mensagem: "Faça login para acessar anamnese e avaliações." } };
  }
  const role = normalizeRole(context.actor_role);
  if (!["gestor","professor","aluno"].includes(role)) {
    return { allowed: false, statusCode: 403, response: { erro: "assessment_role_forbidden" } };
  }
  return { allowed: true, role };
}
function mapDbError(error) {
  const message = error instanceof Error ? String(error.message || "") : String(error || "");
  const codes = [
    "assessment_tenant_context_mismatch","assessment_consent_subject_required","assessment_consent_invalid",
    "assessment_template_forbidden","assessment_template_invalid","assessment_template_not_found",
    "assessment_consent_required","assessment_record_invalid","assessment_student_write_forbidden",
    "assessment_role_forbidden","assessment_supersedes_invalid","assessment_measurement_invalid",
    "assessment_attachment_invalid","assessment_history_immutable",
    "athlete360_tenant_context_mismatch","athlete360_student_not_found_or_forbidden",
  ];
  const code = codes.find((item) => message.includes(item));
  if (!code) return error;
  const statusCode =
    code.includes("not_found") ? 404 :
    code.includes("forbidden") || code.includes("tenant_context") || code.includes("subject_required") ? 403 :
    code.includes("immutable") || code.includes("consent_required") || code.includes("supersedes") ? 409 : 400;
  return Object.assign(new Error(code), { code, statusCode });
}
function guardFailure(error, fallback = "assessment_failed") {
  const mapped = mapDbError(error);
  return { guard: { allowed: false, statusCode: mapped.statusCode || 500, response: { erro: mapped.code || mapped.message || fallback } } };
}

export function createAssessmentManager(env = process.env) {
  const enabled = boolEnv(env.FITCORE_ASSESSMENTS_ENABLED, true);

  function status(context = {}) {
    return {
      ok: true,
      product: "Anamnese + Avaliações Físicas",
      issue: 92,
      enabled,
      tenant_scoped: true,
      immutable_history: true,
      template_versioning: true,
      explicit_consent: true,
      attachment_reference_only: true,
      derived_signals: {
        server_side_only: true,
        descriptive_only: true,
        clinical_inference: false,
        raw_responses_to_external_ai: false,
        attachment_refs_to_external_ai: false,
      },
      roles: {
        aluno: ["own_history","own_anamnesis","own_consent"],
        professor: ["linked_student_history","physical_assessment"],
        gestor: ["tenant_student_history","physical_assessment","publish_template"],
      },
      actor_role: normalizeRole(context.actor_role || "visitante"),
    };
  }

  function summary(context = {}, studentId = "") {
    if (!enabled) return { guard: { allowed: false, statusCode: 503, response: { erro: "assessments_disabled" } } };
    const guard = signedGuard(context); if (!guard.allowed) return { guard };
    try {
      const data = jsonScalar(scalar(env, `
        ${tenantSession(context)}
        SELECT fitcore_assessment_summary(
          ${sqlText(context.tenant_id)}::uuid,
          ${sqlText(context.actor_id)}::uuid,
          ${sqlText(guard.role)},
          ${sqlUuid(studentId)}
        )::text;
      `)) || {};
      return { ok: true, product: "Assessments", actor_role: guard.role, summary: data };
    } catch (error) { return guardFailure(error); }
  }

  function history(context = {}, studentId = "", limit = 50) {
    if (!enabled) return { guard: { allowed: false, statusCode: 503, response: { erro: "assessments_disabled" } } };
    const guard = signedGuard(context); if (!guard.allowed) return { guard };
    const safeLimit = Math.min(Math.max(Number.parseInt(String(limit || 50), 10) || 50, 1), 100);
    try {
      const data = jsonScalar(scalar(env, `
        ${tenantSession(context)}
        SELECT fitcore_assessment_history(
          ${sqlText(context.tenant_id)}::uuid,
          ${sqlText(context.actor_id)}::uuid,
          ${sqlText(guard.role)},
          ${sqlUuid(studentId)},
          ${safeLimit}
        )::text;
      `)) || {};
      return { ok: true, product: "Assessments", actor_role: guard.role, ...data };
    } catch (error) { return guardFailure(error); }
  }

  function recordConsent(context = {}, studentId = "", input = {}) {
    if (!enabled) return { guard: { allowed: false, statusCode: 503, response: { erro: "assessments_disabled" } } };
    const guard = signedGuard(context); if (!guard.allowed) return { guard };
    const scope = clean(input.scope, "", 60);
    const state = clean(input.state, "", 20);
    const version = clean(input.consent_version || "v1", "v1", 40);
    try {
      const data = jsonScalar(scalar(env, `
        ${tenantSession(context)}
        SELECT fitcore_assessment_consent_record(
          ${sqlText(context.tenant_id)}::uuid,
          ${sqlText(context.actor_id)}::uuid,
          ${sqlText(guard.role)},
          ${studentId ? sqlUuid(studentId) : `fitcore_assessment_accessible_student(${sqlText(context.tenant_id)}::uuid,${sqlText(context.actor_id)}::uuid,${sqlText(guard.role)},NULL)`},
          ${sqlText(scope)},${sqlText(state)},${sqlText(version)}
        )::text;
      `));
      return { ok: true, product: "Assessments", consent: data };
    } catch (error) { return guardFailure(error); }
  }

  function listTemplates(context = {}) {
    if (!enabled) return { guard: { allowed: false, statusCode: 503, response: { erro: "assessments_disabled" } } };
    const guard = signedGuard(context); if (!guard.allowed) return { guard };
    try {
      const data = jsonScalar(scalar(env, `
        ${tenantSession(context)}
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id',q.id,'template_code',q.template_code,'version',q.version,'title',q.title,
          'assessment_kind',q.assessment_kind,'schema',q.schema_json,'created_at',q.created_at
        ) ORDER BY q.template_code,q.version DESC),'[]'::jsonb)::text
        FROM (
          SELECT * FROM fitcore_assessment_templates
          WHERE tenant_id=${sqlText(context.tenant_id)}::uuid
          ORDER BY template_code,version DESC
          LIMIT 100
        ) q;
      `)) || [];
      return { ok: true, product: "Assessments", templates: data };
    } catch (error) { return guardFailure(error); }
  }

  function publishTemplate(context = {}, input = {}) {
    if (!enabled) return { guard: { allowed: false, statusCode: 503, response: { erro: "assessments_disabled" } } };
    const guard = signedGuard(context); if (!guard.allowed) return { guard };
    const templateCode = clean(input.template_code, "", 80).toLowerCase().replace(/[^a-z0-9_.:-]+/g, "_");
    const title = displayClean(input.title, "", 180);
    const kind = clean(input.assessment_kind, "", 20).toLowerCase();
    const schema = input.schema && typeof input.schema === "object" && !Array.isArray(input.schema) ? input.schema : {};
    try {
      const data = jsonScalar(scalar(env, `
        ${tenantSession(context)}
        SELECT fitcore_assessment_template_publish(
          ${sqlText(context.tenant_id)}::uuid,
          ${sqlText(context.actor_id)}::uuid,
          ${sqlText(guard.role)},
          ${sqlText(templateCode)},${sqlText(title)},${sqlText(kind)},${sqlJson(schema)}
        )::text;
      `));
      return { ok: true, product: "Assessments", template: data };
    } catch (error) { return guardFailure(error); }
  }

  function recordAssessment(context = {}, studentId = "", input = {}) {
    if (!enabled) return { guard: { allowed: false, statusCode: 503, response: { erro: "assessments_disabled" } } };
    const guard = signedGuard(context); if (!guard.allowed) return { guard };
    const templateCode = clean(input.template_code, "", 80).toLowerCase().replace(/[^a-z0-9_.:-]+/g, "_");
    const templateVersion = Number.parseInt(String(input.template_version || 1), 10);
    const kind = clean(input.assessment_kind, "", 20).toLowerCase();
    const responses = input.responses && typeof input.responses === "object" && !Array.isArray(input.responses) ? input.responses : {};
    const measurements = Array.isArray(input.measurements) ? input.measurements.slice(0, 64).map((item) => ({
      code: clean(item?.code, "", 80).toLowerCase().replace(/[^a-z0-9_.:-]+/g, "_"),
      value: Number(item?.value),
      unit: displayClean(item?.unit, "", 30),
      method: displayClean(item?.method, "", 120) || null,
    })) : [];
    const attachments = Array.isArray(input.attachments) ? input.attachments.slice(0, 12).map((item) => ({
      label: displayClean(item?.label, "", 120),
      object_key: clean(item?.object_key, "", 500),
      media_type: clean(item?.media_type, "", 100).toLowerCase(),
      sha256: clean(item?.sha256, "", 64).toLowerCase(),
      size_bytes: Number.parseInt(String(item?.size_bytes || 0), 10),
    })) : [];
    try {
      const data = jsonScalar(scalar(env, `
        ${tenantSession(context)}
        SELECT fitcore_assessment_record(
          ${sqlText(context.tenant_id)}::uuid,
          ${sqlText(context.actor_id)}::uuid,
          ${sqlText(guard.role)},
          ${studentId ? sqlUuid(studentId) : `fitcore_assessment_accessible_student(${sqlText(context.tenant_id)}::uuid,${sqlText(context.actor_id)}::uuid,${sqlText(guard.role)},NULL)`},
          ${sqlText(templateCode)},${Number.isInteger(templateVersion) ? templateVersion : 1},
          ${sqlText(kind)},${sqlJson(responses)},${sqlJson(measurements)},${sqlJson(attachments)},
          ${sqlUuid(input.supersedes_assessment_id)}
        )::text;
      `));
      return { ok: true, product: "Assessments", assessment: data };
    } catch (error) { return guardFailure(error); }
  }

  function coachSignals(context = {}, studentId = "") {
    const result = summary(context, studentId);
    if (result.guard) return result;
    const s = result.summary || {};
    if (!s.ai_coach_allowed) {
      return {
        ok: true,
        allowed: false,
        reason: "ai_coach_assessment_consent_required",
        signals: null,
        policy: { raw_responses: false, attachments: false, clinical_inference: false },
      };
    }
    return {
      ok: true,
      allowed: true,
      signals: {
        assessment_count: Number(s.assessment_count || 0),
        anamnesis_count: Number(s.anamnesis_count || 0),
        physical_count: Number(s.physical_count || 0),
        last_assessment_at: s.last_assessment_at || null,
        measurement_trends: Array.isArray(s.measurement_trends)
          ? s.measurement_trends.slice(0, 12).map((item) => ({
              measurement_code: clean(item?.measurement_code, "", 80),
              unit: displayClean(item?.unit, "", 30),
              latest_value: item?.latest_value ?? null,
              previous_value: item?.previous_value ?? null,
              delta: item?.delta ?? null,
              sample_count: Number(item?.sample_count || 0),
            }))
          : [],
      },
      policy: {
        server_side_only: true,
        descriptive_only: true,
        raw_responses: false,
        attachments: false,
        clinical_inference: false,
        human_review_required: true,
      },
    };
  }

  return { enabled, status, summary, history, listTemplates, recordConsent, publishTemplate, recordAssessment, coachSignals };
}
