// FITCORE PRO — MVP-10
// PostgresStore controlado para persistência real.
// Seguro por padrão: só é ativado quando FITCORE_PERSISTENCE_STORE=postgres e FITCORE_DATABASE_URL estiver configurado.

import { execFileSync } from "node:child_process";

const RESOURCE_TABLES = Object.freeze({
  studentsAndWorkouts: {
    table: "fitcore_workouts",
    createdColumn: "criado_em",
    updatedColumn: "atualizado_em",
  },
  checkins: {
    table: "fitcore_workout_executions",
    createdColumn: "criado_em",
    updatedColumn: "atualizado_em",
  },
  professorReviews: {
    table: "fitcore_professor_reviews",
    createdColumn: "criado_em",
    updatedColumn: "atualizado_em",
  },
});

const REQUIRED_TABLES = Object.freeze([
  "fitcore_tenants",
  "fitcore_students",
  "fitcore_workouts",
  "fitcore_professor_reviews",
  "fitcore_workout_executions",
  "fitcore_audit_events",
]);

const REQUIRED_COLUMNS = Object.freeze([
  ["fitcore_students", "source_mvp_id"],
  ["fitcore_students", "payload"],
  ["fitcore_workouts", "source_mvp_id"],
  ["fitcore_workouts", "payload"],
  ["fitcore_professor_reviews", "source_mvp_id"],
  ["fitcore_professor_reviews", "payload"],
  ["fitcore_workout_executions", "source_mvp_id"],
  ["fitcore_workout_executions", "payload"],
  ["fitcore_audit_events", "source_mvp_id"],
  ["fitcore_audit_events", "external_resource_id"],
]);

function sanitizeText(value, maxLength = 240) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function sqlText(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

function sqlJson(value) {
  return `${sqlText(JSON.stringify(value ?? {}))}::jsonb`;
}

function sqlInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(Math.max(safe, min), max);
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function normalizeResource(resource) {
  if (!RESOURCE_TABLES[resource]) {
    throw new Error(`PostgresStore não reconhece o recurso: ${resource}`);
  }
  return RESOURCE_TABLES[resource];
}

function workoutStatus(value) {
  const status = sanitizeText(value, 40);
  if (status === "em_revisao" || status === "aprovado" || status === "arquivado") return status;
  return "rascunho";
}

function reviewStatus(value) {
  const status = sanitizeText(value, 40);
  if (status === "ajustes_solicitados" || status === "aprovado") return status;
  return "em_revisao";
}

function executionStatus(value) {
  const status = sanitizeText(value, 40);
  if (status === "em_execucao" || status === "concluido") return status;
  return "planejado";
}

function actorRole(value) {
  const role = sanitizeText(value, 40);
  if (["gestor", "professor", "aluno", "sistema"].includes(role)) return role;
  return "sistema";
}

export class PostgresStore {
  constructor({ env = process.env } = {}) {
    this.databaseUrl = String(env.FITCORE_DATABASE_URL || env.DATABASE_URL || "").trim();
    this.tenantSlug = sanitizeText(env.FITCORE_TENANT_SLUG || "demo", 80) || "demo";
    this.tenantId = sanitizeText(env.FITCORE_TENANT_ID || "", 80);
    this.psqlBin = sanitizeText(env.FITCORE_PSQL_BIN || "psql", 120) || "psql";
    this.connectTimeoutSeconds = sqlInt(env.FITCORE_DB_CONNECT_TIMEOUT_SECONDS, 5, 1, 30);
  }

  get name() {
    return "PostgresStore";
  }

  buildConnection() {
    if (!this.databaseUrl) {
      throw new Error("FITCORE_DATABASE_URL ausente.");
    }

    const parsed = new URL(this.databaseUrl);
    const sslMode = parsed.searchParams.get("sslmode") || undefined;
    const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));

    return {
      args: [
        "-h",
        parsed.hostname,
        "-p",
        parsed.port || "5432",
        "-U",
        decodeURIComponent(parsed.username),
        "-d",
        databaseName,
      ],
      env: {
        PGPASSWORD: decodeURIComponent(parsed.password || ""),
        PGCONNECT_TIMEOUT: String(this.connectTimeoutSeconds),
        ...(sslMode ? { PGSSLMODE: sslMode } : {}),
      },
    };
  }

  runSql(sql) {
    const connection = this.buildConnection();
    return execFileSync(
      this.psqlBin,
      [...connection.args, "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql],
      {
        encoding: "utf8",
        env: { ...process.env, ...connection.env },
        timeout: 20_000,
        maxBuffer: 10 * 1024 * 1024,
      },
    ).trim();
  }

  scalar(sql) {
    const output = this.runSql(sql);
    const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    return lines.at(-1) || "";
  }

  tenantCte() {
    if (isUuid(this.tenantId)) {
      return `tenant AS (SELECT ${sqlText(this.tenantId)}::uuid AS id), scope AS (SELECT set_config('app.tenant_id', ${sqlText(this.tenantId)}, true))`;
    }

    return `tenant AS (SELECT id FROM fitcore_tenants WHERE slug = ${sqlText(this.tenantSlug)} LIMIT 1), scope AS (SELECT set_config('app.tenant_id', (SELECT id::text FROM tenant), true))`;
  }

  checkReady() {
    if (!this.databaseUrl) {
      return {
        ready: false,
        status: "database_url_ausente",
        message: "FITCORE_DATABASE_URL não foi definido.",
      };
    }

    try {
      const tableValues = REQUIRED_TABLES.map((table) => `(${sqlText(table)})`).join(",");
      const columnValues = REQUIRED_COLUMNS.map(([table, column]) => `(${sqlText(table)}, ${sqlText(column)})`).join(",");
      const raw = this.scalar(`
        WITH required_tables(table_name) AS (VALUES ${tableValues}),
        required_columns(table_name, column_name) AS (VALUES ${columnValues}),
        missing_tables AS (
          SELECT rt.table_name
          FROM required_tables rt
          WHERE NOT EXISTS (
            SELECT 1
            FROM information_schema.tables it
            WHERE it.table_schema = 'public'
              AND it.table_name = rt.table_name
          )
        ),
        missing_columns AS (
          SELECT rc.table_name || '.' || rc.column_name AS name
          FROM required_columns rc
          WHERE NOT EXISTS (
            SELECT 1
            FROM information_schema.columns ic
            WHERE ic.table_schema = 'public'
              AND ic.table_name = rc.table_name
              AND ic.column_name = rc.column_name
          )
        )
        SELECT jsonb_build_object(
          'missing_tables', COALESCE((SELECT jsonb_agg(table_name) FROM missing_tables), '[]'::jsonb),
          'missing_columns', COALESCE((SELECT jsonb_agg(name) FROM missing_columns), '[]'::jsonb),
          'tables_ok', NOT EXISTS (SELECT 1 FROM missing_tables),
          'columns_ok', NOT EXISTS (SELECT 1 FROM missing_columns)
        )::text;
      `);
      const parsed = JSON.parse(raw || "{}");
      const ready = Boolean(parsed.tables_ok && parsed.columns_ok);
      return {
        ready,
        status: ready ? "ready" : "migration_incompleta",
        message: ready
          ? "PostgresStore pronto para ativação controlada."
          : "A migration do MVP-10 ainda não está completa no banco.",
        ...parsed,
      };
    } catch (error) {
      return {
        ready: false,
        status: "postgres_check_failed",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  readArray(resource) {
    const config = normalizeResource(resource);
    const raw = this.scalar(`
      WITH ${this.tenantCte()}
      SELECT COALESCE(jsonb_agg(${config.table}.payload ORDER BY ${config.table}.${config.updatedColumn} DESC, ${config.table}.${config.createdColumn} DESC), '[]'::jsonb)::text
      FROM ${config.table}, scope
      WHERE ${config.table}.tenant_id = (SELECT id FROM tenant)
        AND ${config.table}.payload IS NOT NULL
        AND ${config.table}.payload <> '{}'::jsonb;
    `);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  }

  writeArray(resource, records) {
    if (!Array.isArray(records)) {
      throw new Error(`PostgresStore esperava array para ${resource}.`);
    }

    for (const record of records) {
      if (resource === "studentsAndWorkouts") this.upsertStudentWorkout(record);
      else if (resource === "checkins") this.upsertWorkoutExecution(record);
      else if (resource === "professorReviews") this.upsertProfessorReview(record);
      else normalizeResource(resource);
    }
  }

  upsertAudit({ sourceId, recursoTipo, acao, status, detalhe, papel = "sistema" }) {
    this.runSql(`
      WITH ${this.tenantCte()}
      INSERT INTO fitcore_audit_events (
        tenant_id, actor_role, recurso_tipo, source_mvp_id, external_resource_id, acao, status, detalhe, politica_lgpd
      )
      SELECT
        tenant.id,
        ${sqlText(actorRole(papel))},
        ${sqlText(recursoTipo)},
        ${sqlText(sourceId)},
        ${sqlText(sourceId)},
        ${sqlText(acao)},
        ${sqlText(status)},
        ${sqlText(sanitizeText(detalhe, 240))},
        'evento_minimo_sem_documento_telefone_email_foto_medida_ou_dado_de_saude'
      FROM tenant, scope
      WHERE tenant.id IS NOT NULL
      ON CONFLICT DO NOTHING;
    `);
  }

  upsertStudentWorkout(record) {
    const sourceId = sanitizeText(record?.id || `mvp01-${Date.now()}`, 140);
    const studentSourceId = `${sourceId}:student`;
    const aluno = record?.aluno || {};
    const treino = record?.treino || {};

    this.runSql(`
      WITH ${this.tenantCte()},
      student_upsert AS (
        INSERT INTO fitcore_students (
          tenant_id, source_mvp_id, nome_publico, nivel, status, observacoes_minimas, payload, atualizado_em
        )
        SELECT
          tenant.id,
          ${sqlText(studentSourceId)},
          ${sqlText(sanitizeText(aluno.nome || "Aluno teste", 120))},
          ${sqlText(sanitizeText(aluno.nivel || "iniciante", 40))},
          'teste',
          ${sqlText(sanitizeText(aluno.observacoes || "", 500))},
          ${sqlJson(aluno)},
          now()
        FROM tenant, scope
        WHERE tenant.id IS NOT NULL
        ON CONFLICT (tenant_id, source_mvp_id) DO UPDATE SET
          nome_publico = EXCLUDED.nome_publico,
          nivel = EXCLUDED.nivel,
          observacoes_minimas = EXCLUDED.observacoes_minimas,
          payload = EXCLUDED.payload,
          atualizado_em = now()
        RETURNING id
      )
      INSERT INTO fitcore_workouts (
        tenant_id, source_mvp_id, student_id, objetivo, modalidade, foco, dias_semana, status, payload, atualizado_em
      )
      SELECT
        tenant.id,
        ${sqlText(sourceId)},
        student_upsert.id,
        ${sqlText(sanitizeText(treino.objetivo || treino.objetivo_nome || "saude", 80))},
        ${sqlText(sanitizeText(treino.modalidade || "academia", 80))},
        ${sqlText(sanitizeText(treino.foco || "completo", 80))},
        ${sqlInt(treino.dias_semana, 3, 1, 7)},
        ${sqlText(workoutStatus(record?.status))},
        ${sqlJson(record)},
        now()
      FROM tenant, student_upsert, scope
      WHERE tenant.id IS NOT NULL
      ON CONFLICT (tenant_id, source_mvp_id) DO UPDATE SET
        objetivo = EXCLUDED.objetivo,
        modalidade = EXCLUDED.modalidade,
        foco = EXCLUDED.foco,
        dias_semana = EXCLUDED.dias_semana,
        status = EXCLUDED.status,
        payload = EXCLUDED.payload,
        atualizado_em = now();
    `);

    this.upsertAudit({
      sourceId,
      recursoTipo: "treino",
      acao: "postgres_store_upsert",
      status: workoutStatus(record?.status),
      detalhe: "MVP-10 sincronizou aluno + treino no PostgresStore.",
      papel: "sistema",
    });
  }

  upsertWorkoutExecution(record) {
    const sourceId = sanitizeText(record?.id || `mvp02-${Date.now()}`, 140);
    const workoutSourceId = sanitizeText(record?.treino_id || "treino-manual", 140);
    const aluno = record?.aluno || {};

    this.runSql(`
      WITH ${this.tenantCte()},
      fallback_student AS (
        INSERT INTO fitcore_students (tenant_id, source_mvp_id, nome_publico, nivel, status, payload, atualizado_em)
        SELECT tenant.id, ${sqlText(`${sourceId}:student`)}, ${sqlText(sanitizeText(aluno.nome || "Aluno teste", 120))}, ${sqlText(sanitizeText(aluno.nivel || "iniciante", 40))}, 'teste', ${sqlJson(aluno)}, now()
        FROM tenant, scope
        WHERE tenant.id IS NOT NULL
        ON CONFLICT (tenant_id, source_mvp_id) DO UPDATE SET nome_publico = EXCLUDED.nome_publico, nivel = EXCLUDED.nivel, payload = EXCLUDED.payload, atualizado_em = now()
        RETURNING id
      ),
      target_workout AS (
        SELECT id, student_id FROM fitcore_workouts WHERE tenant_id = (SELECT id FROM tenant) AND source_mvp_id = ${sqlText(workoutSourceId)} LIMIT 1
      ),
      fallback_workout AS (
        INSERT INTO fitcore_workouts (tenant_id, source_mvp_id, student_id, objetivo, modalidade, foco, dias_semana, status, payload, atualizado_em)
        SELECT tenant.id, ${sqlText(`${sourceId}:workout`)}, fallback_student.id, 'validacao', 'academia', 'completo', 1, 'aprovado', ${sqlJson({ origem: "execucao_sem_treino_previo", treino_id: workoutSourceId })}, now()
        FROM tenant, fallback_student, scope
        WHERE NOT EXISTS (SELECT 1 FROM target_workout)
        ON CONFLICT (tenant_id, source_mvp_id) DO UPDATE SET payload = EXCLUDED.payload, atualizado_em = now()
        RETURNING id, student_id
      ),
      chosen_workout AS (
        SELECT id, student_id FROM target_workout
        UNION ALL
        SELECT id, student_id FROM fallback_workout
        LIMIT 1
      )
      INSERT INTO fitcore_workout_executions (
        tenant_id, source_mvp_id, workout_id, student_id, status, percepcao_esforco, duracao_minutos, observacoes, payload, atualizado_em
      )
      SELECT
        tenant.id,
        ${sqlText(sourceId)},
        chosen_workout.id,
        chosen_workout.student_id,
        ${sqlText(executionStatus(record?.status))},
        ${sqlInt(record?.percepcao_esforco, 5, 1, 10)},
        ${sqlInt(record?.duracao_minutos, 45, 1, 300)},
        ${sqlText(sanitizeText(record?.observacoes || "", 800))},
        ${sqlJson(record)},
        now()
      FROM tenant, chosen_workout, scope
      WHERE tenant.id IS NOT NULL
      ON CONFLICT (tenant_id, source_mvp_id) DO UPDATE SET
        status = EXCLUDED.status,
        percepcao_esforco = EXCLUDED.percepcao_esforco,
        duracao_minutos = EXCLUDED.duracao_minutos,
        observacoes = EXCLUDED.observacoes,
        payload = EXCLUDED.payload,
        atualizado_em = now();
    `);

    this.upsertAudit({
      sourceId,
      recursoTipo: "execucao_treino",
      acao: "postgres_store_upsert",
      status: executionStatus(record?.status),
      detalhe: "MVP-10 sincronizou execução/check-in no PostgresStore.",
      papel: record?.criado_por || "sistema",
    });
  }

  upsertProfessorReview(record) {
    const sourceId = sanitizeText(record?.id || `mvp03-${Date.now()}`, 140);
    const workoutSourceId = sanitizeText(record?.treino_id || "treino-manual", 140);
    const aluno = record?.aluno || {};
    const treino = record?.treino || {};

    this.runSql(`
      WITH ${this.tenantCte()},
      fallback_student AS (
        INSERT INTO fitcore_students (tenant_id, source_mvp_id, nome_publico, nivel, status, payload, atualizado_em)
        SELECT tenant.id, ${sqlText(`${sourceId}:student`)}, ${sqlText(sanitizeText(aluno.nome || "Aluno teste", 120))}, ${sqlText(sanitizeText(aluno.nivel || "iniciante", 40))}, 'teste', ${sqlJson(aluno)}, now()
        FROM tenant, scope
        WHERE tenant.id IS NOT NULL
        ON CONFLICT (tenant_id, source_mvp_id) DO UPDATE SET nome_publico = EXCLUDED.nome_publico, nivel = EXCLUDED.nivel, payload = EXCLUDED.payload, atualizado_em = now()
        RETURNING id
      ),
      target_workout AS (
        SELECT id FROM fitcore_workouts WHERE tenant_id = (SELECT id FROM tenant) AND source_mvp_id = ${sqlText(workoutSourceId)} LIMIT 1
      ),
      fallback_workout AS (
        INSERT INTO fitcore_workouts (tenant_id, source_mvp_id, student_id, objetivo, modalidade, foco, dias_semana, status, payload, atualizado_em)
        SELECT tenant.id, ${sqlText(workoutSourceId)}, fallback_student.id, ${sqlText(sanitizeText(treino.objetivo || "validacao", 80))}, ${sqlText(sanitizeText(treino.modalidade || "academia", 80))}, ${sqlText(sanitizeText(treino.foco || "completo", 80))}, ${sqlInt(treino.dias_semana, 1, 1, 7)}, 'em_revisao', ${sqlJson({ origem: "review_sem_treino_previo", treino_id: workoutSourceId })}, now()
        FROM tenant, fallback_student, scope
        WHERE NOT EXISTS (SELECT 1 FROM target_workout)
        ON CONFLICT (tenant_id, source_mvp_id) DO UPDATE SET payload = EXCLUDED.payload, atualizado_em = now()
        RETURNING id
      ),
      chosen_workout AS (
        SELECT id FROM target_workout
        UNION ALL
        SELECT id FROM fallback_workout
        LIMIT 1
      )
      INSERT INTO fitcore_professor_reviews (
        tenant_id, source_mvp_id, workout_id, status, observacoes, ajustes, payload, atualizado_em
      )
      SELECT
        tenant.id,
        ${sqlText(sourceId)},
        chosen_workout.id,
        ${sqlText(reviewStatus(record?.status))},
        ${sqlText(sanitizeText(record?.revisao?.observacoes || "", 800))},
        ${sqlJson(record?.revisao?.ajustes || [])},
        ${sqlJson(record)},
        now()
      FROM tenant, chosen_workout, scope
      WHERE tenant.id IS NOT NULL
      ON CONFLICT (tenant_id, source_mvp_id) DO UPDATE SET
        status = EXCLUDED.status,
        observacoes = EXCLUDED.observacoes,
        ajustes = EXCLUDED.ajustes,
        payload = EXCLUDED.payload,
        atualizado_em = now();
    `);

    this.upsertAudit({
      sourceId,
      recursoTipo: "revisao_professor",
      acao: "postgres_store_upsert",
      status: reviewStatus(record?.status),
      detalhe: "MVP-10 sincronizou revisão do professor no PostgresStore.",
      papel: record?.professor?.papel || "professor",
    });
  }
}
