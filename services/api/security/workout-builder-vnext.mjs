// FITCORE PRO — #93 Workout Builder VNext
// Versioned builder over canonical fitcore_workouts/days/exercises. No parallel execution domain.

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
function sqlJson(value) { return `${sqlText(JSON.stringify(value ?? null))}::jsonb`; }
function jsonScalar(value) { const text = String(value || "").trim(); return text ? JSON.parse(text) : null; }
function boolEnv(value, fallback = true) {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  return ["1","true","yes","on","sim"].includes(String(value).trim().toLowerCase());
}
function dbConnection(env = process.env) {
  const dbUrl = clean(env.FITCORE_DATABASE_URL || env.DATABASE_URL || "", "", 900);
  if (!dbUrl) throw new Error("FITCORE_DATABASE_URL ausente para Workout Builder.");
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
    timeout: 30000,
    maxBuffer: 24 * 1024 * 1024,
  }).trim();
}
function scalar(env, sql) { return runSql(env, sql).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1) || ""; }
function tenantSession(context) {
  if (!context?.tenant_id) throw new Error("tenant_id ausente na sessão assinada.");
  return `SELECT set_config('app.tenant_id', ${sqlText(context.tenant_id)}, false);`;
}
function staffGuard(context = {}) {
  if (!context?.session_signed || !context?.tenant_id || !context?.actor_id) {
    return { allowed: false, statusCode: 401, response: { erro: "sessao_obrigatoria" } };
  }
  const role = normalizeRole(context.actor_role);
  if (!["gestor","professor"].includes(role)) {
    return { allowed: false, statusCode: 403, response: { erro: "workout_builder_staff_required" } };
  }
  return { allowed: true, role };
}
function accessPredicate(context, alias = "w") {
  const role = normalizeRole(context.actor_role);
  if (role === "gestor") return "true";
  return `(s.professor_id=${sqlText(context.actor_id)}::uuid OR ${alias}.professor_responsavel_id=${sqlText(context.actor_id)}::uuid OR (${alias}.payload->>'professor_id')=${sqlText(context.actor_id)})`;
}
function numberOrNull(value, min, max) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return null;
  return number;
}
function integerOr(value, fallback, min, max) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
}
function normalizeSnapshot(input = {}) {
  const source = input.snapshot && typeof input.snapshot === "object" && !Array.isArray(input.snapshot) ? input.snapshot : input;
  const daysInput = Array.isArray(source.days) ? source.days.slice(0, 7) : [];
  if (!daysInput.length) throw Object.assign(new Error("workout_builder_days_required"), { statusCode: 400 });
  let totalExercises = 0;
  const days = daysInput.map((day, dayIndex) => {
    const blocksInput = Array.isArray(day?.blocks) ? day.blocks.slice(0, 12) : [];
    if (!blocksInput.length) throw Object.assign(new Error("workout_builder_blocks_required"), { statusCode: 400 });
    const blocks = blocksInput.map((block, blockIndex) => {
      const exercisesInput = Array.isArray(block?.exercises) ? block.exercises.slice(0, 40) : [];
      if (!exercisesInput.length) throw Object.assign(new Error("workout_builder_exercises_required"), { statusCode: 400 });
      const exercises = exercisesInput.map((exercise, exerciseIndex) => {
        totalExercises += 1;
        if (totalExercises > 120) throw Object.assign(new Error("workout_builder_too_many_exercises"), { statusCode: 400 });
        const name = displayClean(exercise?.name || exercise?.nome, "", 120);
        if (!name) throw Object.assign(new Error("workout_builder_exercise_name_required"), { statusCode: 400 });
        const rirMin = numberOrNull(exercise?.rir_min ?? exercise?.target_rir_min, 0, 10);
        const rirMax = numberOrNull(exercise?.rir_max ?? exercise?.target_rir_max, 0, 10);
        if (rirMin !== null && rirMax !== null && rirMin > rirMax) {
          throw Object.assign(new Error("workout_builder_rir_range_invalid"), { statusCode: 400 });
        }
        return {
          order: exerciseIndex + 1,
          source_id: clean(exercise?.source_id || "", "", 120) || null,
          slug: clean(exercise?.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), "exercise", 140),
          name,
          category: displayClean(exercise?.category || exercise?.categoria || "", "", 80) || null,
          equipment: displayClean(exercise?.equipment || exercise?.equipamento || "", "", 80) || null,
          focus: displayClean(exercise?.focus || exercise?.foco || "", "", 100) || null,
          sets: integerOr(exercise?.sets ?? exercise?.series, 3, 1, 20),
          reps: displayClean(exercise?.reps ?? exercise?.repeticoes ?? "8-12", "8-12", 60),
          rest_seconds: integerOr(exercise?.rest_seconds ?? exercise?.descanso_segundos, 90, 0, 600),
          target_load_kg: numberOrNull(exercise?.target_load_kg, 0, 5000),
          target_rir_min: rirMin,
          target_rir_max: rirMax,
          target_rpe: numberOrNull(exercise?.target_rpe, 1, 10),
          tempo: displayClean(exercise?.tempo || "", "", 40) || null,
          protocol_code: clean(exercise?.protocol_code || block?.protocol_code || "", "", 80) || null,
          notes: displayClean(exercise?.notes || exercise?.observacao || "", "", 500) || null,
        };
      });
      return {
        order: blockIndex + 1,
        title: displayClean(block?.title || block?.titulo || `Bloco ${blockIndex + 1}`, `Bloco ${blockIndex + 1}`, 120),
        protocol_code: clean(block?.protocol_code || "", "", 80) || null,
        notes: displayClean(block?.notes || block?.observacao || "", "", 500) || null,
        exercises,
      };
    });
    return {
      order: dayIndex + 1,
      title: displayClean(day?.title || day?.titulo || `Dia ${dayIndex + 1}`, `Dia ${dayIndex + 1}`, 120),
      focus: displayClean(day?.focus || day?.foco || "", "", 100) || null,
      warmup: displayClean(day?.warmup || day?.aquecimento || "", "", 500) || null,
      guidance: displayClean(day?.guidance || day?.orientacao || "", "", 700) || null,
      blocks,
    };
  });
  return {
    name: displayClean(source.name || source.nome_treino || "Treino VNext", "Treino VNext", 120),
    objective: displayClean(source.objective || source.objetivo || "evolução", "evolução", 120),
    modality: clean(source.modality || source.modalidade || "academia", "academia", 60),
    focus: displayClean(source.focus || source.foco || "completo", "completo", 100),
    days,
  };
}
function normalizePeriodization(input = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const weeks = Array.isArray(source.weeks) ? source.weeks.slice(0, 52).map((week, index) => ({
    week: integerOr(week?.week, index + 1, 1, 52),
    label: displayClean(week?.label || `Semana ${index + 1}`, `Semana ${index + 1}`, 120),
    load_delta_pct: numberOrNull(week?.load_delta_pct, -100, 300),
    volume_delta_pct: numberOrNull(week?.volume_delta_pct, -100, 300),
    notes: displayClean(week?.notes || "", "", 400) || null,
  })) : [];
  return {
    model: clean(source.model || "linear", "linear", 60),
    weeks,
  };
}
function guardFailure(error, fallback = "workout_builder_failed") {
  const code = clean(error?.message || "", "", 120);
  const safe = /^workout_builder_|^workout_template_|^workout_protocol_/.test(code) ? code : fallback;
  return { guard: { allowed: false, statusCode: Number(error?.statusCode || 500), response: { erro: safe } } };
}

export function createWorkoutBuilderManager(env = process.env) {
  const enabled = boolEnv(env.FITCORE_WORKOUT_BUILDER_ENABLED, true);

  function status(context = {}) {
    return {
      ok: true,
      product: "Workout Builder VNext",
      issue: 93,
      enabled,
      canonical_domain: ["fitcore_workouts","fitcore_workout_days","fitcore_workout_blocks","fitcore_workout_exercises"],
      versioned_preview: true,
      publish_materializes_canonical_tables: true,
      templates: true,
      periodization: true,
      protocols: true,
      actor_role: normalizeRole(context.actor_role || "visitante"),
    };
  }

  function createVersion(context = {}, workoutId = "", input = {}) {
    if (!enabled) return { guard: { allowed: false, statusCode: 503, response: { erro: "workout_builder_disabled" } } };
    const guard = staffGuard(context); if (!guard.allowed) return { guard };
    try {
      const snapshot = normalizeSnapshot(input);
      const periodization = normalizePeriodization(input.periodization || {});
      const raw = scalar(env, `
        ${tenantSession(context)}
        WITH allowed AS (
          SELECT w.id
          FROM fitcore_workouts w
          JOIN fitcore_students s ON s.id=w.student_id AND s.tenant_id=w.tenant_id
          WHERE w.tenant_id=${sqlText(context.tenant_id)}::uuid
            AND w.id=${sqlText(workoutId)}::uuid
            AND ${accessPredicate(context)}
          LIMIT 1
        ), locked AS (
          SELECT pg_advisory_xact_lock(hashtextextended(${sqlText(context.tenant_id + ":" + workoutId)},0))
          FROM allowed
        ), next_version AS (
          SELECT COALESCE(max(v.version),0)+1 version
          FROM fitcore_workout_builder_versions v, locked
          WHERE v.tenant_id=${sqlText(context.tenant_id)}::uuid AND v.workout_id=${sqlText(workoutId)}::uuid
        ), inserted AS (
          INSERT INTO fitcore_workout_builder_versions(
            tenant_id,workout_id,version,state,snapshot,periodization,created_by
          )
          SELECT ${sqlText(context.tenant_id)}::uuid,allowed.id,next_version.version,'draft',
            ${sqlJson(snapshot)},${sqlJson(periodization)},${sqlText(context.actor_id)}::uuid
          FROM allowed,next_version
          RETURNING *
        )
        SELECT jsonb_build_object(
          'id',id,'workout_id',workout_id,'version',version,'state',state,
          'snapshot',snapshot,'periodization',periodization,'created_at',created_at
        )::text FROM inserted;
      `);
      const version = jsonScalar(raw);
      if (!version) return { guard: { allowed: false, statusCode: 404, response: { erro: "workout_builder_workout_not_found" } } };
      return { ok: true, product: "Workout Builder VNext", version };
    } catch (error) { return guardFailure(error); }
  }

  function listVersions(context = {}, workoutId = "") {
    if (!enabled) return { guard: { allowed: false, statusCode: 503, response: { erro: "workout_builder_disabled" } } };
    const guard = staffGuard(context); if (!guard.allowed) return { guard };
    try {
      const raw = scalar(env, `
        ${tenantSession(context)}
        WITH allowed AS (
          SELECT w.id
          FROM fitcore_workouts w
          JOIN fitcore_students s ON s.id=w.student_id AND s.tenant_id=w.tenant_id
          WHERE w.tenant_id=${sqlText(context.tenant_id)}::uuid
            AND w.id=${sqlText(workoutId)}::uuid
            AND ${accessPredicate(context)}
          LIMIT 1
        )
        SELECT jsonb_build_object(
          'workout_id',${sqlText(workoutId)},
          'published_version_id',(SELECT published_builder_version_id FROM fitcore_workouts WHERE id=(SELECT id FROM allowed)),
          'versions',COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id',v.id,'version',v.version,'state',v.state,'snapshot',v.snapshot,
              'periodization',v.periodization,'created_at',v.created_at,'published_at',v.published_at
            ) ORDER BY v.version DESC)
            FROM fitcore_workout_builder_versions v
            WHERE v.tenant_id=${sqlText(context.tenant_id)}::uuid AND v.workout_id=(SELECT id FROM allowed)
          ),'[]'::jsonb)
        )::text;
      `);
      const data = jsonScalar(raw);
      if (!data || !data.workout_id) return { guard: { allowed: false, statusCode: 404, response: { erro: "workout_builder_workout_not_found" } } };
      return { ok: true, product: "Workout Builder VNext", ...data };
    } catch (error) { return guardFailure(error); }
  }

  function publishVersion(context = {}, workoutId = "", versionId = "") {
    const guard = staffGuard(context); if (!guard.allowed) return { guard };
    const versions = listVersions(context, workoutId);
    if (versions.guard) return versions;
    const target = (versions.versions || []).find((item) => String(item.id) === String(versionId));
    if (!target) return { guard: { allowed: false, statusCode: 404, response: { erro: "workout_builder_version_not_found" } } };
    const snapshot = normalizeSnapshot({ snapshot: target.snapshot });
    const daySql = [];
    for (const day of snapshot.days) {
      daySql.push(`
        INSERT INTO fitcore_workout_days(tenant_id,workout_id,ordem,titulo,foco,aquecimento,orientacao)
        VALUES (${sqlText(context.tenant_id)}::uuid,${sqlText(workoutId)}::uuid,${day.order},${sqlText(day.title)},${sqlText(day.focus || "")},${sqlText(day.warmup || "")},${sqlText(day.guidance || "")});
      `);
      for (const block of day.blocks) {
        daySql.push(`
          INSERT INTO fitcore_workout_blocks(tenant_id,workout_day_id,ordem,titulo,protocol_code,observacao)
          SELECT ${sqlText(context.tenant_id)}::uuid,d.id,${block.order},${sqlText(block.title)},${block.protocol_code ? sqlText(block.protocol_code) : "NULL"},${block.notes ? sqlText(block.notes) : "NULL"}
          FROM fitcore_workout_days d
          WHERE d.tenant_id=${sqlText(context.tenant_id)}::uuid AND d.workout_id=${sqlText(workoutId)}::uuid AND d.ordem=${day.order};
        `);
        for (const exercise of block.exercises) {
          const load = exercise.target_load_kg === null ? "NULL" : Number(exercise.target_load_kg);
          const rirMin = exercise.target_rir_min === null ? "NULL" : Number(exercise.target_rir_min);
          const rirMax = exercise.target_rir_max === null ? "NULL" : Number(exercise.target_rir_max);
          const rpe = exercise.target_rpe === null ? "NULL" : Number(exercise.target_rpe);
          daySql.push(`
            INSERT INTO fitcore_workout_exercises(
              tenant_id,workout_day_id,block_id,ordem,source_id,slug,nome,categoria,equipamento,foco,
              series,repeticoes,descanso_segundos,target_load_kg,target_rir_min,target_rir_max,target_rpe,
              tempo,protocol_code,observacao
            )
            SELECT ${sqlText(context.tenant_id)}::uuid,d.id,b.id,${exercise.order},
              ${exercise.source_id ? sqlText(exercise.source_id) : "NULL"},${sqlText(exercise.slug)},${sqlText(exercise.name)},
              ${exercise.category ? sqlText(exercise.category) : "NULL"},${exercise.equipment ? sqlText(exercise.equipment) : "NULL"},
              ${exercise.focus ? sqlText(exercise.focus) : "NULL"},${exercise.sets},${sqlText(exercise.reps)},${exercise.rest_seconds},
              ${load},${rirMin},${rirMax},${rpe},${exercise.tempo ? sqlText(exercise.tempo) : "NULL"},
              ${exercise.protocol_code ? sqlText(exercise.protocol_code) : "NULL"},${exercise.notes ? sqlText(exercise.notes) : "NULL"}
            FROM fitcore_workout_days d
            JOIN fitcore_workout_blocks b ON b.workout_day_id=d.id AND b.ordem=${block.order}
            WHERE d.tenant_id=${sqlText(context.tenant_id)}::uuid AND d.workout_id=${sqlText(workoutId)}::uuid AND d.ordem=${day.order};
          `);
        }
      }
    }
    try {
      runSql(env, `
        BEGIN;
        ${tenantSession(context)}
        DO $publish$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM fitcore_workouts w
            JOIN fitcore_students s ON s.id=w.student_id AND s.tenant_id=w.tenant_id
            WHERE w.tenant_id=${sqlText(context.tenant_id)}::uuid
              AND w.id=${sqlText(workoutId)}::uuid
              AND ${accessPredicate(context)}
          ) THEN
            RAISE EXCEPTION 'workout_builder_workout_not_found';
          END IF;
        END
        $publish$;
        DELETE FROM fitcore_workout_days WHERE tenant_id=${sqlText(context.tenant_id)}::uuid AND workout_id=${sqlText(workoutId)}::uuid;
        ${daySql.join("\n")}
        UPDATE fitcore_workout_builder_versions
        SET state='superseded'
        WHERE tenant_id=${sqlText(context.tenant_id)}::uuid AND workout_id=${sqlText(workoutId)}::uuid AND state='published' AND id<>${sqlText(versionId)}::uuid;
        UPDATE fitcore_workout_builder_versions
        SET state='published',published_at=COALESCE(published_at,now())
        WHERE tenant_id=${sqlText(context.tenant_id)}::uuid AND workout_id=${sqlText(workoutId)}::uuid AND id=${sqlText(versionId)}::uuid;
        UPDATE fitcore_workouts
        SET published_builder_version_id=${sqlText(versionId)}::uuid,
            objetivo=${sqlText(snapshot.objective)},modalidade=${sqlText(snapshot.modality)},foco=${sqlText(snapshot.focus)},
            dias_semana=${snapshot.days.length},status='em_revisao',aprovado_por=NULL,aprovado_em=NULL,
            payload=COALESCE(payload,'{}'::jsonb) || jsonb_build_object(
              'nome_treino',${sqlText(snapshot.name)},'builder_version',${target.version},'builder_version_id',${sqlText(versionId)}
            ),
            atualizado_em=now()
        WHERE tenant_id=${sqlText(context.tenant_id)}::uuid AND id=${sqlText(workoutId)}::uuid;
        INSERT INTO fitcore_workout_prescription_events(tenant_id,actor_id,workout_id,student_id,evento,status,detalhe,payload)
        SELECT w.tenant_id,${sqlText(context.actor_id)}::uuid,w.id,w.student_id,'workout_builder_published','ok',
          ${sqlText(`builder version ${target.version} published`)},
          jsonb_build_object('version_id',${sqlText(versionId)},'version',${target.version})
        FROM fitcore_workouts w WHERE w.tenant_id=${sqlText(context.tenant_id)}::uuid AND w.id=${sqlText(workoutId)}::uuid;
        COMMIT;
      `);
      return { ok: true, product: "Workout Builder VNext", published: true, workout_id: workoutId, version_id: versionId, version: target.version, snapshot };
    } catch (error) { return guardFailure(error); }
  }

  function saveTemplate(context = {}, input = {}) {
    const guard = staffGuard(context); if (!guard.allowed) return { guard };
    const versionId = clean(input.version_id || "", "", 90);
    const code = clean(input.template_code || "", "", 80).toLowerCase().replace(/[^a-z0-9_.:-]+/g, "_");
    const name = displayClean(input.name || input.nome || "Template de treino", "Template de treino", 180);
    if (!versionId || !code) return { guard: { allowed: false, statusCode: 400, response: { erro: "workout_template_invalid" } } };
    try {
      const raw = scalar(env, `
        ${tenantSession(context)}
        WITH source AS (
          SELECT v.id
          FROM fitcore_workout_builder_versions v
          JOIN fitcore_workouts w ON w.id=v.workout_id AND w.tenant_id=v.tenant_id
          JOIN fitcore_students s ON s.id=w.student_id AND s.tenant_id=w.tenant_id
          WHERE v.tenant_id=${sqlText(context.tenant_id)}::uuid AND v.id=${sqlText(versionId)}::uuid
            AND ${accessPredicate(context)}
          LIMIT 1
        ), upserted AS (
          INSERT INTO fitcore_workout_templates(tenant_id,template_code,nome,source_version_id,ativo,created_by)
          SELECT ${sqlText(context.tenant_id)}::uuid,${sqlText(code)},${sqlText(name)},source.id,true,${sqlText(context.actor_id)}::uuid
          FROM source
          ON CONFLICT(tenant_id,template_code) DO UPDATE SET nome=EXCLUDED.nome,source_version_id=EXCLUDED.source_version_id,ativo=true
          RETURNING *
        )
        SELECT jsonb_build_object('id',id,'template_code',template_code,'name',nome,'source_version_id',source_version_id,'active',ativo)::text FROM upserted;
      `);
      const template = jsonScalar(raw);
      if (!template) return { guard: { allowed: false, statusCode: 404, response: { erro: "workout_builder_version_not_found" } } };
      return { ok: true, product: "Workout Builder VNext", template };
    } catch (error) { return guardFailure(error); }
  }

  function listTemplates(context = {}) {
    const guard = staffGuard(context); if (!guard.allowed) return { guard };
    try {
      const raw = scalar(env, `
        ${tenantSession(context)}
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id',t.id,'template_code',t.template_code,'name',t.nome,'source_version_id',t.source_version_id,
          'active',t.ativo,'created_at',t.created_at,
          'snapshot',v.snapshot,'periodization',v.periodization,'source_version',v.version
        ) ORDER BY t.created_at DESC),'[]'::jsonb)::text
        FROM fitcore_workout_templates t
        JOIN fitcore_workout_builder_versions v ON v.id=t.source_version_id AND v.tenant_id=t.tenant_id
        WHERE t.tenant_id=${sqlText(context.tenant_id)}::uuid AND t.ativo=true;
      `);
      return { ok: true, product: "Workout Builder VNext", templates: jsonScalar(raw) || [] };
    } catch (error) { return guardFailure(error); }
  }

  function cloneTemplate(context = {}, input = {}) {
    const guard = staffGuard(context); if (!guard.allowed) return { guard };
    const code = clean(input.template_code || "", "", 80);
    const studentId = clean(input.student_id || "", "", 90);
    if (!code || !studentId) return { guard: { allowed: false, statusCode: 400, response: { erro: "workout_template_clone_invalid" } } };
    const templates = listTemplates(context);
    if (templates.guard) return templates;
    const template = (templates.templates || []).find((item) => item.template_code === code);
    if (!template) return { guard: { allowed: false, statusCode: 404, response: { erro: "workout_template_not_found" } } };
    const snapshot = normalizeSnapshot({ snapshot: template.snapshot });
    const periodization = normalizePeriodization(template.periodization || {});
    const role = normalizeRole(context.actor_role);
    const professorId = clean(input.professor_id || (role === "professor" ? context.actor_id : ""), "", 90);
    try {
      const raw = scalar(env, `
        ${tenantSession(context)}
        WITH student AS (
          SELECT s.id,s.professor_id
          FROM fitcore_students s
          WHERE s.tenant_id=${sqlText(context.tenant_id)}::uuid AND s.id=${sqlText(studentId)}::uuid AND s.status<>'inativo'
          LIMIT 1
        ), created AS (
          INSERT INTO fitcore_workouts(
            tenant_id,source_mvp_id,student_id,objetivo,modalidade,foco,dias_semana,status,criado_por,professor_responsavel_id,payload,atualizado_em
          )
          SELECT ${sqlText(context.tenant_id)}::uuid,
            ${sqlText("builder-clone-" + Date.now().toString(36))} || '-' || substr(md5(random()::text),1,8),
            student.id,${sqlText(snapshot.objective)},${sqlText(snapshot.modality)},${sqlText(snapshot.focus)},${snapshot.days.length},
            'rascunho',${sqlText(context.actor_id)}::uuid,
            COALESCE(NULLIF(${sqlText(professorId)},'')::uuid,student.professor_id),
            jsonb_build_object('origem','workout_builder_template','nome_treino',${sqlText(snapshot.name)},'template_code',${sqlText(code)}),now()
          FROM student
          RETURNING *
        ), version AS (
          INSERT INTO fitcore_workout_builder_versions(tenant_id,workout_id,version,state,snapshot,periodization,created_by)
          SELECT created.tenant_id,created.id,1,'draft',${sqlJson(snapshot)},${sqlJson(periodization)},${sqlText(context.actor_id)}::uuid
          FROM created
          RETURNING *
        )
        SELECT jsonb_build_object('workout_id',created.id,'student_id',created.student_id,'version_id',version.id,'version',version.version,'state',version.state)::text
        FROM created,version;
      `);
      const clone = jsonScalar(raw);
      if (!clone) return { guard: { allowed: false, statusCode: 404, response: { erro: "workout_template_student_not_found" } } };
      return { ok: true, product: "Workout Builder VNext", cloned: true, clone };
    } catch (error) { return guardFailure(error); }
  }

  function upsertProtocol(context = {}, input = {}) {
    const guard = staffGuard(context); if (!guard.allowed) return { guard };
    const code = clean(input.protocol_code || "", "", 80).toLowerCase().replace(/[^a-z0-9_.:-]+/g, "_");
    const name = displayClean(input.name || input.nome || "", "", 180);
    const description = displayClean(input.description || input.descricao || "", "", 700);
    const defaults = input.defaults && typeof input.defaults === "object" && !Array.isArray(input.defaults) ? input.defaults : {};
    if (!code || !name) return { guard: { allowed: false, statusCode: 400, response: { erro: "workout_protocol_invalid" } } };
    try {
      const raw = scalar(env, `
        ${tenantSession(context)}
        INSERT INTO fitcore_workout_protocols(tenant_id,protocol_code,nome,descricao,defaults,ativo,created_by)
        VALUES(${sqlText(context.tenant_id)}::uuid,${sqlText(code)},${sqlText(name)},${sqlText(description)},${sqlJson(defaults)},true,${sqlText(context.actor_id)}::uuid)
        ON CONFLICT(tenant_id,protocol_code) DO UPDATE SET nome=EXCLUDED.nome,descricao=EXCLUDED.descricao,defaults=EXCLUDED.defaults,ativo=true
        RETURNING jsonb_build_object('protocol_code',protocol_code,'name',nome,'description',descricao,'defaults',defaults,'active',ativo)::text;
      `);
      return { ok: true, product: "Workout Builder VNext", protocol: jsonScalar(raw) };
    } catch (error) { return guardFailure(error); }
  }

  function listProtocols(context = {}) {
    const guard = staffGuard(context); if (!guard.allowed) return { guard };
    try {
      const raw = scalar(env, `
        ${tenantSession(context)}
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'protocol_code',protocol_code,'name',nome,'description',descricao,'defaults',defaults
        ) ORDER BY nome),'[]'::jsonb)::text
        FROM fitcore_workout_protocols
        WHERE tenant_id=${sqlText(context.tenant_id)}::uuid AND ativo=true;
      `);
      return { ok: true, product: "Workout Builder VNext", protocols: jsonScalar(raw) || [] };
    } catch (error) { return guardFailure(error); }
  }

  return { enabled, status, createVersion, listVersions, publishVersion, saveTemplate, listTemplates, cloneTemplate, upsertProtocol, listProtocols };
}
