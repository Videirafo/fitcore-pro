#!/usr/bin/env node

/**
 * FITCORE PRO - API propria inicial
 *
 * API HTTP sem dependencias externas para validar a arquitetura:
 * Tela propria FitCore -> API propria -> catalogo normalizado + motor fitness interno.
 */

import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const port = Number.parseInt(process.env.FITCORE_API_PORT || "8091", 10);
const host = process.env.FITCORE_API_HOST || "127.0.0.1";
const catalogPath = resolve(root, "storage/exercises-dataset/exercises.normalized.json");
const wgerInternalUrl = process.env.FITCORE_WGER_INTERNAL_URL || "http://127.0.0.1:8088";

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
  ["quads", "quadríceps"],
  ["glutes", "glúteos"],
  ["hamstrings", "posterior de coxa"],
  ["abs", "abdômen"],
  ["calves", "panturrilhas"],
  ["biceps", "bíceps"],
  ["triceps", "tríceps"],
  ["delts", "deltoides"],
  ["forearms", "antebraços"],
]);

const exactExerciseNames = new Map([
  ["barbell bench front squat", "Agachamento frontal com barra no banco"],
  ["barbell bench squat", "Agachamento com barra no banco"],
  ["barbell clean-grip front squat", "Agachamento frontal com pegada clean"],
  ["barbell front chest squat", "Agachamento frontal com barra no peito"],
  ["barbell front squat", "Agachamento frontal com barra"],
  ["barbell full squat", "Agachamento completo com barra"],
  ["assisted chest dip (kneeling)", "Mergulho para peito assistido ajoelhado"],
  ["alternate lateral pulldown", "Puxada lateral alternada"],
  ["assisted hanging knee raise with throw down", "Elevação de joelhos suspenso com auxílio"],
]);

const phraseTranslations = [
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
  ["front squat", "agachamento frontal"],
  ["full squat", "agachamento completo"],
  ["squat", "agachamento"],
  ["lunge", "avanço"],
  ["deadlift", "levantamento terra"],
  ["bench press", "supino"],
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

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-fitcore-api": "owned-api",
  });
  res.end(body);
}

function sendNotFound(res) {
  sendJson(res, 404, {
    erro: "nao_encontrado",
    mensagem: "Endpoint nao encontrado.",
  });
}

function loadCatalog() {
  if (catalogCache) return catalogCache;

  if (!existsSync(catalogPath)) {
    throw new Error(`Catalogo normalizado nao encontrado em ${catalogPath}. Rode: npm run exercises:sync && npm run exercises:normalize`);
  }

  const raw = readFileSync(catalogPath, "utf-8");
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error("Catalogo normalizado invalido: esperado array JSON.");
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
    nome_original: record.name,
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
    instrucoes_en: record.instructions_en,
    instrucoes_pt_br: record.instructions_pt_br,
    instrucoes: record.instructions || {},
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

const server = createServer((req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (url.pathname === "/api/health") {
      const catalogExists = existsSync(catalogPath);
      return sendJson(res, 200, {
        ok: true,
        servico: "fitcore-api",
        api: "api-propria",
        catalogo_existe: catalogExists,
        catalogo_carregado: Boolean(catalogCache),
        catalogo_carregado_em: catalogLoadedAt,
        motor_fitness_interno: wgerInternalUrl,
        politica_midia: "uso_textual_autorizado",
      });
    }

    if (url.pathname === "/api/exercises") {
      return sendJson(res, 200, listExercises(url));
    }

    if (url.pathname === "/api/cross-training/templates") {
      return sendJson(res, 200, {
        items: crossTrainingTemplates,
        total: crossTrainingTemplates.length,
      });
    }

    const match = url.pathname.match(/^\/api\/exercises\/([^/]+)$/);
    if (match) {
      const item = getExerciseBySlug(decodeURIComponent(match[1]));
      if (!item) return sendJson(res, 404, { erro: "exercicio_nao_encontrado" });
      return sendJson(res, 200, item);
    }

    return sendNotFound(res);
  } catch (error) {
    return sendJson(res, 500, {
      erro: "fitcore_api_error",
      mensagem: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(port, host, () => {
  console.log(`FitCore API ouvindo em http://${host}:${port}`);
});
