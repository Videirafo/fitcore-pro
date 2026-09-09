#!/usr/bin/env node

/**
 * FITCORE PRO - API própria inicial
 *
 * API HTTP sem dependências externas para validar a arquitetura:
 * tela própria FitCore -> API própria -> catálogo normalizado + motor fitness interno.
 */

import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createServerPersistenceAdapter, createServerPersistenceHealth } from "./persistence/server-adapter-glue.mjs";
import { createAccessContext, createAccessHealth } from "./security/access-context.mjs";
import { createSignedSessionManager } from "./security/signed-session.mjs";

const root = resolve(process.cwd());
const port = Number.parseInt(process.env.FITCORE_API_PORT || "8091", 10);
const host = process.env.FITCORE_API_HOST || "127.0.0.1";

const catalogPath = resolve(root, "storage/exercises-dataset/exercises.normalized.json");
const mvp01StorePath = resolve(root, "storage/mvp-01/aluno-treino.json");
const mvp02CheckinStorePath = resolve(root, "storage/mvp-02/checkins.json");
const mvp03ReviewStorePath = resolve(root, "storage/mvp-03/professor-reviews.json");

const wgerInternalUrl = process.env.FITCORE_WGER_INTERNAL_URL || "http://127.0.0.1:8088";

const persistenceAdapter = createServerPersistenceAdapter({
  env: process.env,
  paths: {
    studentsAndWorkouts: mvp01StorePath,
    checkins: mvp02CheckinStorePath,
    professorReviews: mvp03ReviewStorePath,
  },
  readJsonArray,
  writeJsonArray,
});

const sessionManager = createSignedSessionManager(process.env);

let catalogCache = null;
let catalogLoadedAt = null;

const queryAliases = new Map([
  ["agachamento", "squat"],
  ["peito", "chest"],
  ["costas", "back"],
  ["halter", "dumbbell"],
  ["halteres", "dumbbell"],
  ["barra", "barbell"],
  ["abdominal", "abs"],
  ["abdomen", "abs"],
  ["abdômen", "abs"],
  ["biceps", "biceps"],
  ["bíceps", "biceps"],
  ["triceps", "triceps"],
  ["tríceps", "triceps"],
  ["perna", "legs"],
  ["pernas", "legs"],
  ["ombro", "shoulders"],
  ["ombros", "shoulders"],
  ["funcional", "body weight"],
  ["crossfit", "burpee"],
  ["cross training", "burpee"],
  ["box", "burpee"],
  ["burpee", "burpee"],
  ["kettlebell", "kettlebell"],
]);

const labelMap = new Map([
  ["back", "costas"],
  ["chest", "peito"],
  ["upper legs", "pernas"],
  ["lower legs", "panturrilhas"],
  ["upper arms", "braços"],
  ["lower arms", "antebraços"],
  ["shoulders", "ombros"],
  ["waist", "abdômen"],
  ["cardio", "cardio"],
  ["dumbbell", "halter"],
  ["barbell", "barra"],
  ["cable", "cabo"],
  ["body weight", "peso corporal"],
  ["leverage machine", "máquina"],
  ["assisted", "assistido"],
  ["band", "elástico"],
  ["kettlebell", "kettlebell"],
  ["medicine ball", "bola medicinal"],
  ["rope", "corda"],
  ["wheel roller", "roda abdominal"],
  ["pectorals", "peitoral"],
  ["lats", "dorsais"],
  ["latissimus dorsi", "dorsal largo"],
  ["rhomboids", "romboides"],
  ["rear deltoids", "deltoides posteriores"],
  ["upper back", "parte superior das costas"],
  ["quads", "quadríceps"],
  ["quadriceps", "quadríceps"],
  ["glutes", "glúteos"],
  ["hamstrings", "posterior de coxa"],
  ["abs", "abdômen"],
  ["calves", "panturrilhas"],
  ["biceps", "bíceps"],
  ["triceps", "tríceps"],
  ["delts", "deltoides"],
  ["forearms", "antebraços"],
  ["core", "core"],
  ["hip flexors", "flexores do quadril"],
]);

const exactExerciseNames = new Map([
  ["barbell bench front squat", "Agachamento frontal com barra no banco"],
  ["barbell bench squat", "Agachamento com barra no banco"],
  ["barbell clean-grip front squat", "Agachamento frontal com pegada clean"],
  ["barbell front chest squat", "Agachamento frontal com barra no peito"],
  ["barbell front squat", "Agachamento frontal com barra"],
  ["barbell full squat", "Agachamento completo com barra"],
  ["dumbbell bench press", "Supino com halteres no banco"],
  ["dumbbell decline bench press", "Supino declinado com halteres"],
  ["dumbbell around pullover", "Pullover com halter"],
  ["dumbbell decline fly", "Crucifixo declinado com halteres"],
  ["alternate lateral pulldown", "Puxada lateral alternada"],
  ["cable bar lateral pulldown", "Puxada lateral no cabo com barra"],
  ["cable cross-over lateral pulldown", "Puxada lateral cruzada no cabo"],
  ["cable decline seated wide-grip row", "Remada sentada aberta no cabo"],
  ["assisted chest dip (kneeling)", "Mergulho para peito assistido ajoelhado"],
  ["assisted hanging knee raise with throw down", "Elevação de joelhos suspenso com auxílio"],
]);

const phraseTranslations = [
  ["bench press", "supino"],
  ["front squat", "agachamento frontal"],
  ["full squat", "agachamento completo"],
  ["wide-grip row", "remada aberta"],
  ["lateral pulldown", "puxada lateral"],
  ["decline fly", "crucifixo declinado"],
  ["barbell", "com barra"],
  ["dumbbell", "com halter"],
  ["kettlebell", "com kettlebell"],
  ["body weight", "com peso corporal"],
  ["cable", "no cabo"],
  ["leverage machine", "na máquina"],
  ["assisted", "assistido"],
  ["resistance band", "com elástico"],
  ["band", "com elástico"],
  ["bench", "no banco"],
  ["squat", "agachamento"],
  ["lunge", "avanço"],
  ["deadlift", "levantamento terra"],
  ["press", "desenvolvimento"],
  ["pulldown", "puxada"],
  ["pull-up", "barra fixa"],
  ["push-up", "flexão"],
  ["dip", "mergulho"],
  ["curl", "rosca"],
  ["raise", "elevação"],
  ["row", "remada"],
  ["extension", "extensão"],
  ["crunch", "abdominal"],
  ["plank", "prancha"],
  ["burpee", "burpee"],
  ["clean", "clean"],
  ["snatch", "snatch"],
  ["thruster", "thruster"],
  ["chest", "peito"],
  ["front", "frontal"],
  ["lateral", "lateral"],
  ["reverse", "reverso"],
  ["standing", "em pé"],
  ["seated", "sentado"],
  ["lying", "deitado"],
  ["kneeling", "ajoelhado"],
  ["hanging", "suspenso"],
  ["alternate", "alternado"],
];

const crossTrainingTemplates = [
  {
    id: "box-iniciante-01",
    nome: "Box iniciante - técnica e condicionamento",
    foco: "aprender movimentos com segurança",
    blocos: [
      "Aquecimento: mobilidade de quadril, ombros e tornozelos por 8 minutos",
      "Técnica: agachamento, remada, prancha e burpee adaptado",
      "Circuito: 4 rounds controlados, sem buscar carga máxima",
      "Finalização: alongamento leve e registro de percepção de esforço",
    ],
  },
  {
    id: "wod-forca-01",
    nome: "WOD força - pernas e core",
    foco: "força, estabilidade e resistência",
    blocos: [
      "Aquecimento: bike leve, mobilidade e ativação de glúteos",
      "Força: agachamento com barra ou variação adaptada",
      "WOD: combinação de agachamento, kettlebell swing e abdominal",
      "Escala: reduzir carga, reps ou amplitude conforme o nível do aluno",
    ],
  },
  {
    id: "funcional-turma-01",
    nome: "Funcional em turma - circuito completo",
    foco: "frequência, aderência e evolução coletiva",
    blocos: [
      "Aquecimento: corrida estacionária e mobilidade geral",
      "Estações: corda, peso corporal, kettlebell, prancha e deslocamentos",
      "Controle: tempo por estação e intervalo de recuperação",
      "Acompanhamento: presença, observações e ajuste por aluno",
    ],
  },
];

const objetivoTemplates = {
  hipertrofia: {
    titulo: "Hipertrofia",
    descricao: "foco em volume, técnica e progressão de carga",
    buscas: ["chest dumbbell", "back cable", "squat", "shoulders dumbbell"],
  },
  emagrecimento: {
    titulo: "Emagrecimento",
    descricao: "foco em gasto calórico, constância e exercícios multiarticulares",
    buscas: ["body weight", "cardio", "squat", "burpee"],
  },
  condicionamento: {
    titulo: "Condicionamento",
    descricao: "foco em resistência, mobilidade e capacidade cardiovascular",
    buscas: ["burpee", "kettlebell", "body weight", "abs"],
  },
  forca: {
    titulo: "Força",
    descricao: "foco em movimentos base, controle de carga e descanso adequado",
    buscas: ["barbell squat", "bench press", "deadlift", "row"],
  },
  saude: {
    titulo: "Saúde e qualidade de vida",
    descricao: "foco em segurança, regularidade e evolução gradual",
    buscas: ["body weight", "abs", "back", "upper legs"],
  },
};

const focoTemplates = {
  completo: ["squat", "chest dumbbell", "back cable", "abs body weight"],
  pernas: ["squat", "glutes", "leg", "calves"],
  superiores: ["chest dumbbell", "back cable", "shoulders", "biceps"],
  core: ["abs", "plank", "crunch", "body weight"],
  funcional: ["burpee", "kettlebell", "body weight", "cardio"],
};

const allowedCheckinStatus = new Set(["planejado", "em_execucao", "concluido"]);
const allowedRoles = new Set(["gestor", "professor", "aluno"]);
const allowedReviewStatus = new Set(["em_revisao", "ajustes_solicitados", "aprovado"]);

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-fitcore-api": "owned-api",
    ...extraHeaders,
  });
  res.end(body);
}

function sendNotFound(res) {
  sendJson(res, 404, {
    erro: "nao_encontrado",
    mensagem: "Endpoint não encontrado.",
  });
}

function sendMethodNotAllowed(res) {
  sendJson(res, 405, {
    erro: "metodo_nao_permitido",
    mensagem: "Método HTTP não permitido para este endpoint.",
  });
}

function loadCatalog() {
  if (catalogCache) return catalogCache;

  if (!existsSync(catalogPath)) {
    throw new Error(`Catálogo normalizado não encontrado em ${catalogPath}. Rode: npm run exercises:sync && npm run exercises:normalize`);
  }

  const raw = readFileSync(catalogPath, "utf-8");
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error("Catálogo normalizado inválido: esperado array JSON.");
  }

  catalogCache = parsed;
  catalogLoadedAt = new Date().toISOString();
  return catalogCache;
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeSearchTerm(value) {
  const raw = normalizeText(value);
  return queryAliases.get(raw) || raw;
}

function labelPt(value) {
  const raw = String(value || "").trim();
  return labelMap.get(raw.toLowerCase()) || raw || "não informado";
}

function toTitlePt(value) {
  return String(value || "")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

function exerciseNamePt(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "Exercício sem nome";
  if (exactExerciseNames.has(raw)) return exactExerciseNames.get(raw);

  let translated = ` ${raw.replace(/[()]/g, " ")} `;

  for (const [from, to] of phraseTranslations) {
    translated = translated.replaceAll(` ${from} `, ` ${to} `);
  }

  return toTitlePt(translated);
}

function toPublicExercise(record, includeDetails = false) {
  const base = {
    source_id: record.source_id,
    slug: record.slug,
    nome: exerciseNamePt(record.name),
    categoria: labelPt(record.category),
    parte_do_corpo: labelPt(record.body_part),
    equipamento: labelPt(record.equipment),
    foco: labelPt(record.target),
    musculo_principal: labelPt(record.primary_muscle),
    grupo_muscular: labelPt(record.muscle_group),
    musculos_auxiliares: (record.secondary_muscles || []).map(labelPt),
    politica_midia: "uso_textual_autorizado",
    disponivel_para_treino: true,
  };

  if (!includeDetails) return base;

  return {
    ...base,
    instrucoes: record.instructions_pt_br || record.instructions || {},
    etapas: record.instruction_steps || {},
    observacoes_de_seguranca: record.safety_notes || [],
    criado_em: record.created_at,
    normalizado_em: record.normalized_at,
  };
}

function listExercises(url) {
  const catalog = loadCatalog();
  const search = normalizeSearchTerm(url.searchParams.get("search"));
  const bodyPart = normalizeSearchTerm(url.searchParams.get("body_part"));
  const equipment = normalizeSearchTerm(url.searchParams.get("equipment"));
  const target = normalizeSearchTerm(url.searchParams.get("target"));
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get("limit") || "50", 10) || 50, 1), 200);
  const offset = Math.max(Number.parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0);

  const filtered = catalog.filter((record) => {
    if (bodyPart && normalizeText(record.body_part) !== bodyPart) return false;
    if (equipment && normalizeText(record.equipment) !== equipment) return false;
    if (target && normalizeText(record.target) !== target) return false;
    if (search && !normalizeText(record.search_text || record.name).includes(search)) return false;
    return true;
  });

  const items = filtered.slice(offset, offset + limit).map((record) => toPublicExercise(record));

  return {
    items,
    total: filtered.length,
    limite: limit,
    deslocamento: offset,
    proximo_deslocamento: offset + items.length < filtered.length ? offset + items.length : null,
    politica_midia: "uso_textual_autorizado",
  };
}

function getExerciseBySlug(slug) {
  const catalog = loadCatalog();
  const record = catalog.find((item) => item.slug === slug || item.source_id === slug);
  return record ? toPublicExercise(record, true) : null;
}

function pickExercises(searchTerm, limit = 3) {
  const catalog = loadCatalog();
  const normalized = normalizeSearchTerm(searchTerm);
  const filtered = catalog.filter((record) => normalizeText(record.search_text || record.name).includes(normalized));
  return filtered.slice(0, limit).map((record) => toPublicExercise(record));
}

function sanitizeText(value, maxLength = 120) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function numberInRange(value, fallback, min, max) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(number, min), max);
}

function readRequestBody(req, limitBytes = 64 * 1024) {
  return new Promise((resolveBody, rejectBody) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > limitBytes) {
        rejectBody(new Error("Payload acima do limite permitido."));
        req.destroy();
      }
    });
    req.on("end", () => resolveBody(body));
    req.on("error", rejectBody);
  });
}

async function readJsonBody(req) {
  const body = await readRequestBody(req);
  if (!body.trim()) return {};
  try {
    return JSON.parse(body);
  } catch {
    const error = new Error("JSON inválido.");
    error.statusCode = 400;
    throw error;
  }
}

function readJsonArray(path) {
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf-8");
  const parsed = JSON.parse(raw || "[]");
  return Array.isArray(parsed) ? parsed : [];
}

function writeJsonArray(path, records, mode = 0o640) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o750 });
  writeFileSync(path, `${JSON.stringify(records, null, 2)}\n`, { mode });
}

function readMvpRecords() {
  return persistenceAdapter.readArray("studentsAndWorkouts");
}

function writeMvpRecords(records) {
  persistenceAdapter.writeArray("studentsAndWorkouts", records);
}

function readCheckins() {
  return persistenceAdapter.readArray("checkins");
}

function writeCheckins(records) {
  persistenceAdapter.writeArray("checkins", records);
}

function readProfessorReviews() {
  return persistenceAdapter.readArray("professorReviews");
}

function writeProfessorReviews(records) {
  persistenceAdapter.writeArray("professorReviews", records);
}

function buildWorkoutBlocks({ objetivo, foco, modalidade, diasSemana }) {
  const objetivoTemplate = objetivoTemplates[objetivo] || objetivoTemplates.saude;
  const focoQueries = focoTemplates[foco] || focoTemplates.completo;
  const baseQueries = [...new Set([...focoQueries, ...objetivoTemplate.buscas])];
  const totalDias = numberInRange(diasSemana, 3, 1, 6);

  return Array.from({ length: totalDias }, (_, index) => {
    const query = baseQueries[index % baseQueries.length];
    const isBox = modalidade === "box" || modalidade === "funcional" || foco === "funcional";
    const exercicios = pickExercises(query, 4);

    return {
      dia: `Dia ${index + 1}`,
      foco: isBox && index === 0 ? "técnica, condicionamento e execução segura" : objetivoTemplate.descricao,
      aquecimento: isBox
        ? "8 a 10 minutos de mobilidade, ativação e preparação técnica."
        : "5 a 8 minutos de mobilidade e aquecimento específico.",
      exercicios,
      orientacao: isBox
        ? "Usar escala por nível, controlar intensidade e registrar presença da turma."
        : "Executar com técnica, registrar carga/repetições e ajustar progressão semanalmente.",
    };
  });
}

function createStudentWorkout(input) {
  const alunoNome = sanitizeText(input.aluno_nome || input.nome || "Aluno teste", 80);
  const objetivo = sanitizeText(input.objetivo || "saude", 40);
  const nivel = sanitizeText(input.nivel || "iniciante", 40);
  const modalidade = sanitizeText(input.modalidade || "academia", 40);
  const foco = sanitizeText(input.foco || "completo", 40);
  const diasSemana = numberInRange(input.dias_semana, 3, 1, 6);
  const observacoes = sanitizeText(input.observacoes || "", 360);
  const createdAt = new Date().toISOString();

  if (alunoNome.length < 2) {
    const error = new Error("Informe o nome do aluno com pelo menos 2 caracteres.");
    error.statusCode = 400;
    throw error;
  }

  const record = {
    id: `mvp01-${randomUUID()}`,
    status: "rascunho_validacao",
    criado_em: createdAt,
    atualizado_em: createdAt,
    aluno: {
      nome: alunoNome,
      nivel,
      observacoes,
      aviso_lgpd: "Use somente dados necessários nesta fase. Não cadastre informações sensíveis sem base legal e autorização adequada.",
    },
    treino: {
      objetivo,
      objetivo_nome: objetivoTemplates[objetivo]?.titulo || toTitlePt(objetivo),
      modalidade,
      foco,
      dias_semana: diasSemana,
      blocos: buildWorkoutBlocks({ objetivo, foco, modalidade, diasSemana }),
    },
    proximos_passos: [
      "Professor revisa exercícios e ajusta restrições do aluno.",
      "Aluno executa o treino e registra check-in.",
      "Gestor acompanha frequência, retenção e evolução.",
    ],
  };

  const records = readMvpRecords();
  records.unshift(record);
  writeMvpRecords(records.slice(0, 200));
  return record;
}

async function handleMvpStudentWorkout(req, res, url) {
  if (req.method === "GET") {
    const records = readMvpRecords();
    const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get("limit") || "20", 10) || 20, 1), 50);
    return sendJson(res, 200, {
      items: records.slice(0, limit),
      total: records.length,
      armazenamento: "arquivo_local_mvp",
      politica_lgpd: "validacao_minima_sem_dados_sensiveis_desnecessarios",
    });
  }

  if (req.method === "POST") {
    const input = await readJsonBody(req);
    const record = createStudentWorkout(input);
    return sendJson(res, 201, record);
  }

  return sendMethodNotAllowed(res);
}

function checkinSummary(records) {
  const base = { planejado: 0, em_execucao: 0, concluido: 0 };
  for (const record of records) {
    if (base[record.status] !== undefined) base[record.status] += 1;
  }
  return base;
}

function reviewSummary(records) {
  const base = { em_revisao: 0, ajustes_solicitados: 0, aprovado: 0 };
  for (const record of records) {
    if (base[record.status] !== undefined) base[record.status] += 1;
  }
  return base;
}

function createAuditEvent({ tipo, papel, status, registroId, detalhe = "" }) {
  return {
    id: `aud-${randomUUID()}`,
    tipo,
    papel,
    status,
    registro_id: registroId,
    detalhe: sanitizeText(detalhe, 240),
    criado_em: new Date().toISOString(),
    lgpd: "evento_minimo_sem_documento_telefone_email_foto_medida_ou_dado_de_saude",
  };
}

function createWorkoutCheckin(input) {
  const alunoNome = sanitizeText(input.aluno_nome || input.nome || "Aluno teste", 80);
  const treinoId = sanitizeText(input.treino_id || input.workout_id || "treino-manual", 120);
  const diaTreino = sanitizeText(input.dia_treino || input.dia || "Dia 1", 40);
  const status = sanitizeText(input.status || "planejado", 40);
  const papel = sanitizeText(input.papel || "professor", 40);
  const percepcaoEsforco = numberInRange(input.percepcao_esforco, 5, 1, 10);
  const duracaoMinutos = numberInRange(input.duracao_minutos, 45, 5, 240);
  const observacoes = sanitizeText(input.observacoes || "", 500);
  const createdAt = new Date().toISOString();

  if (alunoNome.length < 2) {
    const error = new Error("Informe o nome do aluno com pelo menos 2 caracteres.");
    error.statusCode = 400;
    throw error;
  }

  if (!allowedCheckinStatus.has(status)) {
    const error = new Error("Status inválido. Use planejado, em_execucao ou concluido.");
    error.statusCode = 400;
    throw error;
  }

  if (!allowedRoles.has(papel)) {
    const error = new Error("Papel inválido. Use gestor, professor ou aluno.");
    error.statusCode = 400;
    throw error;
  }

  const sourceWorkout = readMvpRecords().find((record) => record.id === treinoId);
  const registroId = `mvp02-${randomUUID()}`;
  const record = {
    id: registroId,
    treino_id: treinoId,
    aluno: {
      nome: sourceWorkout?.aluno?.nome || alunoNome,
      nivel: sourceWorkout?.aluno?.nivel || sanitizeText(input.nivel || "não informado", 40),
    },
    treino: {
      objetivo: sourceWorkout?.treino?.objetivo_nome || sanitizeText(input.objetivo || "não informado", 80),
      modalidade: sourceWorkout?.treino?.modalidade || sanitizeText(input.modalidade || "não informado", 80),
      dia: diaTreino,
    },
    status,
    percepcao_esforco: percepcaoEsforco,
    duracao_minutos: duracaoMinutos,
    observacoes,
    criado_por: papel,
    criado_em: createdAt,
    atualizado_em: createdAt,
    auditoria_lgpd: [
      createAuditEvent({ tipo: "checkin_criado", papel, status, registroId }),
    ],
    proximas_acoes: [
      "Professor confere execução e ajusta o próximo treino.",
      "Aluno registra conclusão, esforço percebido e observações simples.",
      "Gestor acompanha frequência e aderência sem expor dados sensíveis.",
    ],
  };

  const records = readCheckins();
  records.unshift(record);
  writeCheckins(records.slice(0, 500));
  return record;
}

function updateWorkoutCheckin(id, input) {
  const records = readCheckins();
  const index = records.findIndex((record) => record.id === id);
  if (index < 0) return null;

  const current = records[index];
  const status = sanitizeText(input.status || current.status, 40);
  const papel = sanitizeText(input.papel || "professor", 40);

  if (!allowedCheckinStatus.has(status)) {
    const error = new Error("Status inválido. Use planejado, em_execucao ou concluido.");
    error.statusCode = 400;
    throw error;
  }

  if (!allowedRoles.has(papel)) {
    const error = new Error("Papel inválido. Use gestor, professor ou aluno.");
    error.statusCode = 400;
    throw error;
  }

  const updated = {
    ...current,
    status,
    percepcao_esforco: input.percepcao_esforco ? numberInRange(input.percepcao_esforco, current.percepcao_esforco, 1, 10) : current.percepcao_esforco,
    duracao_minutos: input.duracao_minutos ? numberInRange(input.duracao_minutos, current.duracao_minutos, 5, 240) : current.duracao_minutos,
    observacoes: input.observacoes !== undefined ? sanitizeText(input.observacoes, 500) : current.observacoes,
    atualizado_em: new Date().toISOString(),
    auditoria_lgpd: [
      ...(current.auditoria_lgpd || []),
      createAuditEvent({ tipo: "checkin_status_atualizado", papel, status, registroId: current.id }),
    ],
  };

  records[index] = updated;
  writeCheckins(records);
  return updated;
}

function listCheckins(url) {
  const records = readCheckins();
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get("limit") || "20", 10) || 20, 1), 50);
  const status = sanitizeText(url.searchParams.get("status") || "", 40);
  const aluno = normalizeText(url.searchParams.get("aluno") || url.searchParams.get("aluno_nome") || "");

  const filtered = records.filter((record) => {
    if (status && record.status !== status) return false;
    if (aluno && !normalizeText(record.aluno?.nome).includes(aluno)) return false;
    return true;
  });

  return {
    items: filtered.slice(0, limit),
    total: filtered.length,
    resumo: checkinSummary(records),
    papeis: ["gestor", "professor", "aluno"],
    status_permitidos: [...allowedCheckinStatus],
    politica_lgpd: "auditoria_minima_sem_dados_sensiveis_desnecessarios",
  };
}

async function handleMvp02Checkins(req, res, url) {
  if (req.method === "GET") {
    return sendJson(res, 200, listCheckins(url));
  }

  if (req.method === "POST") {
    const input = await readJsonBody(req);
    return sendJson(res, 201, createWorkoutCheckin(input));
  }

  return sendMethodNotAllowed(res);
}

function findWorkoutDraft(treinoId, alunoNome) {
  const records = readMvpRecords();
  if (treinoId) {
    return records.find((record) => record.id === treinoId) || null;
  }

  const normalizedAluno = normalizeText(alunoNome);
  if (normalizedAluno) {
    const byStudent = records.find((record) => normalizeText(record.aluno?.nome).includes(normalizedAluno));
    if (byStudent) return byStudent;
  }

  return records[0] || null;
}

function createProfessorReview(input) {
  const papel = sanitizeText(input.papel || "professor", 40);
  if (!allowedRoles.has(papel) || papel === "aluno") {
    const error = new Error("A revisão do MVP-03 deve ser criada por professor ou gestor.");
    error.statusCode = 400;
    throw error;
  }

  const treinoId = sanitizeText(input.treino_id || "", 140);
  const alunoNome = sanitizeText(input.aluno_nome || "", 80);
  const sourceWorkout = findWorkoutDraft(treinoId, alunoNome);

  if (!sourceWorkout) {
    const error = new Error("Nenhum rascunho de treino encontrado. Crie primeiro um aluno + treino no MVP-01.");
    error.statusCode = 404;
    throw error;
  }

  const createdAt = new Date().toISOString();
  const registroId = `mvp03-${randomUUID()}`;
  const record = {
    id: registroId,
    treino_id: sourceWorkout.id,
    status: "em_revisao",
    aluno: {
      nome: sourceWorkout.aluno?.nome || alunoNome || "Aluno teste",
      nivel: sourceWorkout.aluno?.nivel || "não informado",
    },
    treino: {
      objetivo: sourceWorkout.treino?.objetivo_nome || sourceWorkout.treino?.objetivo || "não informado",
      modalidade: sourceWorkout.treino?.modalidade || "não informado",
      foco: sourceWorkout.treino?.foco || "não informado",
      dias_semana: sourceWorkout.treino?.dias_semana || 0,
      blocos: JSON.parse(JSON.stringify(sourceWorkout.treino?.blocos || [])),
    },
    professor: {
      nome: sanitizeText(input.professor_nome || "Professor responsável", 80),
      papel,
    },
    revisao: {
      observacoes: sanitizeText(input.observacoes || "Revisar exercícios, volume e restrições antes de liberar para o aluno.", 500),
      ajustes: [],
      aprovado_em: null,
      aprovado_por: null,
    },
    criado_em: createdAt,
    atualizado_em: createdAt,
    auditoria_lgpd: [
      createAuditEvent({ tipo: "revisao_criada", papel, status: "em_revisao", registroId, detalhe: `treino_id=${sourceWorkout.id}` }),
    ],
    politica_lgpd: "validacao_minima_sem_dados_sensiveis_desnecessarios",
  };

  const records = readProfessorReviews();
  records.unshift(record);
  writeProfessorReviews(records.slice(0, 500));
  return record;
}

function replaceExerciseInReview(id, input) {
  const records = readProfessorReviews();
  const index = records.findIndex((record) => record.id === id);
  if (index < 0) return null;

  const current = records[index];
  const diaIndex = numberInRange(input.dia_index ?? input.dia, 0, 0, Math.max((current.treino?.blocos || []).length - 1, 0));
  const exercicioIndex = numberInRange(input.exercicio_index ?? input.posicao, 0, 0, 20);
  const busca = sanitizeText(input.busca || input.search || "agachamento", 80);
  const papel = sanitizeText(input.papel || "professor", 40);

  if (!allowedRoles.has(papel) || papel === "aluno") {
    const error = new Error("Somente professor ou gestor pode alterar exercício nesta fase.");
    error.statusCode = 400;
    throw error;
  }

  const replacement = pickExercises(busca, 1)[0];
  if (!replacement) {
    const error = new Error("Nenhum exercício encontrado para a busca informada.");
    error.statusCode = 404;
    throw error;
  }

  const blocos = JSON.parse(JSON.stringify(current.treino?.blocos || []));
  if (!blocos[diaIndex]) {
    const error = new Error("Dia do treino não encontrado.");
    error.statusCode = 400;
    throw error;
  }

  const exercicios = Array.isArray(blocos[diaIndex].exercicios) ? blocos[diaIndex].exercicios : [];
  const anterior = exercicios[exercicioIndex] || null;
  exercicios[exercicioIndex] = replacement;
  blocos[diaIndex].exercicios = exercicios;

  const ajuste = {
    id: `ajuste-${randomUUID()}`,
    tipo: "substituicao_exercicio",
    dia: blocos[diaIndex].dia || `Dia ${diaIndex + 1}`,
    posicao: exercicioIndex + 1,
    anterior: anterior ? anterior.nome : "posição vazia",
    novo: replacement.nome,
    busca,
    criado_por: papel,
    criado_em: new Date().toISOString(),
  };

  const updated = {
    ...current,
    status: "ajustes_solicitados",
    atualizado_em: new Date().toISOString(),
    treino: {
      ...current.treino,
      blocos,
    },
    revisao: {
      ...current.revisao,
      ajustes: [...(current.revisao?.ajustes || []), ajuste],
    },
    auditoria_lgpd: [
      ...(current.auditoria_lgpd || []),
      createAuditEvent({
        tipo: "exercicio_alterado",
        papel,
        status: "ajustes_solicitados",
        registroId: current.id,
        detalhe: `${ajuste.anterior} -> ${ajuste.novo}`,
      }),
    ],
  };

  records[index] = updated;
  writeProfessorReviews(records);
  return updated;
}

function approveProfessorReview(id, input) {
  const records = readProfessorReviews();
  const index = records.findIndex((record) => record.id === id);
  if (index < 0) return null;

  const current = records[index];
  const papel = sanitizeText(input.papel || "professor", 40);
  if (!allowedRoles.has(papel) || papel === "aluno") {
    const error = new Error("Somente professor ou gestor pode aprovar treino nesta fase.");
    error.statusCode = 400;
    throw error;
  }

  const approvedAt = new Date().toISOString();
  const updated = {
    ...current,
    status: "aprovado",
    atualizado_em: approvedAt,
    revisao: {
      ...current.revisao,
      aprovado_em: approvedAt,
      aprovado_por: papel,
      observacoes: sanitizeText(input.observacoes || current.revisao?.observacoes || "Treino aprovado para validação.", 500),
    },
    auditoria_lgpd: [
      ...(current.auditoria_lgpd || []),
      createAuditEvent({ tipo: "treino_aprovado", papel, status: "aprovado", registroId: current.id }),
    ],
  };

  records[index] = updated;
  writeProfessorReviews(records);
  return updated;
}

function listProfessorReviews(url) {
  const records = readProfessorReviews();
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get("limit") || "20", 10) || 20, 1), 50);
  const aluno = normalizeText(url.searchParams.get("aluno") || url.searchParams.get("aluno_nome") || "");
  const status = sanitizeText(url.searchParams.get("status") || "", 40);

  const filtered = records.filter((record) => {
    if (status && record.status !== status) return false;
    if (aluno && !normalizeText(record.aluno?.nome).includes(aluno)) return false;
    return true;
  });

  return {
    items: filtered.slice(0, limit),
    total: filtered.length,
    resumo: reviewSummary(records),
    status_permitidos: [...allowedReviewStatus],
    papeis: ["gestor", "professor"],
    politica_lgpd: "auditoria_por_acao_sem_dados_sensiveis_desnecessarios",
  };
}

async function handleMvp03Reviews(req, res, url) {
  if (req.method === "GET") {
    return sendJson(res, 200, listProfessorReviews(url));
  }

  if (req.method === "POST") {
    const input = await readJsonBody(req);
    return sendJson(res, 201, createProfessorReview(input));
  }

  return sendMethodNotAllowed(res);
}

function getProfessorContext() {
  const workouts = readMvpRecords();
  const reviews = readProfessorReviews();
  const checkins = readCheckins();

  return {
    alunos: workouts.slice(0, 50).map((record) => ({
      treino_id: record.id,
      nome: record.aluno?.nome || "Aluno sem nome",
      nivel: record.aluno?.nivel || "não informado",
      objetivo: record.treino?.objetivo_nome || record.treino?.objetivo || "não informado",
      modalidade: record.treino?.modalidade || "não informado",
      status: record.status,
      criado_em: record.criado_em,
    })),
    reviews: reviews.slice(0, 20),
    checkins: checkins.slice(0, 20),
    resumo: {
      alunos: workouts.length,
      revisoes: reviews.length,
      checkins: checkins.length,
      revisoes_por_status: reviewSummary(reviews),
    },
    politica_lgpd: "professor_visualiza_apenas_dados_minimos_do_mvp",
  };
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const softAccessContext = createAccessContext(req, process.env);
    const signedAccessContext = sessionManager.resolveAccessContext(req);
    const accessContext = signedAccessContext || softAccessContext;
    const routeDecision = sessionManager.authorizeRoute(accessContext, url.pathname, req.method);
    if (!routeDecision.allowed) return sendJson(res, routeDecision.statusCode, routeDecision.response);

    if (url.pathname === "/api/health") {
      const persistence = createServerPersistenceHealth(persistenceAdapter);
      const access = createAccessHealth(accessContext);
      const catalogExists = existsSync(catalogPath);
      const checkins = readCheckins();
      const reviews = readProfessorReviews();
      return sendJson(res, 200, {
        ok: true,
        servico: "fitcore-api",
        api: "api-propria",
        persistence,
        access,
        mvp_09: {
          persistence_adapter: true,
          active_store: persistence.active_store,
          fallback_seguro: persistence.fallback_seguro,
        },
        mvp_10: {
          postgres_store_controlado: true,
          active_store: persistence.active_store,
          database_configured: persistence.database_configured,
          postgres_ready: Boolean(persistence.postgres?.ready),
          activation_requested: Boolean(persistence.postgres?.activation_requested),
          fallback_seguro: persistence.fallback_seguro,
        },
        mvp_14: {
          auth_rbac_foundation: true,
          tenant_slug: access.tenant_slug,
          actor_role: access.actor_role,
          enforcement: access.enforcement,
          login_real: false,
        },
        mvp_15: {
          signed_session: sessionManager.signedMode,
          tenant_slug: accessContext.tenant_slug,
          actor_role: accessContext.actor_role,
          session_signed: Boolean(accessContext.session_signed),
          role_from_db: Boolean(accessContext.role_from_db),
          headers_trusted: Boolean(accessContext.headers_trusted),
          rollback_soft: "bash infra/scripts/rollback-mvp-15-soft-auth.sh",
        },
        catalogo_existe: catalogExists,
        catalogo_carregado: Boolean(catalogCache),
        catalogo_carregado_em: catalogLoadedAt,
        mvp_01: {
          aluno_treino: true,
          registros: readMvpRecords().length,
        },
        mvp_02: {
          checkin_treino: true,
          registros: checkins.length,
          resumo: checkinSummary(checkins),
        },
        mvp_03: {
          painel_professor: true,
          registros: reviews.length,
          resumo: reviewSummary(reviews),
        },
        motor_fitness_interno: wgerInternalUrl,
        politica_midia: "uso_textual_autorizado",
      });
    }

    if (url.pathname === "/api/mvp-09/persistence") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      return sendJson(res, 200, createServerPersistenceHealth(persistenceAdapter));
    }

    if (url.pathname === "/api/mvp-10/postgres-store") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const persistence = createServerPersistenceHealth(persistenceAdapter);
      return sendJson(res, 200, {
        ok: true,
        mvp: "MVP-10 PostgresStore controlado",
        postgres_store_controlado: true,
        adapter: persistence.adapter,
        selected_store: persistence.selected_store,
        active_store: persistence.active_store,
        requested_store: persistence.requested_store,
        database_configured: persistence.database_configured,
        fallback_seguro: persistence.fallback_seguro,
        postgres: persistence.postgres,
        resources: persistence.resources,
        stores: persistence.stores,
        policy: persistence.policy,
        reason: persistence.reason,
      });
    }

    if (url.pathname === "/api/mvp-14/access-context") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      return sendJson(res, 200, createAccessHealth(accessContext));
    }


    if (url.pathname === "/api/mvp-15/session") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      return sendJson(res, 200, sessionManager.publicHealth(req, accessContext));
    }

    if (url.pathname === "/api/mvp-15/session/login") {
      if (req.method !== "POST") return sendMethodNotAllowed(res);
      const input = await readJsonBody(req);
      const created = sessionManager.createSession(input);
      return sendJson(res, 201, { ok: true, mvp: "MVP-15 Signed Session RBAC", login: true, session: created.session }, { "set-cookie": created.cookie });
    }

    if (url.pathname === "/api/mvp-15/session/logout") {
      if (req.method !== "POST") return sendMethodNotAllowed(res);
      const result = sessionManager.logout(req);
      return sendJson(res, 200, { ok: true, mvp: "MVP-15 Signed Session RBAC", logout: true }, { "set-cookie": result.cookie });
    }

    if (url.pathname === "/api/exercises") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      return sendJson(res, 200, listExercises(url));
    }

    if (url.pathname === "/api/cross-training/templates") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      return sendJson(res, 200, {
        items: crossTrainingTemplates,
        total: crossTrainingTemplates.length,
      });
    }

    if (url.pathname === "/api/mvp-01/status") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      return sendJson(res, 200, {
        ok: true,
        mvp: "MVP-01 Aluno + Treino",
        aluno_treino: true,
        registros: readMvpRecords().length,
        endpoints: [
          "GET /api/mvp-01/status",
          "GET /api/mvp-01/aluno-treino",
          "POST /api/mvp-01/aluno-treino",
          "GET /api/cross-training/templates",
        ],
        politica_lgpd: "coletar apenas dados mínimos para validação",
      });
    }

    if (url.pathname === "/api/mvp-01/aluno-treino") {
      return handleMvpStudentWorkout(req, res, url);
    }

    if (url.pathname === "/api/mvp-02/status") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const checkins = readCheckins();
      return sendJson(res, 200, {
        ok: true,
        mvp: "MVP-02 Check-in do Treino",
        checkin_treino: true,
        registros: checkins.length,
        resumo: checkinSummary(checkins),
        status_permitidos: [...allowedCheckinStatus],
        papeis: ["gestor", "professor", "aluno"],
        endpoints: [
          "GET /api/mvp-02/status",
          "GET /api/mvp-02/checkins",
          "POST /api/mvp-02/checkins",
          "GET /api/mvp-02/checkins/:id",
          "PATCH /api/mvp-02/checkins/:id/status",
        ],
        politica_lgpd: "auditoria mínima, sem documento, telefone, e-mail, foto, medidas ou dados médicos nesta fase",
      });
    }

    if (url.pathname === "/api/mvp-02/checkins") {
      return handleMvp02Checkins(req, res, url);
    }

    if (url.pathname === "/api/mvp-03/status") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const reviews = readProfessorReviews();
      return sendJson(res, 200, {
        ok: true,
        mvp: "MVP-03 Painel do Professor",
        painel_professor: true,
        registros: reviews.length,
        resumo: reviewSummary(reviews),
        status_permitidos: [...allowedReviewStatus],
        papeis: ["gestor", "professor"],
        endpoints: [
          "GET /api/mvp-03/status",
          "GET /api/mvp-03/professor/contexto",
          "GET /api/mvp-03/professor/reviews",
          "POST /api/mvp-03/professor/reviews",
          "GET /api/mvp-03/professor/reviews/:id",
          "PATCH /api/mvp-03/professor/reviews/:id/exercises",
          "PATCH /api/mvp-03/professor/reviews/:id/approve",
        ],
        politica_lgpd: "professor visualiza e altera somente dados mínimos do MVP",
      });
    }

    if (url.pathname === "/api/mvp-03/professor/contexto") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      return sendJson(res, 200, getProfessorContext());
    }

    if (url.pathname === "/api/mvp-03/professor/reviews") {
      return handleMvp03Reviews(req, res, url);
    }

    const mvp03ExerciseMatch = url.pathname.match(/^\/api\/mvp-03\/professor\/reviews\/([^/]+)\/exercises$/);
    if (mvp03ExerciseMatch) {
      if (req.method !== "PATCH" && req.method !== "POST") return sendMethodNotAllowed(res);
      const input = await readJsonBody(req);
      const item = replaceExerciseInReview(decodeURIComponent(mvp03ExerciseMatch[1]), input);
      if (!item) return sendJson(res, 404, { erro: "revisao_nao_encontrada" });
      return sendJson(res, 200, item);
    }

    const mvp03ApproveMatch = url.pathname.match(/^\/api\/mvp-03\/professor\/reviews\/([^/]+)\/approve$/);
    if (mvp03ApproveMatch) {
      if (req.method !== "PATCH" && req.method !== "POST") return sendMethodNotAllowed(res);
      const input = await readJsonBody(req);
      const item = approveProfessorReview(decodeURIComponent(mvp03ApproveMatch[1]), input);
      if (!item) return sendJson(res, 404, { erro: "revisao_nao_encontrada" });
      return sendJson(res, 200, item);
    }

    const mvp03ReviewMatch = url.pathname.match(/^\/api\/mvp-03\/professor\/reviews\/([^/]+)$/);
    if (mvp03ReviewMatch) {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const id = decodeURIComponent(mvp03ReviewMatch[1]);
      const item = readProfessorReviews().find((record) => record.id === id);
      if (!item) return sendJson(res, 404, { erro: "revisao_nao_encontrada" });
      return sendJson(res, 200, item);
    }

    const checkinStatusMatch = url.pathname.match(/^\/api\/mvp-02\/checkins\/([^/]+)\/status$/);
    if (checkinStatusMatch) {
      if (req.method !== "PATCH" && req.method !== "POST") return sendMethodNotAllowed(res);
      const input = await readJsonBody(req);
      const item = updateWorkoutCheckin(decodeURIComponent(checkinStatusMatch[1]), input);
      if (!item) return sendJson(res, 404, { erro: "checkin_nao_encontrado" });
      return sendJson(res, 200, item);
    }

    const checkinMatch = url.pathname.match(/^\/api\/mvp-02\/checkins\/([^/]+)$/);
    if (checkinMatch) {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const id = decodeURIComponent(checkinMatch[1]);
      const item = readCheckins().find((record) => record.id === id);
      if (!item) return sendJson(res, 404, { erro: "checkin_nao_encontrado" });
      return sendJson(res, 200, item);
    }

    const mvpMatch = url.pathname.match(/^\/api\/mvp-01\/aluno-treino\/([^/]+)$/);
    if (mvpMatch) {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const id = decodeURIComponent(mvpMatch[1]);
      const item = readMvpRecords().find((record) => record.id === id);
      if (!item) return sendJson(res, 404, { erro: "registro_nao_encontrado" });
      return sendJson(res, 200, item);
    }

    const match = url.pathname.match(/^\/api\/exercises\/([^/]+)$/);
    if (match) {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const item = getExerciseBySlug(decodeURIComponent(match[1]));
      if (!item) return sendJson(res, 404, { erro: "exercicio_nao_encontrado" });
      return sendJson(res, 200, item);
    }

    return sendNotFound(res);
  } catch (error) {
    return sendJson(res, error.statusCode || 500, {
      erro: "fitcore_api_error",
      mensagem: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(port, host, () => {
  console.log(`FitCore API ouvindo em http://${host}:${port}`);
});
