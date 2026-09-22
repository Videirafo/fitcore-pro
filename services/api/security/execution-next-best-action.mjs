import { createHash } from "node:crypto";
import { runDecisionPipeline } from "./decision-pipeline.mjs";

const RULE_VERSION = 1;
const ACTION_START = "fitcore.workout.execution.start";
const ACTION_COMPLETE = "fitcore.workout.exercise.complete";
const ACTION_FINISH = "fitcore.workout.execution.finish";

const SCORE_COMPLETE = 400;
const SCORE_FINISH = 300;
const SCORE_START = 200;
const SCORE_ALERT = 100;

function clean(value, fallback = "", max = 160) {
  const text = String(value ?? "").trim().slice(0, max);
  return text || fallback;
}

function proposalId(parts) {
  const digest = createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);
  return `nba_${digest}`;
}

function decisionCandidate(payload, score) {
  return {
    candidateKey: payload.proposal_id,
    source: "execution-analytics",
    actionId: payload.action_id || "",
    score,
    reasonCodes: [payload.reason_code],
    payload,
  };
}

export function buildExecutionDecisionCandidates({
  context = {},
  analytics = {},
  prescriptions = [],
  executions = [],
} = {}) {
  const role = clean(context.actor_role, "visitante", 40).toLowerCase();
  const alerts = Array.isArray(analytics.alerts) ? analytics.alerts : [];
  const candidates = [];

  if (role === "aluno") {
    const active = executions.find((item) => item?.status === "em_execucao");
    if (active) {
      const progress = Array.isArray(active.exercise_progress) ? active.exercise_progress : [];
      const next = progress.find((item) => item?.status !== "feito");
      const resourceId = clean(active.id, "", 90);

      if (next) {
        const actionId = ACTION_COMPLETE;
        const index = Number(next.index ?? 0);
        const reasonCode = "workout_exercise_pending";
        const payload = {
          proposal_id: proposalId([
            context.tenant_id,
            context.actor_id,
            RULE_VERSION,
            actionId,
            reasonCode,
            resourceId,
            index,
          ]),
          rule_version: RULE_VERSION,
          type: "fitness_action",
          governed: true,
          action_id: actionId,
          reason_code: reasonCode,
          priority: "high",
          resource_id: resourceId,
          binding: { execution_id: resourceId, index },
          cta: "Marcar próximo exercício",
          route: "/execucao",
        };
        candidates.push(decisionCandidate(payload, SCORE_COMPLETE));
      } else {
        const actionId = ACTION_FINISH;
        const reasonCode = "workout_ready_to_finish";
        const payload = {
          proposal_id: proposalId([
            context.tenant_id,
            context.actor_id,
            RULE_VERSION,
            actionId,
            reasonCode,
            resourceId,
          ]),
          rule_version: RULE_VERSION,
          type: "fitness_action",
          governed: true,
          action_id: actionId,
          reason_code: reasonCode,
          priority: "high",
          resource_id: resourceId,
          binding: { execution_id: resourceId },
          requires_input: true,
          cta: "Concluir treino",
          route: "/execucao",
        };
        candidates.push(decisionCandidate(payload, SCORE_FINISH));
      }
    }

    const approved = prescriptions.find((item) => item?.status === "aprovado");
    if (approved) {
      const actionId = ACTION_START;
      const resourceId = clean(approved.id, "", 90);
      const reasonCode = "approved_workout_ready";
      const cycle = executions.filter(
        (item) => clean(item?.workout_id, "", 90) === resourceId,
      ).length;
      const payload = {
        proposal_id: proposalId([
          context.tenant_id,
          context.actor_id,
          RULE_VERSION,
          actionId,
          reasonCode,
          resourceId,
          cycle,
        ]),
        rule_version: RULE_VERSION,
        type: "fitness_action",
        governed: true,
        action_id: actionId,
        reason_code: reasonCode,
        priority: "medium",
        resource_id: resourceId,
        binding: { workout_id: resourceId },
        cta: "Iniciar treino recomendado",
        route: "/execucao",
      };
      candidates.push(decisionCandidate(payload, SCORE_START));
    }
  }

  if (alerts.length) {
    const alert = alerts[0];
    const reasonCode = clean(alert.code, "execution_alert", 120);
    const payload = {
      proposal_id: proposalId([
        context.tenant_id,
        context.actor_id,
        RULE_VERSION,
        reasonCode,
        alert.severity || "high",
      ]),
      rule_version: RULE_VERSION,
      type: "operational_review",
      governed: false,
      action_id: null,
      reason_code: reasonCode,
      priority: clean(alert.severity, "high", 20),
      resource_id: null,
      cta: "Revisar alertas de execução",
      route: "/auditoria",
    };
    candidates.push(decisionCandidate(payload, SCORE_ALERT));
  }

  return candidates;
}

export function buildExecutionNextBestAction(input = {}) {
  const candidates = buildExecutionDecisionCandidates(input);
  const decision = runDecisionPipeline({
    candidates,
    context: input.context || {},
    limit: 1,
  });
  return decision.selected[0]?.payload || null;
}

export const EXECUTION_NBA_RULE_VERSION = RULE_VERSION;
