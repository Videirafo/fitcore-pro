// FITCORE PRO — MVP-31
// Setup guiado pós-criação do negócio com progresso salvo por tenant.

import { execFileSync } from "node:child_process";
import { normalizeRole } from "./access-context.mjs";

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

function dbConnection(env = process.env) {
  const dbUrl = clean(env.FITCORE_DATABASE_URL || env.DATABASE_URL || "", "", 900);
  if (!dbUrl) throw new Error("FITCORE_DATABASE_URL ausente para MVP-31.");
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

function requireSession(context = {}) {
  if (!context?.session_signed || !context?.tenant_id) {
    return { allowed: false, statusCode: 401, response: { erro: "sessao_obrigatoria", mensagem: "Entre para ver o setup da unidade." } };
  }
  return { allowed: true };
}

function tenantScope(context) {
  return `scope AS (SELECT set_config('app.tenant_id', ${sqlText(context.tenant_id)}, true))`;
}

const STEP_DEFS = [
  { id: "professor", title: "Criar professor", href: "/equipe", metric: "professors_with_access", doneWhen: (c) => Number(c.professors_with_access || 0) > 0 },
  { id: "student", title: "Criar aluno", href: "/alunos", metric: "students", doneWhen: (c) => Number(c.students || 0) > 0 },
  { id: "prescription", title: "Prescrever treino", href: "/treinos", metric: "workouts", doneWhen: (c) => Number(c.workouts || 0) > 0 },
  { id: "execution", title: "Executar treino", href: "/execucao", metric: "completed_executions", doneWhen: (c) => Number(c.completed_executions || 0) > 0 },
  { id: "evolution", title: "Ver evolução", href: "/evolucao", metric: "evolution_events", doneWhen: (c) => Number(c.evolution_events || 0) > 0 || Number(c.completed_executions || 0) > 0 },
];

function publicSetup(context, counters, persisted) {
  const steps = STEP_DEFS.map((step, index) => ({
    ...step,
    order: index + 1,
    done: step.doneWhen(counters),
    count: Number(counters[step.metric] || 0),
  }));
  const completed = steps.filter((step) => step.done);
  const nextStep = steps.find((step) => !step.done) || steps[steps.length - 1];
  const progress = Math.round((completed.length / steps.length) * 100);
  return {
    ok: true,
    mvp: "MVP-31 Guided Setup",
    tenant_slug: context.tenant_slug,
    actor_role: context.actor_role,
    setup_guided: true,
    progress_percent: progress,
    completed_steps: completed.map((step) => step.id),
    current_step: nextStep?.id || "done",
    all_done: completed.length === steps.length,
    counters,
    steps,
    persisted,
  };
}

export function createGuidedSetupManager(env = process.env) {
  const enabled = boolEnv(env.FITCORE_GUIDED_SETUP_ENABLED, true);

  function status(context = {}) {
    return {
      ok: true,
      mvp: "MVP-31 Guided Setup",
      enabled,
      tenant_slug: context?.tenant_slug || null,
      actor_role: context?.actor_role || null,
      setup_progress_saved_by_tenant: true,
      endpoints: ["GET /api/mvp-31/status", "GET /api/mvp-31/setup", "POST /api/mvp-31/setup/event"],
    };
  }

  function getSetup(context = {}) {
    if (!enabled) return { guard: { allowed: false, statusCode: 503, response: { erro: "guided_setup_disabled" } } };
    const guard = requireSession(context);
    if (!guard.allowed) return { guard };
    const role = normalizeRole(context.actor_role || "visitante");
    const raw = scalar(env, `
      WITH ${tenantScope(context)}, counters AS (
        SELECT jsonb_build_object(
          'professors', (SELECT count(*) FROM fitcore_users WHERE tenant_id=${sqlText(context.tenant_id)}::uuid AND papel='professor' AND ativo=true),
          'professors_with_access', (SELECT count(*) FROM fitcore_users WHERE tenant_id=${sqlText(context.tenant_id)}::uuid AND papel='professor' AND ativo=true AND login_identifier IS NOT NULL AND credential_hash IS NOT NULL),
          'student_users_with_access', (SELECT count(*) FROM fitcore_users WHERE tenant_id=${sqlText(context.tenant_id)}::uuid AND papel='aluno' AND ativo=true AND login_identifier IS NOT NULL AND credential_hash IS NOT NULL),
          'students', (SELECT count(*) FROM fitcore_students WHERE tenant_id=${sqlText(context.tenant_id)}::uuid),
          'workouts', (SELECT count(*) FROM fitcore_workouts WHERE tenant_id=${sqlText(context.tenant_id)}::uuid),
          'approved_workouts', (SELECT count(*) FROM fitcore_workouts WHERE tenant_id=${sqlText(context.tenant_id)}::uuid AND status='aprovado'),
          'executions', (SELECT count(*) FROM fitcore_workout_executions WHERE tenant_id=${sqlText(context.tenant_id)}::uuid),
          'completed_executions', (SELECT count(*) FROM fitcore_workout_executions WHERE tenant_id=${sqlText(context.tenant_id)}::uuid AND status='concluido'),
          'evolution_events', (SELECT count(*) FROM fitcore_student_evolution_events WHERE tenant_id=${sqlText(context.tenant_id)}::uuid)
        )::text AS data
      ) SELECT data FROM counters;
    `);
    const counters = jsonScalar(raw) || {};
    const setup = publicSetup(context, counters, false);
    const actorSql = context.actor_id ? `${sqlText(context.actor_id)}::uuid` : "NULL";
    const saved = scalar(env, `
      WITH ${tenantScope(context)}, upserted AS (
        INSERT INTO fitcore_tenant_setup_progress (tenant_id, actor_id, current_step, completed_steps, progress_percent, status, payload, atualizado_em)
        SELECT ${sqlText(context.tenant_id)}::uuid, ${actorSql}, ${sqlText(setup.current_step)}, ARRAY[${setup.completed_steps.map(sqlText).join(",") || ""}]::text[], ${setup.progress_percent}, ${sqlText(setup.all_done ? "concluido" : "em_andamento")}, ${sqlJson({ counters, role, steps: setup.steps })}, now()
        FROM scope
        ON CONFLICT (tenant_id) DO UPDATE SET actor_id=EXCLUDED.actor_id, current_step=EXCLUDED.current_step, completed_steps=EXCLUDED.completed_steps, progress_percent=EXCLUDED.progress_percent, status=EXCLUDED.status, payload=EXCLUDED.payload, atualizado_em=now()
        RETURNING id, current_step, progress_percent, status, atualizado_em
      ), audit AS (
        INSERT INTO fitcore_audit_events (tenant_id, actor_id, actor_role, recurso_tipo, recurso_id, acao, status, detalhe)
        SELECT ${sqlText(context.tenant_id)}::uuid, ${actorSql}, ${sqlText(role)}, 'tenant_setup', id, 'setup_progress_viewed', 'ok', ${sqlText(`progress=${setup.progress_percent}; step=${setup.current_step}`)} FROM upserted
      ) SELECT jsonb_build_object('saved', true, 'progress_id', id, 'current_step', current_step, 'progress_percent', progress_percent, 'status', status, 'updated_at', atualizado_em)::text FROM upserted;
    `);
    return publicSetup(context, counters, jsonScalar(saved));
  }

  function recordEvent(context = {}, input = {}) {
    const guard = requireSession(context);
    if (!guard.allowed) return { guard };
    const step = clean(input.step || "setup", "setup", 80);
    const statusValue = clean(input.status || "ok", "ok", 40);
    const detail = clean(input.detail || input.detalhe || `step=${step}`, `step=${step}`, 400);
    const actorSql = context.actor_id ? `${sqlText(context.actor_id)}::uuid` : "NULL";
    const raw = scalar(env, `
      WITH ${tenantScope(context)}, created AS (
        INSERT INTO fitcore_tenant_setup_events (tenant_id, actor_id, step, status, detalhe, payload)
        SELECT ${sqlText(context.tenant_id)}::uuid, ${actorSql}, ${sqlText(step)}, ${sqlText(statusValue)}, ${sqlText(detail)}, ${sqlJson(input.payload || {})} FROM scope
        RETURNING id, step, status, criado_em
      ) SELECT jsonb_build_object('id', id, 'step', step, 'status', status, 'created_at', criado_em)::text FROM created;
    `);
    return { ok: true, mvp: "MVP-31 Guided Setup", event: jsonScalar(raw) };
  }

  return { enabled, status, getSetup, recordEvent };
}
