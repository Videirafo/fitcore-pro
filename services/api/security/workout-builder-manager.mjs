// FITCORE PRO — #93 Workout Builder VNext API manager.

import { execFileSync } from "node:child_process";
import { normalizeRole } from "./access-context.mjs";
import { normalizeWorkoutBuilder, workoutBuilderPreview } from "./workout-builder-vnext.mjs";

function clean(value, fallback = "", max = 240) {
  const text = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return text || fallback;
}
function code(value, fallback = "", max = 80) {
  return clean(value, fallback, max).toLowerCase().replace(/[^a-z0-9_.:-]+/g, "_");
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
function dbConnection(env = process.env) {
  const dbUrl = clean(env.FITCORE_DATABASE_URL || env.DATABASE_URL || "", "", 900);
  if (!dbUrl) throw new Error("FITCORE_DATABASE_URL ausente para Workout Builder VNext.");
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
function scalar(env, sql) {
  return runSql(env, sql).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1) || "";
}
function guard(context = {}) {
  if (!context?.session_signed || !context?.tenant_id || !context?.actor_id) {
    return { allowed: false, statusCode: 401, response: { erro: "sessao_obrigatoria" } };
  }
  const role = normalizeRole(context.actor_role);
  if (!["gestor","professor"].includes(role)) {
    return { allowed: false, statusCode: 403, response: { erro: "workout_builder_role_forbidden" } };
  }
  return { allowed: true, role };
}
function tenantSession(context) {
  return `SELECT set_config('app.tenant_id', ${sqlText(context.tenant_id)}, false);`;
}

export function createWorkoutBuilderManager(env = process.env) {
  function status(context = {}) {
    const role = normalizeRole(context.actor_role || "visitante");
    return {
      ok: true,
      product: "Workout Builder VNext",
      issue: 93,
      schema_version: 1,
      tenant_scoped: true,
      actor_role: role,
      roles: ["gestor","professor"],
      capabilities: {
        preview: true,
        templates: true,
        clone: true,
        prescription_publish: false,
      },
      endpoints: [
        "GET /api/vnext/workout-builder/status",
        "POST /api/vnext/workout-builder/preview",
        "GET /api/vnext/workout-builder/templates",
        "POST /api/vnext/workout-builder/templates",
        "GET /api/vnext/workout-builder/templates/:templateKey/clone",
      ],
    };
  }

  function preview(context = {}, input = {}) {
    const access = guard(context);
    if (!access.allowed) return { guard: access };
    const result = workoutBuilderPreview(input);
    return {
      ok: true,
      product: "Workout Builder VNext",
      actor_role: access.role,
      tenant_slug: context.tenant_slug || null,
      ...result,
    };
  }

  function listTemplates(context = {}, url = null) {
    const access = guard(context);
    if (!access.allowed) return { guard: access };
    const statusFilter = code(url?.searchParams?.get("status") || "", "", 20);
    const whereStatus = ["draft","published","archived"].includes(statusFilter)
      ? `AND t.status=${sqlText(statusFilter)}`
      : "";
    try {
      const data = jsonScalar(scalar(env, `
        ${tenantSession(context)}
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id',t.id,
          'template_key',t.template_key,
          'version',t.version,
          'title',t.title,
          'objective',t.objective,
          'protocol_code',t.protocol_code,
          'periodization',t.periodization,
          'status',t.status,
          'published_at',t.published_at,
          'created_at',t.created_at
        ) ORDER BY t.template_key,t.version DESC),'[]'::jsonb)::text
        FROM fitcore_workout_templates t
        WHERE t.tenant_id=${sqlText(context.tenant_id)}::uuid
        ${whereStatus};
      `)) || [];
      return { ok: true, product: "Workout Builder VNext", templates: data };
    } catch (error) {
      return { guard: { allowed: false, statusCode: 500, response: { erro: clean(error?.message, "workout_builder_templates_failed", 160) } } };
    }
  }

  function publishTemplate(context = {}, input = {}) {
    const access = guard(context);
    if (!access.allowed) return { guard: access };
    const templateKey = code(input.template_key || input.key || input.title || input.nome_treino, "", 80);
    if (templateKey.length < 3) {
      return { guard: { allowed: false, statusCode: 400, response: { erro: "workout_builder_template_key_invalid" } } };
    }
    const builder = normalizeWorkoutBuilder(input.builder || input);
    const previewResult = workoutBuilderPreview(builder);
    if (!previewResult.publishable) {
      return { guard: { allowed: false, statusCode: 422, response: { erro: "workout_builder_not_publishable" } } };
    }
    const statusValue = input.status === "draft" ? "draft" : "published";
    try {
      const row = jsonScalar(scalar(env, `
        ${tenantSession(context)}
        WITH lock_row AS (
          SELECT pg_advisory_xact_lock(
            hashtextextended(${sqlText(context.tenant_id + ":" + templateKey)},0)
          )
        ), next_version AS (
          SELECT COALESCE(MAX(t.version),0)+1 AS version
          FROM fitcore_workout_templates t, lock_row
          WHERE t.tenant_id=${sqlText(context.tenant_id)}::uuid
            AND t.template_key=${sqlText(templateKey)}
        ), inserted AS (
          INSERT INTO fitcore_workout_templates(
            tenant_id,template_key,version,title,objective,protocol_code,
            periodization,builder,status,created_by_user_id,published_at
          )
          SELECT
            ${sqlText(context.tenant_id)}::uuid,
            ${sqlText(templateKey)},
            next_version.version,
            ${sqlText(builder.title)},
            ${sqlText(builder.objective)},
            ${sqlText(builder.protocol_code)},
            ${sqlJson(builder.periodization)},
            ${sqlJson(builder)},
            ${sqlText(statusValue)},
            ${sqlText(context.actor_id)}::uuid,
            CASE WHEN ${sqlText(statusValue)}='published' THEN now() ELSE NULL END
          FROM next_version
          RETURNING *
        )
        SELECT jsonb_build_object(
          'id',id,'template_key',template_key,'version',version,'title',title,
          'objective',objective,'protocol_code',protocol_code,'periodization',periodization,
          'status',status,'published_at',published_at,'created_at',created_at
        )::text
        FROM inserted;
      `));
      return { ok: true, product: "Workout Builder VNext", template: row, preview: previewResult.summary };
    } catch (error) {
      return { guard: { allowed: false, statusCode: 500, response: { erro: clean(error?.message, "workout_builder_publish_failed", 160) } } };
    }
  }

  function cloneTemplate(context = {}, templateKey = "", version = null) {
    const access = guard(context);
    if (!access.allowed) return { guard: access };
    const key = code(templateKey, "", 80);
    if (!key) return { guard: { allowed: false, statusCode: 400, response: { erro: "workout_builder_template_key_invalid" } } };
    const versionFilter = Number.isInteger(Number(version)) && Number(version) > 0
      ? `AND t.version=${Math.min(Number(version),10000)}`
      : "";
    try {
      const builder = jsonScalar(scalar(env, `
        ${tenantSession(context)}
        SELECT t.builder::text
        FROM fitcore_workout_templates t
        WHERE t.tenant_id=${sqlText(context.tenant_id)}::uuid
          AND t.template_key=${sqlText(key)}
          ${versionFilter}
        ORDER BY t.version DESC
        LIMIT 1;
      `));
      if (!builder) return { guard: { allowed: false, statusCode: 404, response: { erro: "workout_builder_template_not_found" } } };
      return {
        ok: true,
        product: "Workout Builder VNext",
        cloned: true,
        ...workoutBuilderPreview(builder),
      };
    } catch (error) {
      return { guard: { allowed: false, statusCode: 500, response: { erro: clean(error?.message, "workout_builder_clone_failed", 160) } } };
    }
  }

  return { status, preview, listTemplates, publishTemplate, cloneTemplate };
}
