// FITCORE PRO — #89 Decision Intelligence.
// Transparent evidence ordering only; no opaque score is used as execution authority.

const OUTCOME_BY_ACTION = Object.freeze({
  "fitcore.workout.execution.start": "session_started",
  "fitcore.workout.exercise.complete": "exercise_completed",
  "fitcore.workout.execution.finish": "workout_completed",
});

function count(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function rankDecisionEvidence(rows = []) {
  return [...(Array.isArray(rows) ? rows : [])]
    .map((row) => ({
      reason_code: String(row?.reason_code || ""),
      action_id: row?.action_id ? String(row.action_id) : null,
      accepted_count: count(row?.accepted_count ?? row?.accepted),
      settled_count: count(row?.settled_count ?? row?.settled),
      outcome_count: count(row?.outcome_count ?? row?.outcomes),
      positive_outcome_count: count(row?.positive_outcome_count ?? row?.positive_outcomes),
    }))
    .sort((a, b) =>
      b.outcome_count - a.outcome_count ||
      b.settled_count - a.settled_count ||
      b.accepted_count - a.accepted_count ||
      a.reason_code.localeCompare(b.reason_code) ||
      String(a.action_id || "").localeCompare(String(b.action_id || "")),
    )
    .map((row, index) => ({
      ...row,
      rank: index + 1,
      tier: row.outcome_count >= 5 ? "strong" : row.outcome_count >= 3 ? "moderate" : row.outcome_count >= 1 ? "limited" : "none",
    }));
}

export function attachDecisionEvidence(proposal, intelligence = {}) {
  if (!proposal) return null;
  const ranked = rankDecisionEvidence(intelligence?.evidence || intelligence?.by_reason || []);
  const match = ranked.find((item) =>
    item.reason_code === proposal.reason_code &&
    String(item.action_id || "") === String(proposal.action_id || ""),
  );
  return {
    ...proposal,
    evidence: match || {
      rank: null,
      tier: "none",
      accepted_count: 0,
      settled_count: 0,
      outcome_count: 0,
      positive_outcome_count: 0,
    },
    evidence_policy: {
      authority: "execution-kernel",
      ranking: ["outcome_count_desc", "settled_count_desc", "accepted_count_desc", "reason_code_asc", "action_id_asc"],
      opaque_score: false,
    },
  };
}

export function outcomeForExecutionAction(actionId, succeeded) {
  return {
    outcome_code: succeeded ? (OUTCOME_BY_ACTION[actionId] || "action_completed") : "action_failed",
    metric_name: "completion",
    metric_value: succeeded ? 1 : 0,
    window_hours: 1,
  };
}

export function terminalDecisionState(state) {
  return ["rejected", "dismissed", "expired", "outcome_recorded", "failed"].includes(String(state || ""));
}
