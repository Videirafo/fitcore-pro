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
import { createRoleNavigation, recordNavigationAudit } from "./security/navigation-rbac.mjs";
import { createInviteUserManager } from "./security/invite-users.mjs";
import { createCredentialAuthManager } from "./security/credential-auth.mjs";
import { createAuthHardeningManager } from "./security/auth-hardening.mjs";
import { createTenantOnboardingManager } from "./security/tenant-onboarding.mjs";
import { createTenantUserManagement } from "./security/tenant-user-management.mjs";
import { createStudentManagement } from "./security/student-management.mjs";
import { createWorkoutPrescriptionManager } from "./security/workout-prescription.mjs";
import { createWorkoutBuilderManager } from "./security/workout-builder-manager.mjs";
import { createWorkoutExecutionManager, buildWorkoutActionBinding, WORKOUT_ACTION_IDS } from "./security/workout-execution.mjs";
import { createExecutionKernelRuntime, resolveExecutionIdempotencyKey } from "./security/execution-kernel-runtime.mjs";
import { buildExecutionNextBestAction } from "./security/execution-next-best-action.mjs";
import { attachDecisionEvidence, outcomeForExecutionAction, terminalDecisionState } from "./security/decision-intelligence.mjs";
import { createWorkoutSetSyncManager } from "./security/workout-set-sync.mjs";
import { createStudentEvolutionManager } from "./security/student-evolution.mjs";
import { createAthlete360Manager } from "./security/athlete-360.mjs";
import { createAssessmentManager } from "./security/assessments-anamnesis.mjs";
import { createAgentAssistantManager } from "./security/agent-assistant.mjs";
import { createOpenSourceCapabilityManager } from "./security/open-source-capabilities.mjs";
import { createEvidenceCoachManager } from "./security/evidence-coach.mjs";
import { createGuidedSetupManager } from "./security/guided-setup.mjs";
import { createRoleDashboardManager } from "./security/role-dashboard.mjs";
import { createPlatformOwnerManager } from "./security/platform-owner.mjs";

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
const inviteUserManager = createInviteUserManager(process.env, sessionManager);
const credentialAuthManager = createCredentialAuthManager(process.env, sessionManager);
const authHardeningManager = createAuthHardeningManager(process.env, sessionManager);
const tenantOnboardingManager = createTenantOnboardingManager(process.env, sessionManager);
const tenantUserManagement = createTenantUserManagement(process.env, sessionManager);
const studentManagement = createStudentManagement(process.env);
const workoutPrescriptionManager = createWorkoutPrescriptionManager(process.env);
const workoutBuilderManager = createWorkoutBuilderManager(process.env);
const executionKernelRuntime = createExecutionKernelRuntime(process.env);
const workoutExecutionManager = createWorkoutExecutionManager(process.env, { executionKernel: executionKernelRuntime });
function executionProposalId(req) {
  const value = String(req?.headers?.["x-fitcore-proposal-id"] || "").trim();
  if (!value) return "";
  if (!/^nba_[0-9a-f]{32}$/.test(value)) {
    const error = new Error("execution_decision_invalid");
    error.statusCode = 400;
    throw error;
  }
  return value;
}
function validateExecutionDecision(context, req, actionId, resourceId) {
  const proposalId = executionProposalId(req);
  if (!proposalId) return "";
  const decision = executionKernelRuntime.validateDecision(context, { proposalId, actionId, resourceId });
  if (decision?.state === "accepted") {
    executionKernelRuntime.transitionDecision(context, {
      proposalId,
      state: "executing",
      reasonCode: "accepted_for_execution",
    });
  }
  return proposalId;
}
function linkExecutionDecision(context, proposalId, result, actionId) {
  if (!proposalId || !result?.execution_kernel) return;
  const succeeded = result.execution_kernel.state === "succeeded";
  executionKernelRuntime.transitionDecision(context, {
    proposalId,
    state: succeeded ? "settled" : "failed",
    executionId: result.execution_kernel.execution_id || null,
    traceId: result.execution_kernel.trace_id || null,
    reasonCode: succeeded ? "execution_settled" : "execution_failed",
  });
  const outcome = outcomeForExecutionAction(actionId, succeeded);
  executionKernelRuntime.recordDecisionOutcome(context, {
    proposalId,
    outcomeCode: outcome.outcome_code,
    metricName: outcome.metric_name,
    metricValue: outcome.metric_value,
    windowHours: outcome.window_hours,
  });
}
function executeDecisionBound(context, proposalId, actionId, execute) {
  try {
    const result = execute();
    linkExecutionDecision(context, proposalId, result, actionId);
    return result;
  } catch (error) {
    if (proposalId) {
      try {
        executionKernelRuntime.transitionDecision(context, {
          proposalId,
          state: "failed",
          reasonCode: "execution_threw",
        });
        const outcome = outcomeForExecutionAction(actionId, false);
        executionKernelRuntime.recordDecisionOutcome(context, {
          proposalId,
          outcomeCode: outcome.outcome_code,
          metricName: outcome.metric_name,
          metricValue: outcome.metric_value,
          windowHours: outcome.window_hours,
        });
      } catch (decisionError) {
        console.error("[fitcore:decision:failure-link]", {
          proposal_id: proposalId,
          error: decisionError instanceof Error ? decisionError.message : String(decisionError),
        });
      }
    }
    throw error;
  }
}
function runExecutionRemediation(context, remediationId, input = {}, dryRun = false) {
  const actionId = String(input?.action_id || "").trim();
  let binding;
  let effect;
  let reconcile;
  let resourceId;

  if (actionId === WORKOUT_ACTION_IDS.START) {
    binding = buildWorkoutActionBinding(actionId, { input });
    effect = (capability) => workoutExecutionManager.startExecution(context, input, { capability });
    reconcile = ({ executionId }) => workoutExecutionManager.reconcileAction(
      context, actionId, binding, { executionId },
    );
    resourceId = (result) => result.execution?.id;
  } else if (actionId === WORKOUT_ACTION_IDS.EXERCISE_COMPLETE) {
    const executionId = String(input?.execution_id || "");
    const index = Number(input?.index || 0);
    binding = buildWorkoutActionBinding(actionId, { id: executionId, index, input });
    effect = (capability) => workoutExecutionManager.markExerciseDone(
      context, executionId, index, input, { capability },
    );
    reconcile = ({ executionId: kernelExecutionId }) => workoutExecutionManager.reconcileAction(
      context, actionId, binding, { executionId: kernelExecutionId },
    );
    resourceId = (result) => result.execution?.id;
  } else if (actionId === WORKOUT_ACTION_IDS.FINISH) {
    const executionId = String(input?.execution_id || "");
    binding = buildWorkoutActionBinding(actionId, { id: executionId, input });
    effect = (capability) => workoutExecutionManager.finishExecution(
      context, executionId, input, { capability },
    );
    reconcile = ({ executionId: kernelExecutionId }) => workoutExecutionManager.reconcileAction(
      context, actionId, binding, { executionId: kernelExecutionId },
    );
    resourceId = (result) => result.execution?.id;
  } else {
    const error = new Error("execution_remediation_action_invalid");
    error.statusCode = 400;
    throw error;
  }

  const preview = executionKernelRuntime.remediationPreview(context, { remediationId, binding });
  if (preview.action_id !== actionId) {
    const error = new Error("execution_remediation_binding_conflict");
    error.statusCode = 409;
    throw error;
  }
  if (dryRun) {
    return {
      ok: true,
      mvp: "Execution Remediation",
      dry_run: true,
      mutationPerformed: false,
      remediation: preview,
      safety: {
        capability_exposed: false,
        payload_persisted: false,
        side_effect_authority: "execution-kernel",
      },
    };
  }

  return executionKernelRuntime.retryRemediation(context, {
    remediationId,
    binding,
    effect,
    reconcile,
    resourceId,
  });
}

const workoutSetSyncManager = createWorkoutSetSyncManager(process.env);
const studentEvolutionManager = createStudentEvolutionManager(process.env);
const assessmentManager = createAssessmentManager(process.env);
const athlete360Manager = createAthlete360Manager(process.env, assessmentManager);
const agentAssistantManager = createAgentAssistantManager(process.env);
const openSourceCapabilityManager = createOpenSourceCapabilityManager(process.env);
const evidenceCoachManager = createEvidenceCoachManager(process.env, studentEvolutionManager, assessmentManager);
const guidedSetupManager = createGuidedSetupManager(process.env);
const roleDashboardManager = createRoleDashboardManager(process.env, { tenantUserManagement, studentManagement, workoutPrescriptionManager, workoutExecutionManager, studentEvolutionManager, agentAssistantManager, guidedSetupManager });
const platformOwnerManager = createPlatformOwnerManager(process.env, sessionManager);
let currentAccessContext = null;

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
  return persistenceAdapter.readArray("studentsAndWorkouts", currentAccessContext);
}

function writeMvpRecords(records) {
  persistenceAdapter.writeArray("studentsAndWorkouts", records, currentAccessContext);
}

function readCheckins() {
  return persistenceAdapter.readArray("checkins", currentAccessContext);
}

function writeCheckins(records) {
  persistenceAdapter.writeArray("checkins", records, currentAccessContext);
}

function readProfessorReviews() {
  return persistenceAdapter.readArray("professorReviews", currentAccessContext);
}

function writeProfessorReviews(records) {
  persistenceAdapter.writeArray("professorReviews", records, currentAccessContext);
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
    const baseAccessContext = signedAccessContext || softAccessContext;
    const productEntitlements = platformOwnerManager.resolveEntitlements(baseAccessContext);
    const accessContext = productEntitlements
      ? { ...baseAccessContext, product_entitlements: productEntitlements }
      : baseAccessContext;
    currentAccessContext = accessContext;
    const hardeningDecision = authHardeningManager.checkRequest(req, url, accessContext);
    if (!hardeningDecision.allowed) return sendJson(res, hardeningDecision.statusCode, hardeningDecision.response);
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
        mvp_17: {
          role_navigation: true,
          actor_role: accessContext.actor_role,
          role_from_db: Boolean(accessContext.role_from_db),
          headers_trusted: Boolean(accessContext.headers_trusted),
          audit: "navigation/menu_resolvido",
        },
        mvp_19: {
          credential_login: credentialAuthManager.enabled,
          invite_not_only_entry: true,
          demo_replacement_ready: true,
          recovery_and_revocation: true,
          audit: "auth/credential_events",
        },
        mvp_20: {
          auth_hardening: authHardeningManager.enabled,
          demo_login_enabled: authHardeningManager.demoLoginEnabled,
          rate_limit: "ip_hash+user_agent_hash+acao",
          logs: "fitcore_security_events",
        },
        mvp_22: {
          tenant_user_management: tenantUserManagement.enabled,
          tenant_slug: accessContext.tenant_slug,
          actor_role: accessContext.actor_role,
          cross_tenant_block: true,
          next_ready_frontend: true,
        },
        mvp_23: {
          student_management: studentManagement.enabled,
          tenant_scoped: true,
          student_entity_complete: true,
          cross_tenant_block: true,
        },
        mvp_26: { student_evolution: studentEvolutionManager.enabled, history: true, average_effort: true, weekly_frequency: true, professor_dashboard: true },
        mvp_32: { agent_assistant: agentAssistantManager.enabled, exercise_media_cards: true, premium_workspace: true, tenant_scoped: true },
        mvp_33: { evidence_first_coach: evidenceCoachManager.enabled, evidence_only: true, human_review: true, medical_autonomy: false, next_route: "/coach" },
        mvp_37: { role_dashboard: roleDashboardManager.enabled, consolidated_endpoint: true, next_route: "/dashboard" },
        mvp_31: { guided_setup: guidedSetupManager.enabled, progress_saved_by_tenant: true, next_route: "/setup" },
        mvp_24: {
          workout_prescription: workoutPrescriptionManager.enabled,
          student_bound: true,
          professor_review_required: true,
          aluno_own_workouts_only: true,
          tenant_scoped: true,
        },
        mvp_21: {
          tenant_onboarding: tenantOnboardingManager.enabled,
          demo_is_no_longer_only_flow: true,
          current_tenant_slug: accessContext.tenant_slug,
          actor_role: accessContext.actor_role,
        },
        mvp_18: {
          user_invites: true,
          actor_role: accessContext.actor_role,
          session_signed: Boolean(accessContext.session_signed),
          role_from_db: Boolean(accessContext.role_from_db),
          demo_login_required_for_invited_users: false,
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
      platformOwnerManager.auditLogout(accessContext);
      const result = sessionManager.logout(req);
      return sendJson(res, 200, { ok: true, mvp: "MVP-15 Signed Session RBAC", logout: true }, { "set-cookie": result.cookie });
    }

    if (url.pathname === "/api/mvp-17/navigation") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const navigation = createRoleNavigation(accessContext);
      const audit = recordNavigationAudit(process.env, accessContext, {
        acao: "menu_resolvido",
        status: "ok",
        detalhe: `role=${navigation.actor_role}; visible=${navigation.items.length}; hidden=${navigation.hidden_items.length}`,
        userAgent: req.headers["user-agent"] || "mvp17",
      });
      return sendJson(res, 200, { ...navigation, audit });
    }

    if (url.pathname === "/api/mvp-17/navigation/audit") {
      if (req.method !== "POST") return sendMethodNotAllowed(res);
      const input = await readJsonBody(req);
      const audit = recordNavigationAudit(process.env, accessContext, {
        acao: input.acao || "ui_navigation_event",
        status: input.status || "ok",
        detalhe: input.detalhe || "evento de navegação MVP-17",
        userAgent: req.headers["user-agent"] || "mvp17",
      });
      return sendJson(res, audit.ok ? 201 : 200, { ok: true, mvp: "MVP-17 Role Navigation RBAC", audit });
    }


    if (url.pathname === "/api/mvp-18/status") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      return sendJson(res, 200, inviteUserManager.publicHealth(accessContext));
    }

    if (url.pathname === "/api/mvp-18/users") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const result = inviteUserManager.listUsers(accessContext);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      const invites = inviteUserManager.listInvites(accessContext);
      return sendJson(res, 200, { ok: true, mvp: "MVP-18 User Invites", tenant_slug: accessContext.tenant_slug, users: result.users, total_users: result.total, invites: invites.invites || [], total_invites: invites.total || 0 });
    }

    if (url.pathname === "/api/mvp-18/users/invite") {
      if (req.method !== "POST") return sendMethodNotAllowed(res);
      const input = await readJsonBody(req);
      const result = inviteUserManager.createInvite(accessContext, input);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 201, result);
    }

    if (url.pathname === "/api/mvp-18/invites/inspect") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const result = inviteUserManager.inspectInvite(url.searchParams.get("token"));
      return sendJson(res, result.ok ? 200 : (result.statusCode || 400), result);
    }

    if (url.pathname === "/api/mvp-18/invites/accept") {
      if (req.method !== "POST") return sendMethodNotAllowed(res);
      const input = await readJsonBody(req);
      const result = inviteUserManager.acceptInvite(input);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 201, { ok: true, mvp: result.mvp, accepted: true, invite: result.invite, user: result.user, session: result.session }, { "set-cookie": result.cookie });
    }

    if (url.pathname === "/api/platform-owner/tenants") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const result = platformOwnerManager.listTenants(accessContext);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 200, result);
    }

    if (url.pathname === "/api/platform-owner/switch") {
      if (req.method !== "POST") return sendMethodNotAllowed(res);
      const input = await readJsonBody(req);
      const result = platformOwnerManager.switchTenant(accessContext, input);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 200, result, { "set-cookie": result.cookie });
    }

    if (url.pathname === "/api/platform-owner/invites") {
      if (req.method === "GET") {
        const result = platformOwnerManager.listInternalInvites(accessContext);
        if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
        return sendJson(res, 200, result);
      }
      if (req.method === "POST") {
        const input = await readJsonBody(req);
        const result = platformOwnerManager.createInternalInvite(accessContext, input);
        if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
        return sendJson(res, 201, result);
      }
      if (req.method === "DELETE") {
        const input = await readJsonBody(req);
        const result = platformOwnerManager.revokeInternalAccess(accessContext, input);
        if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
        return sendJson(res, 200, result);
      }
      return sendMethodNotAllowed(res);
    }

    if (url.pathname === "/api/platform-owner/invites/inspect") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const result = platformOwnerManager.inspectInternalInvite(url.searchParams.get("token"));
      return sendJson(res, result.ok ? 200 : (result.statusCode || 400), result);
    }

    if (url.pathname === "/api/platform-owner/invites/accept") {
      if (req.method !== "POST") return sendMethodNotAllowed(res);
      const input = await readJsonBody(req);
      const result = platformOwnerManager.acceptInternalInvite(input);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 201, result);
    }

    if (url.pathname === "/api/mvp-19/status") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      return sendJson(res, 200, credentialAuthManager.publicHealth(accessContext));
    }

    if (url.pathname === "/api/mvp-19/credentials/me") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const result = credentialAuthManager.currentProfile(accessContext);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 200, result);
    }

    if (url.pathname === "/api/mvp-19/credentials/set") {
      if (req.method !== "POST") return sendMethodNotAllowed(res);
      const input = await readJsonBody(req);
      const result = credentialAuthManager.setCredential(accessContext, input);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 201, result);
    }

    if (url.pathname === "/api/mvp-19/login") {
      if (req.method !== "POST") return sendMethodNotAllowed(res);
      const input = await readJsonBody(req);
      const platformLogin = platformOwnerManager.globalLogin(input);
      if (platformLogin.matched) {
        if (platformLogin.guard && !platformLogin.guard.allowed) return sendJson(res, platformLogin.guard.statusCode, platformLogin.guard.response);
        return sendJson(res, 201, { ok: true, login: true, credential_login: true, platform_owner: platformLogin.platform_owner, platform_internal: true, platform_role: platformLogin.platform_role, user: platformLogin.user, session: platformLogin.session }, { "set-cookie": platformLogin.cookie });
      }
      const result = credentialAuthManager.credentialLogin(input);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 201, { ok: true, mvp: result.mvp, login: true, credential_login: true, platform_owner: false, platform_internal: false, platform_role: null, user: result.user, session: result.session }, { "set-cookie": result.cookie });
    }

    if (url.pathname === "/api/mvp-19/credentials/revoke") {
      if (req.method !== "POST") return sendMethodNotAllowed(res);
      const input = await readJsonBody(req);
      const result = credentialAuthManager.revokeCredential(accessContext, input);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 200, result);
    }

    if (url.pathname === "/api/mvp-19/recovery/request") {
      if (req.method !== "POST") return sendMethodNotAllowed(res);
      const input = await readJsonBody(req);
      const result = credentialAuthManager.requestRecovery(input);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 201, result);
    }

    if (url.pathname === "/api/mvp-19/recovery/complete") {
      if (req.method !== "POST") return sendMethodNotAllowed(res);
      const input = await readJsonBody(req);
      const result = credentialAuthManager.completeRecovery(input);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 201, { ok: true, mvp: result.mvp, recovery_completed: true, user: result.user, session: result.session }, { "set-cookie": result.cookie });
    }

    if (url.pathname === "/api/mvp-20/security/status") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      return sendJson(res, 200, authHardeningManager.publicHealth(accessContext));
    }

    if (url.pathname === "/api/mvp-20/security/logs") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const result = authHardeningManager.listSecurityLogs(accessContext);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 200, result);
    }

    if (url.pathname === "/api/mvp-20/security/cleanup-sessions") {
      if (req.method !== "POST") return sendMethodNotAllowed(res);
      const result = authHardeningManager.cleanupExpiredSessions(accessContext);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 200, result);
    }

    if (url.pathname === "/api/mvp-21/status") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      return sendJson(res, 200, tenantOnboardingManager.status(accessContext));
    }

    if (url.pathname === "/api/mvp-21/onboarding") {
      if (req.method !== "POST") return sendMethodNotAllowed(res);
      const input = await readJsonBody(req);
      const result = tenantOnboardingManager.createTenant(input, req);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 201, { ok: true, mvp: result.mvp, onboarding_completed: true, demo_is_no_longer_only_flow: true, tenant: result.tenant, owner: result.owner, first_professor: result.first_professor, first_student_user: result.first_student_user, first_student: result.first_student, login: result.login, session: result.session }, { "set-cookie": result.cookie });
    }

    if (url.pathname === "/api/mvp-21/tenant") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const result = tenantOnboardingManager.currentTenant(accessContext);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 200, result);
    }

    if (url.pathname === "/api/mvp-22/status") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      return sendJson(res, 200, tenantUserManagement.status(accessContext));
    }

    if (url.pathname === "/api/mvp-22/users") {
      if (req.method === "GET") {
        const result = tenantUserManagement.listUsers(accessContext, url);
        if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
        return sendJson(res, 200, result);
      }
      if (req.method === "POST") {
        const input = await readJsonBody(req);
        const result = tenantUserManagement.createUser(accessContext, input);
        if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
        return sendJson(res, 201, result);
      }
      return sendMethodNotAllowed(res);
    }

    if (url.pathname === "/api/mvp-22/users/invite") {
      if (req.method !== "POST") return sendMethodNotAllowed(res);
      const input = await readJsonBody(req);
      const result = tenantUserManagement.createInvite(accessContext, input);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 201, result);
    }

    if (url.pathname === "/api/mvp-22/invites/inspect") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const result = tenantUserManagement.inspectInvite({ token: url.searchParams.get("token"), tenant_slug: url.searchParams.get("tenant_slug") || url.searchParams.get("tenant") });
      return sendJson(res, result.ok ? 200 : (result.statusCode || 400), result);
    }

    if (url.pathname === "/api/mvp-22/invites/accept") {
      if (req.method !== "POST") return sendMethodNotAllowed(res);
      const input = await readJsonBody(req);
      const result = tenantUserManagement.acceptInvite(input);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 201, { ok: true, mvp: result.mvp, accepted: true, invite: result.invite, user: result.user, session: result.session }, { "set-cookie": result.cookie });
    }

    if (url.pathname === "/api/mvp-22/cross-tenant-check") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const result = tenantUserManagement.crossTenantCheck(accessContext, url);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 200, result);
    }


    if (url.pathname === "/api/mvp-23/status") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      return sendJson(res, 200, studentManagement.status(accessContext));
    }

    if (url.pathname === "/api/mvp-23/students") {
      if (req.method === "GET") {
        const result = studentManagement.listStudents(accessContext, url);
        if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
        return sendJson(res, 200, result);
      }
      if (req.method === "POST") {
        const input = await readJsonBody(req);
        const result = studentManagement.createStudent(accessContext, input);
        if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
        return sendJson(res, 201, result);
      }
      return sendMethodNotAllowed(res);
    }

    const mvp23StatusMatch = url.pathname.match(/^\/api\/mvp-23\/students\/([^/]+)\/status$/);
    if (mvp23StatusMatch) {
      if (req.method !== "POST" && req.method !== "PATCH") return sendMethodNotAllowed(res);
      const input = await readJsonBody(req);
      const result = studentManagement.updateStudentStatus(accessContext, decodeURIComponent(mvp23StatusMatch[1]), input);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 200, result);
    }

    const mvp23StudentMatch = url.pathname.match(/^\/api\/mvp-23\/students\/([^/]+)$/);
    if (mvp23StudentMatch) {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const result = studentManagement.getStudent(accessContext, decodeURIComponent(mvp23StudentMatch[1]));
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 200, result);
    }

    if (url.pathname === "/api/vnext/workout-builder/status") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      return sendJson(res, 200, workoutBuilderManager.status(accessContext));
    }

    if (url.pathname === "/api/vnext/workout-builder/preview") {
      if (req.method !== "POST") return sendMethodNotAllowed(res);
      const input = await readJsonBody(req);
      const result = workoutBuilderManager.preview(accessContext, input);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 200, result);
    }

    if (url.pathname === "/api/vnext/workout-builder/templates") {
      if (req.method === "GET") {
        const result = workoutBuilderManager.listTemplates(accessContext, url);
        if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
        return sendJson(res, 200, result);
      }
      if (req.method === "POST") {
        const input = await readJsonBody(req);
        const result = workoutBuilderManager.publishTemplate(accessContext, input);
        if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
        return sendJson(res, 201, result);
      }
      return sendMethodNotAllowed(res);
    }

    const workoutBuilderCloneMatch = url.pathname.match(/^\/api\/vnext\/workout-builder\/templates\/([^/]+)\/clone$/);
    if (workoutBuilderCloneMatch) {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const result = workoutBuilderManager.cloneTemplate(
        accessContext,
        decodeURIComponent(workoutBuilderCloneMatch[1]),
        url.searchParams.get("version"),
      );
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 200, result);
    }

    if (url.pathname === "/api/mvp-24/status") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      return sendJson(res, 200, workoutPrescriptionManager.status(accessContext));
    }

    if (url.pathname === "/api/mvp-24/prescriptions") {
      if (req.method === "GET") {
        const result = workoutPrescriptionManager.listPrescriptions(accessContext, url);
        if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
        return sendJson(res, 200, result);
      }
      if (req.method === "POST") {
        const input = await readJsonBody(req);
        const result = workoutPrescriptionManager.createPrescription(accessContext, input);
        if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
        return sendJson(res, 201, result);
      }
      return sendMethodNotAllowed(res);
    }

    if (url.pathname === "/api/mvp-24/my-workouts") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const result = workoutPrescriptionManager.listPrescriptions(accessContext, url, true);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 200, result);
    }

    const mvp24ReviewMatch = url.pathname.match(/^\/api\/mvp-24\/prescriptions\/([^/]+)\/review$/);
    if (mvp24ReviewMatch) {
      if (req.method !== "POST" && req.method !== "PATCH") return sendMethodNotAllowed(res);
      const input = await readJsonBody(req);
      const result = workoutPrescriptionManager.reviewPrescription(accessContext, decodeURIComponent(mvp24ReviewMatch[1]), input);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 200, result);
    }

    const mvp24PrescriptionMatch = url.pathname.match(/^\/api\/mvp-24\/prescriptions\/([^/]+)$/);
    if (mvp24PrescriptionMatch) {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const result = workoutPrescriptionManager.getPrescription(accessContext, decodeURIComponent(mvp24PrescriptionMatch[1]));
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 200, result);
    }

    if (url.pathname === "/api/mvp-46/status") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      return sendJson(res, 200, workoutSetSyncManager.status(accessContext));
    }

    const mvp46SetMatch = url.pathname.match(/^\/api\/mvp-46\/executions\/([^/]+)\/exercises\/([0-9]+)\/sets\/([0-9]+)$/);
    if (mvp46SetMatch) {
      if (!["POST", "PUT", "PATCH"].includes(req.method || "")) return sendMethodNotAllowed(res);
      const input = await readJsonBody(req);
      const result = workoutSetSyncManager.upsertSet(accessContext, decodeURIComponent(mvp46SetMatch[1]), mvp46SetMatch[2], mvp46SetMatch[3], input);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 200, result);
    }

    const mvp46SetsMatch = url.pathname.match(/^\/api\/mvp-46\/executions\/([^/]+)\/sets$/);
    if (mvp46SetsMatch) {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const result = workoutSetSyncManager.listSets(accessContext, decodeURIComponent(mvp46SetsMatch[1]));
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 200, result);
    }

    if (url.pathname === "/api/mvp-25/status") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      return sendJson(res, 200, {
        ...workoutExecutionManager.status(accessContext),
        execution_kernel: executionKernelRuntime.status(),
      });
    }

    if (url.pathname === "/api/mvp-25/analytics") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const role = String(accessContext?.actor_role || "").trim().toLowerCase();
      if (!["gestor", "professor"].includes(role)) {
        return sendJson(res, 403, { erro: "execution_analytics_forbidden", mensagem: "Analytics operacional disponível para gestor e professor." });
      }
      const windowHours = url.searchParams.get("window_hours") || 168;
      const analytics = executionKernelRuntime.analytics(accessContext, windowHours);
      const decisionIntelligence = executionKernelRuntime.decisionIntelligence(accessContext, Math.max(Number(windowHours) || 168, 720));
      const executionRemediation = executionKernelRuntime.remediationDashboard(accessContext, Math.max(Number(windowHours) || 168, 168));
      return sendJson(res, 200, {
        ok: true,
        mvp: "Execution Analytics",
        tenant_scoped: true,
        analytics,
        decision_intelligence: decisionIntelligence,
        execution_remediation: executionRemediation,
      });
    }

    if (url.pathname === "/api/mvp-25/remediation") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const role = String(accessContext?.actor_role || "").trim().toLowerCase();
      if (!["gestor", "professor"].includes(role)) {
        return sendJson(res, 403, { erro: "execution_remediation_forbidden", mensagem: "Remediation operacional disponível para gestor e professor." });
      }
      const remediation = executionKernelRuntime.remediationDashboard(accessContext, url.searchParams.get("window_hours") || 168);
      return sendJson(res, 200, {
        ok: true,
        mvp: "Execution Remediation",
        tenant_scoped: true,
        remediation,
        safety: {
          capability_exposed: false,
          payload_persisted: false,
          side_effect_authority: "execution-kernel",
        },
      });
    }

    const remediationActionMatch = url.pathname.match(/^\/api\/mvp-25\/remediation\/(rem_[0-9a-f]{32})\/(ready|dismiss)$/);
    if (remediationActionMatch) {
      if (req.method !== "POST") return sendMethodNotAllowed(res);
      const role = String(accessContext?.actor_role || "").trim().toLowerCase();
      if (role !== "gestor") {
        return sendJson(res, 403, { erro: "execution_remediation_operator_forbidden", mensagem: "Somente gestor pode alterar a fila de remediation." });
      }
      const [, remediationId, command] = remediationActionMatch;
      const input = await readJsonBody(req);
      const remediation = executionKernelRuntime.remediationAction(accessContext, {
        remediationId,
        action: command === "ready" ? "mark_ready" : "dismiss",
        reasonCode: String(input?.reason_code || (command === "ready" ? "operator_ready" : "operator_dismissed")),
      });
      return sendJson(res, 200, {
        ok: true,
        mvp: "Execution Remediation",
        remediation,
        safety: { capability_exposed: false, side_effect_authority: "execution-kernel" },
      });
    }

    const remediationRetryMatch = url.pathname.match(/^\/api\/mvp-25\/remediation\/(rem_[0-9a-f]{32})\/retry$/);
    if (remediationRetryMatch) {
      if (req.method !== "POST") return sendMethodNotAllowed(res);
      const input = await readJsonBody(req);
      const dryRun = url.searchParams.get("mode") === "dry_run" || url.searchParams.get("dry_run") === "true";
      const result = runExecutionRemediation(accessContext, remediationRetryMatch[1], input, dryRun);
      if (result?.guard && !result.guard.allowed) {
        return sendJson(res, result.guard.statusCode, {
          ...result.guard.response,
          execution_kernel: result.execution_kernel,
        });
      }
      return sendJson(res, dryRun ? 200 : 202, result);
    }

    if (url.pathname === "/api/mvp-25/analytics/decision-intelligence") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const role = String(accessContext?.actor_role || "").trim().toLowerCase();
      if (!["gestor", "professor"].includes(role)) {
        return sendJson(res, 403, { erro: "decision_intelligence_forbidden", mensagem: "Decision Intelligence disponível para gestor e professor." });
      }
      const intelligence = executionKernelRuntime.decisionIntelligence(accessContext, url.searchParams.get("window_hours") || 720);
      return sendJson(res, 200, { ok: true, mvp: "Decision Intelligence", tenant_scoped: true, intelligence });
    }

    const decisionActionMatch = url.pathname.match(/^\/api\/mvp-25\/analytics\/decisions\/(nba_[0-9a-f]{32})\/(accept|reject)$/);
    if (decisionActionMatch) {
      if (req.method !== "POST") return sendMethodNotAllowed(res);
      const [, proposalId, action] = decisionActionMatch;
      const decision = executionKernelRuntime.transitionDecision(accessContext, {
        proposalId,
        state: action === "accept" ? "accepted" : "rejected",
        reasonCode: action === "accept" ? "user_accepted" : "user_rejected",
      });
      return sendJson(res, 200, {
        ok: true,
        mvp: "Decision Intelligence",
        decision: {
          proposal_id: decision?.proposal_id,
          state: decision?.state,
          accepted_at: decision?.accepted_at || null,
          rejected_at: decision?.rejected_at || null,
        },
        safety: { capability_exposed: false, side_effect_authority: "execution-kernel" },
      });
    }

    if (url.pathname === "/api/mvp-25/analytics/next-best-action") {
      if (req.method !== "POST") return sendMethodNotAllowed(res);
      const role = String(accessContext?.actor_role || "").trim().toLowerCase();
      const ownOnly = role === "aluno";
      const prescriptionsResult = workoutPrescriptionManager.listPrescriptions(
        accessContext,
        new URL("http://fitcore.local/api/mvp-24/prescriptions?status=aprovado&limit=60"),
        ownOnly,
      );
      if (prescriptionsResult.guard && !prescriptionsResult.guard.allowed) {
        return sendJson(res, prescriptionsResult.guard.statusCode, prescriptionsResult.guard.response);
      }
      const executionsResult = workoutExecutionManager.listExecutions(
        accessContext,
        new URL("http://fitcore.local/api/mvp-25/executions?limit=80"),
        ownOnly,
      );
      if (executionsResult.guard && !executionsResult.guard.allowed) {
        return sendJson(res, executionsResult.guard.statusCode, executionsResult.guard.response);
      }
      const analytics = ["gestor", "professor"].includes(role)
        ? executionKernelRuntime.analytics(accessContext, 168)
        : { summary: {}, alerts: [], recent: [] };
      const intelligence = executionKernelRuntime.decisionIntelligence(accessContext, 720);
      const proposal = attachDecisionEvidence(buildExecutionNextBestAction({
        context: accessContext,
        analytics,
        prescriptions: prescriptionsResult.prescriptions || prescriptionsResult.workouts || [],
        executions: executionsResult.executions || [],
      }), intelligence);
      if (!proposal) {
        return sendJson(res, 200, { ok: true, mvp: "Execution Next Best Action", proposal: null, reason: "no_action_required" });
      }
      const decision = executionKernelRuntime.recordDecision(accessContext, proposal);
      if (terminalDecisionState(decision?.state)) {
        return sendJson(res, 200, {
          ok: true,
          mvp: "Execution Next Best Action",
          proposal: null,
          reason: "proposal_terminal_for_current_evidence",
          decision_state: decision?.state || null,
        });
      }
      return sendJson(res, 200, {
        ok: true,
        mvp: "Execution Next Best Action",
        proposal: { ...proposal, audit_state: decision?.state || "proposed" },
        safety: {
          proposal_only: true,
          accept_required: true,
          capability_exposed: false,
          direct_database_access: false,
          side_effect_authority: "execution-kernel",
        },
      });
    }

    if (url.pathname === "/api/mvp-25/executions") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const result = workoutExecutionManager.listExecutions(accessContext, url);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 200, result);
    }

    if (url.pathname === "/api/mvp-25/my-executions") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const result = workoutExecutionManager.listExecutions(accessContext, url, true);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 200, result);
    }

    if (url.pathname === "/api/mvp-25/executions/start") {
      if (req.method !== "POST") return sendMethodNotAllowed(res);
      const input = await readJsonBody(req);
      const actionId = WORKOUT_ACTION_IDS.START;
      const binding = buildWorkoutActionBinding(actionId, { input });
      const dryRun = url.searchParams.get("mode") === "dry_run" || url.searchParams.get("dry_run") === "true";
      if (dryRun) {
        const validation = workoutExecutionManager.validateAction(accessContext, actionId, binding);
        if (validation.guard && !validation.guard.allowed) return sendJson(res, validation.guard.statusCode, validation.guard.response);
        return sendJson(res, 200, executionKernelRuntime.dryRun(accessContext, {
          actionId,
          binding,
          summary: validation.summary,
        }));
      }
      const proposalId = validateExecutionDecision(accessContext, req, actionId, binding.workout_id);
      const result = executeDecisionBound(accessContext, proposalId, actionId, () => executionKernelRuntime.execute(accessContext, {
        actionId,
        idempotencyKey: resolveExecutionIdempotencyKey(req),
        binding,
        effect: (capability) => workoutExecutionManager.startExecution(accessContext, input, { capability }),
        replay: (resourceId) => {
          const replayed = workoutExecutionManager.getExecution(accessContext, resourceId);
          return replayed.guard ? replayed : { ...replayed, started: true };
        },
        reconcile: ({ executionId }) => workoutExecutionManager.reconcileAction(
          accessContext, actionId, binding, { executionId },
        ),
        resourceId: (effectResult) => effectResult.execution?.id,
      }));
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, {
        ...result.guard.response,
        execution_kernel: result.execution_kernel,
      });
      return sendJson(res, 201, result);
    }

    const mvp25ExerciseDoneMatch = url.pathname.match(/^\/api\/mvp-25\/executions\/([^/]+)\/exercises\/([0-9]+)\/done$/);
    if (mvp25ExerciseDoneMatch) {
      if (req.method !== "POST" && req.method !== "PATCH") return sendMethodNotAllowed(res);
      const input = await readJsonBody(req);
      const executionId = decodeURIComponent(mvp25ExerciseDoneMatch[1]);
      const exerciseIndex = mvp25ExerciseDoneMatch[2];
      const actionId = WORKOUT_ACTION_IDS.EXERCISE_COMPLETE;
      const binding = buildWorkoutActionBinding(actionId, { id: executionId, index: exerciseIndex, input });
      const dryRun = url.searchParams.get("mode") === "dry_run" || url.searchParams.get("dry_run") === "true";
      if (dryRun) {
        const validation = workoutExecutionManager.validateAction(accessContext, actionId, binding);
        if (validation.guard && !validation.guard.allowed) return sendJson(res, validation.guard.statusCode, validation.guard.response);
        return sendJson(res, 200, executionKernelRuntime.dryRun(accessContext, {
          actionId,
          binding,
          summary: validation.summary,
        }));
      }
      const proposalId = validateExecutionDecision(accessContext, req, actionId, executionId);
      const result = executeDecisionBound(accessContext, proposalId, actionId, () => executionKernelRuntime.execute(accessContext, {
        actionId,
        idempotencyKey: resolveExecutionIdempotencyKey(req),
        binding,
        effect: (capability) => workoutExecutionManager.markExerciseDone(accessContext, executionId, exerciseIndex, input, { capability }),
        replay: (resourceId) => {
          const replayed = workoutExecutionManager.getExecution(accessContext, resourceId);
          return replayed.guard ? replayed : { ...replayed, exercise_done: true, index: binding.index };
        },
        reconcile: ({ executionId: kernelExecutionId }) => workoutExecutionManager.reconcileAction(
          accessContext, actionId, binding, { executionId: kernelExecutionId },
        ),
        resourceId: (effectResult) => effectResult.execution?.id,
      }));
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, {
        ...result.guard.response,
        execution_kernel: result.execution_kernel,
      });
      return sendJson(res, 200, result);
    }

    const mvp25FinishMatch = url.pathname.match(/^\/api\/mvp-25\/executions\/([^/]+)\/finish$/);
    if (mvp25FinishMatch) {
      if (req.method !== "POST" && req.method !== "PATCH") return sendMethodNotAllowed(res);
      const input = await readJsonBody(req);
      const executionId = decodeURIComponent(mvp25FinishMatch[1]);
      const actionId = WORKOUT_ACTION_IDS.FINISH;
      const binding = buildWorkoutActionBinding(actionId, { id: executionId, input });
      const dryRun = url.searchParams.get("mode") === "dry_run" || url.searchParams.get("dry_run") === "true";
      if (dryRun) {
        const validation = workoutExecutionManager.validateAction(accessContext, actionId, binding);
        if (validation.guard && !validation.guard.allowed) return sendJson(res, validation.guard.statusCode, validation.guard.response);
        return sendJson(res, 200, executionKernelRuntime.dryRun(accessContext, {
          actionId,
          binding,
          summary: validation.summary,
        }));
      }
      const proposalId = validateExecutionDecision(accessContext, req, actionId, executionId);
      const result = executeDecisionBound(accessContext, proposalId, actionId, () => executionKernelRuntime.execute(accessContext, {
        actionId,
        idempotencyKey: resolveExecutionIdempotencyKey(req),
        binding,
        effect: (capability) => workoutExecutionManager.finishExecution(accessContext, executionId, input, { capability }),
        replay: (resourceId) => {
          const replayed = workoutExecutionManager.getExecution(accessContext, resourceId);
          return replayed.guard ? replayed : { ...replayed, finished: true };
        },
        reconcile: ({ executionId: kernelExecutionId }) => workoutExecutionManager.reconcileAction(
          accessContext, actionId, binding, { executionId: kernelExecutionId },
        ),
        resourceId: (effectResult) => effectResult.execution?.id,
      }));
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, {
        ...result.guard.response,
        execution_kernel: result.execution_kernel,
      });
      return sendJson(res, 200, result);
    }

    const mvp25ExecutionMatch = url.pathname.match(/^\/api\/mvp-25\/executions\/([^/]+)$/);
    if (mvp25ExecutionMatch) {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const result = workoutExecutionManager.getExecution(accessContext, decodeURIComponent(mvp25ExecutionMatch[1]));
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 200, result);
    }


    if (url.pathname === "/api/mvp-31/status") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      return sendJson(res, 200, guidedSetupManager.status(accessContext));
    }

    if (url.pathname === "/api/mvp-31/setup") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const result = guidedSetupManager.getSetup(accessContext);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 200, result);
    }

    if (url.pathname === "/api/mvp-31/setup/event") {
      if (req.method !== "POST") return sendMethodNotAllowed(res);
      const input = await readJsonBody(req);
      const result = guidedSetupManager.recordEvent(accessContext, input);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 201, result);
    }

    if (url.pathname === "/api/mvp-32/status") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      return sendJson(res, 200, agentAssistantManager.status(accessContext));
    }

    if (url.pathname === "/api/mvp-32/agent") {
      if (req.method !== "POST") return sendMethodNotAllowed(res);
      const input = await readJsonBody(req);
      const dashboardSnapshot = roleDashboardManager.dashboard(accessContext, new URL("http://fitcore.local/api/mvp-37/dashboard?limit=100"));
      const data = dashboardSnapshot?.data || {};
      const actorRole = String(accessContext?.actor_role || "").trim().toLowerCase();
      const externalProviderAllowed = actorRole !== "aluno" || studentManagement.aiConsentForActor(accessContext);
      const prescriptions = data.prescriptions?.prescriptions || [];
      const executions = data.executions?.executions || [];
      const evolutionStudents = Array.isArray(data.evolution?.students)
        ? data.evolution.students
        : (data.evolution?.student ? [data.evolution.student] : []);
      let studentsForAgent = data.students?.students || [];
      if (actorRole === "aluno") {
        const ownStudentId = prescriptions[0]?.student_id || executions[0]?.student_id || evolutionStudents[0]?.student_id || null;
        const ownStudentName = prescriptions[0]?.student_name || executions[0]?.student_name || evolutionStudents[0]?.student_name || "Aluno";
        studentsForAgent = ownStudentId ? [{
          id: ownStudentId,
          user_id: accessContext.actor_id,
          nome_publico: ownStudentName,
          consentimento_lgpd: externalProviderAllowed,
        }] : [];
      }
      const executionAnalyticsForAgent = ["gestor", "professor"].includes(actorRole)
        ? executionKernelRuntime.analytics(accessContext, 168)
        : null;
      const decisionIntelligenceForAgent = ["gestor", "professor"].includes(actorRole)
        ? executionKernelRuntime.decisionIntelligence(accessContext, 720)
        : null;
      const executionRemediationForAgent = ["gestor", "professor"].includes(actorRole)
        ? executionKernelRuntime.remediationDashboard(accessContext, 168)
        : null;
      const operationalContext = dashboardSnapshot?.guard ? {} : {
        source: dashboardSnapshot?.agent_context?.source || dashboardSnapshot?.source || "mvp37_consolidated_dashboard",
        facts: dashboardSnapshot?.agent_context?.facts || [],
        team: (data.team?.users || []).map((item) => ({ id: item.id, nome: item.nome || item.name, papel: item.papel || item.role, status: item.status, last_seen_at: item.last_seen_at || null })),
        students: studentsForAgent.map((item) => ({ id: item.id || item.student_id, user_id: item.user_id || item.student_user_id, nome: item.nome_publico || item.student_name || item.nome, objetivo: item.objetivo, professor: item.professor_nome, nivel: item.nivel, consentimento_lgpd: item.consentimento_lgpd !== false })),
        prescriptions: prescriptions.map((item) => ({ student_id: item.student_id, nome: item.nome_treino || item.objetivo, aluno: item.student_name || item.aluno_nome, status: item.status })),
        executions: executions.map((item) => ({ student_id: item.student_id, aluno: item.student_name || item.aluno_nome, status: item.status, esforco: item.percepcao_esforco ?? null, concluido_em: item.concluido_em || null })),
        evolution: evolutionStudents.map((item) => ({ student_id: item.student_id, aluno: item.student_name, frequencia: item.weekly_frequency, progresso: item.progress_percent, esforco: item.average_effort ?? null })),
        execution_analytics: executionAnalyticsForAgent,
        decision_intelligence: decisionIntelligenceForAgent,
        execution_remediation: executionRemediationForAgent,
      };
      const result = await agentAssistantManager.ask(accessContext, { ...input, operational_context: operationalContext, external_provider_allowed: externalProviderAllowed });
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 200, result);
    }

    if (url.pathname === "/api/mvp-32/capabilities") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      return sendJson(res, 200, openSourceCapabilityManager.status(accessContext));
    }

    if (url.pathname === "/api/mvp-32/knowledge/preview") {
      if (req.method !== "POST") return sendMethodNotAllowed(res);
      const input = await readJsonBody(req);
      try {
        const result = await openSourceCapabilityManager.previewWebKnowledge(accessContext, input);
        if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
        return sendJson(res, 200, result);
      } catch (error) {
        console.error("fitcore_capability_preview_failed", error instanceof Error ? error.message : String(error));
        return sendJson(res, 502, { erro: "web_knowledge_unavailable" });
      }
    }

    if (url.pathname === "/api/mvp-33/status") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      return sendJson(res, 200, evidenceCoachManager.status(accessContext));
    }

    if (url.pathname === "/api/mvp-33/brief") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const result = evidenceCoachManager.tenantBrief(accessContext, url);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 200, result);
    }

    if (url.pathname === "/api/mvp-33/my-coach") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const result = evidenceCoachManager.studentCoach(accessContext, "", url, true);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 200, result);
    }

    const mvp33StudentCoachMatch = url.pathname.match(/^\/api\/mvp-33\/students\/([^/]+)\/coach$/);
    if (mvp33StudentCoachMatch) {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const result = evidenceCoachManager.studentCoach(accessContext, decodeURIComponent(mvp33StudentCoachMatch[1]), url, false);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 200, result);
    }

    if (url.pathname === "/api/vnext/assessments/status") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      return sendJson(res, 200, assessmentManager.status(accessContext));
    }

    if (url.pathname === "/api/vnext/assessments/me") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const result = assessmentManager.history(accessContext, "", url.searchParams.get("limit") || 50);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 200, result);
    }

    if (url.pathname === "/api/vnext/assessments/consents") {
      if (req.method !== "POST") return sendMethodNotAllowed(res);
      const input = await readJsonBody(req);
      const result = assessmentManager.recordConsent(accessContext, "", input);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 201, result);
    }

    if (url.pathname === "/api/vnext/assessments/templates") {
      if (req.method === "GET") {
        const result = assessmentManager.listTemplates(accessContext);
        if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
        return sendJson(res, 200, result);
      }
      if (req.method === "POST") {
        const input = await readJsonBody(req);
        const result = assessmentManager.publishTemplate(accessContext, input);
        if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
        return sendJson(res, 201, result);
      }
      return sendMethodNotAllowed(res);
    }

    if (url.pathname === "/api/vnext/assessments/me/records") {
      if (req.method !== "POST") return sendMethodNotAllowed(res);
      const input = await readJsonBody(req);
      const result = assessmentManager.recordAssessment(accessContext, "", input);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 201, result);
    }

    const assessmentStudentMatch = url.pathname.match(/^\/api\/vnext\/assessments\/students\/([^/]+)$/);
    if (assessmentStudentMatch) {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const result = assessmentManager.history(accessContext, decodeURIComponent(assessmentStudentMatch[1]), url.searchParams.get("limit") || 50);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 200, result);
    }

    const assessmentStudentRecordMatch = url.pathname.match(/^\/api\/vnext\/assessments\/students\/([^/]+)\/records$/);
    if (assessmentStudentRecordMatch) {
      if (req.method !== "POST") return sendMethodNotAllowed(res);
      const input = await readJsonBody(req);
      const result = assessmentManager.recordAssessment(accessContext, decodeURIComponent(assessmentStudentRecordMatch[1]), input);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 201, result);
    }

    if (url.pathname === "/api/vnext/athlete-360/status") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      return sendJson(res, 200, athlete360Manager.status(accessContext));
    }

    if (url.pathname === "/api/vnext/athlete-360/me") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const result = athlete360Manager.snapshot(accessContext, "");
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 200, result);
    }

    if (url.pathname === "/api/vnext/athlete-360/me/goals") {
      if (req.method !== "POST") return sendMethodNotAllowed(res);
      const input = await readJsonBody(req);
      const result = athlete360Manager.createGoal(accessContext, "", input);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 201, result);
    }

    const athlete360StudentMatch = url.pathname.match(/^\/api\/vnext\/athlete-360\/students\/([^/]+)$/);
    if (athlete360StudentMatch) {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const result = athlete360Manager.snapshot(accessContext, decodeURIComponent(athlete360StudentMatch[1]));
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 200, result);
    }

    const athlete360StudentGoalMatch = url.pathname.match(/^\/api\/vnext\/athlete-360\/students\/([^/]+)\/goals$/);
    if (athlete360StudentGoalMatch) {
      if (req.method !== "POST") return sendMethodNotAllowed(res);
      const input = await readJsonBody(req);
      const result = athlete360Manager.createGoal(accessContext, decodeURIComponent(athlete360StudentGoalMatch[1]), input);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 201, result);
    }

    const athlete360GoalMatch = url.pathname.match(/^\/api\/vnext\/athlete-360\/goals\/([^/]+)$/);
    if (athlete360GoalMatch) {
      if (req.method !== "POST") return sendMethodNotAllowed(res);
      const input = await readJsonBody(req);
      const result = athlete360Manager.updateGoal(accessContext, decodeURIComponent(athlete360GoalMatch[1]), input);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 200, result);
    }

    if (url.pathname === "/api/mvp-26/status") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      return sendJson(res, 200, studentEvolutionManager.status(accessContext));
    }

    if (url.pathname === "/api/mvp-26/evolution") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const result = studentEvolutionManager.tenantEvolution(accessContext, url);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 200, result);
    }

    if (url.pathname === "/api/mvp-26/my-evolution") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const result = studentEvolutionManager.studentEvolution(accessContext, "", url, true);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 200, result);
    }

    const mvp26StudentEvolutionMatch = url.pathname.match(/^\/api\/mvp-26\/students\/([^/]+)\/evolution$/);
    if (mvp26StudentEvolutionMatch) {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const result = studentEvolutionManager.studentEvolution(accessContext, decodeURIComponent(mvp26StudentEvolutionMatch[1]), url, false);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 200, result);
    }

    if (url.pathname === "/api/mvp-37/status") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      return sendJson(res, 200, roleDashboardManager.status(accessContext));
    }

    if (url.pathname === "/api/mvp-37/dashboard") {
      if (req.method !== "GET") return sendMethodNotAllowed(res);
      const result = roleDashboardManager.dashboard(accessContext, url);
      if (result.guard && !result.guard.allowed) return sendJson(res, result.guard.statusCode, result.guard.response);
      return sendJson(res, 200, result);
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
