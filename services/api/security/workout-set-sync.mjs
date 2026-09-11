// FITCORE PRO — MVP-46
// Sincronização idempotente de séries do treino mobile.

import { execFileSync } from "node:child_process";
import { normalizeRole } from "./access-context.mjs";

function clean(value, fallback = "", max = 180) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
  return text || fallback;
}
function sqlText(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}
function boolEnv(value, fallback = true) {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  return ["1", "true", "yes", "on", "sim"].includes(String(value).trim().toLowerCase());
}
function jsonScalar(value) {
  const text = String(value || "").trim();
  return text ? JSON.parse(text) : null;
}
function dbConnection(env = process.env) {
  const dbUrl = clean(env.FITCORE_DATABASE_URL || env.DATABASE_URL || "", "", 900);
  if (!dbUrl) throw new Error("FITCORE_DATABASE_URL ausente para MVP-46.");
  const parsed = new URL(dbUrl);
  return {
    args: [
      "-h", parsed.hostname,
      "-p", parsed.port || "5432",
      "-U", decodeURIComponent(parsed.username),
      "-d", decodeURIComponent(parsed.pathname.replace(/^\//, "")),
    ],
    env: {
      PGPASSWORD: decodeURIComponent(parsed.password || ""),
      PGCONNECT_TIMEOUT: "5",
      PGSSLMODE: parsed.searchParams.get("sslmode") || "disable",
    },
  };
}
function runSql(env, sql) {
  const connection = dbConnection(env);
  return execFileSync(clean(env.FITCORE_PSQL_BIN || "psql", "psql", 120), [
    ...connection.args, "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql,
  ], {
    encoding: "utf8", env: { ...process.env, ...connection.env }, timeout: 25000,
    maxBuffer: 10 * 1024 * 1024,
  }).trim();
}
function scalar(env, sql) {
  return runSql(env, sql)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1) || "";
}
function setTenantSession(context) {
  if (!context?.tenant_id) throw new Error("tenant_id ausente na sessão assinada.");
  return `SELECT set_config('app.tenant_id', ${sqlText(context.tenant_id)}, false);`;
}
function requireAluno(context = {}) {
  if (!context?.session_signed || !context?.tenant_id || !context?.actor_id) {
    return {
      allowed: false,
      statusCode: 401,
      response: { erro: "sessao_obrigatoria", mensagem: "Faça login para registrar séries." },
    };
  }
  if (normalizeRole(context.actor_role) !== "aluno") {
    return {
      allowed: false,
      statusCode: 403,
      response: { erro: "acesso_negado", mensagem: "Somente o aluno registra séries do próprio treino." },
    };
  }
  return { allowed: true };
}
function integer(value, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}
function decimal(value, min, max) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return Number.NaN;
  return Math.round(parsed * 100) / 100;
}
function uuid(value) {
  const text = clean(value, "", 80);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : "";
}

export function createWorkoutSetSyncManager(env = process.env) {
  const enabled = boolEnv(env.FITCORE_WORKOUT_SET_SYNC_ENABLED, false);

  function status(context = {}) {
    return {
      ok: true,
      mvp: "MVP-46 Mobile Release",
      enabled,
      tenant_slug: context?.tenant_slug || null,
      actor_role: context?.actor_role || null,
      set_sync: enabled,
      idempotent: true,
      offline_replay_safe: true,
    };
  }
  function upsertSet(context = {}, executionIdInput = "", exerciseInput = 0, setInput = 0, input = {}) {
    if (!enabled) {
      return { guard: { allowed: false, statusCode: 503, response: { erro: "workout_set_sync_disabled" } } };
    }
    const guard = requireAluno(context);
    if (!guard.allowed) return { guard };
    const executionId = uuid(executionIdInput);
    const exerciseIndex = integer(exerciseInput, 0, 500);
    const setIndex = integer(setInput, 0, 100);
    const reps = integer(input.reps, 1, 1000);
    const weightKg = decimal(input.weight_kg, 0, 2000);
    const rpe = input.rpe === undefined || input.rpe === null || input.rpe === ""
      ? null
      : integer(input.rpe, 1, 10);
    if (!executionId || exerciseIndex === null || setIndex === null || reps === null || Number.isNaN(weightKg) || rpe === null && input.rpe !== undefined && input.rpe !== null && input.rpe !== "") {
      return { guard: { allowed: false, statusCode: 400, response: { erro: "serie_invalida", mensagem: "Confira exercício, série, repetições, carga e RPE." } } };
    }
    const operationId = clean(input.client_operation_id || "", "", 160);
    const weightSql = weightKg === null ? "NULL" : String(weightKg);
    const rpeSql = rpe === null ? "NULL" : String(rpe);
    const raw = scalar(env, `
      ${setTenantSession(context)}
      WITH allowed_execution AS (
        SELECT e.id, e.tenant_id
        FROM fitcore_workout_executions e
        JOIN fitcore_students s ON s.id=e.student_id AND s.tenant_id=e.tenant_id
        WHERE e.tenant_id=${sqlText(context.tenant_id)}::uuid
          AND e.id=${sqlText(executionId)}::uuid
          AND s.user_id=${sqlText(context.actor_id)}::uuid
          AND e.status='em_execucao'
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(e.exercise_progress) item
            WHERE (item->>'index')::integer=${exerciseIndex}
          )
        LIMIT 1
      ), upserted AS (
        INSERT INTO fitcore_workout_execution_sets (
          tenant_id, execution_id, exercise_index, set_index, reps,
          weight_kg, rpe, client_operation_id, recorded_by, atualizado_em
        )
        SELECT tenant_id, id, ${exerciseIndex}, ${setIndex}, ${reps},
          ${weightSql}, ${rpeSql}, ${operationId ? sqlText(operationId) : "NULL"},
          ${sqlText(context.actor_id)}::uuid, now()
        FROM allowed_execution
        ON CONFLICT (tenant_id, execution_id, exercise_index, set_index)
        DO UPDATE SET
          reps=EXCLUDED.reps,
          weight_kg=EXCLUDED.weight_kg,
          rpe=EXCLUDED.rpe,
          client_operation_id=COALESCE(EXCLUDED.client_operation_id, fitcore_workout_execution_sets.client_operation_id),
          recorded_by=EXCLUDED.recorded_by,
          atualizado_em=now()
        RETURNING *
      ), audit AS (
        INSERT INTO fitcore_audit_events (
          tenant_id, actor_id, actor_role, recurso_tipo, recurso_id, acao, status, detalhe
        )
        SELECT tenant_id, ${sqlText(context.actor_id)}::uuid, 'aluno',
          'workout_execution_set', id, 'workout_set_upserted', 'ok',
          ${sqlText(`exercise_index=${exerciseIndex}; set_index=${setIndex}`)}
        FROM upserted
      )
      SELECT jsonb_build_object(
        'id', id, 'execution_id', execution_id, 'exercise_index', exercise_index,
        'set_index', set_index, 'reps', reps, 'weight_kg', weight_kg,
        'rpe', rpe, 'client_operation_id', client_operation_id,
        'created_at', criado_em, 'updated_at', atualizado_em
      )::text FROM upserted;
    `);
    const set = jsonScalar(raw);
    if (!set) {
      return {
        guard: {
          allowed: false,
          statusCode: 404,
          response: {
            erro: "execucao_ou_exercicio_nao_encontrado",
            mensagem: "A execução em andamento não pertence ao aluno ou o exercício não existe.",
          },
        },
      };
    }
    return {
      ok: true,
      mvp: "MVP-46 Mobile Release",
      synced: true,
      idempotent: true,
      set,
    };
  }

  function listSets(context = {}, executionIdInput = "") {
    if (!enabled) {
      return { guard: { allowed: false, statusCode: 503, response: { erro: "workout_set_sync_disabled" } } };
    }
    const guard = requireAluno(context);
    if (!guard.allowed) return { guard };
    const executionId = uuid(executionIdInput);
    if (!executionId) {
      return { guard: { allowed: false, statusCode: 400, response: { erro: "execution_id_invalido" } } };
    }
    const raw = scalar(env, `
      ${setTenantSession(context)}
      WITH allowed_execution AS (
        SELECT e.id
        FROM fitcore_workout_executions e
        JOIN fitcore_students s ON s.id=e.student_id AND s.tenant_id=e.tenant_id
        WHERE e.tenant_id=${sqlText(context.tenant_id)}::uuid
          AND e.id=${sqlText(executionId)}::uuid
          AND s.user_id=${sqlText(context.actor_id)}::uuid
        LIMIT 1
      ), rows AS (
        SELECT x.* FROM fitcore_workout_execution_sets x
        JOIN allowed_execution a ON a.id=x.execution_id
        WHERE x.tenant_id=${sqlText(context.tenant_id)}::uuid
        ORDER BY x.exercise_index, x.set_index
      )
      SELECT jsonb_build_object(
        'allowed', EXISTS (SELECT 1 FROM allowed_execution),
        'sets', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', id, 'execution_id', execution_id, 'exercise_index', exercise_index,
          'set_index', set_index, 'reps', reps, 'weight_kg', weight_kg,
          'rpe', rpe, 'client_operation_id', client_operation_id,
          'created_at', criado_em, 'updated_at', atualizado_em
        ) ORDER BY exercise_index, set_index) FROM rows), '[]'::jsonb)
      )::text;
    `);
    const data = jsonScalar(raw) || { allowed: false, sets: [] };
    if (!data.allowed) {
      return { guard: { allowed: false, statusCode: 404, response: { erro: "execucao_nao_encontrada" } } };
    }
    return {
      ok: true,
      mvp: "MVP-46 Mobile Release",
      tenant_slug: context.tenant_slug,
      execution_id: executionId,
      sets: data.sets || [],
      total: (data.sets || []).length,
    };
  }

  return {
    enabled,
    status,
    upsertSet,
    listSets,
  };
}
