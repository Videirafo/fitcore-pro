// FITCORE PRO — deterministic decision pipeline foundation.
// Recommendation is advisory. Side effects remain exclusively under the Execution Kernel.

function finiteNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function cloneCandidate(candidate) {
  const baseScore = finiteNumber(Number(candidate?.score)) ?? 0;
  return {
    ...candidate,
    candidateKey: String(candidate?.candidateKey || ""),
    source: String(candidate?.source || ""),
    actionId: String(candidate?.actionId || ""),
    score: baseScore,
    baseScore,
    reasonCodes: [...(Array.isArray(candidate?.reasonCodes) ? candidate.reasonCodes : [])],
    scoreBreakdown: {},
    blockedBy: [],
    rank: null,
  };
}

function block(item, gateId) {
  return {
    ...item,
    blockedBy: [...item.blockedBy, gateId],
    rank: null,
  };
}

function gateAllows(gate, candidate, context) {
  try {
    return gate.allow(candidate, context) === true;
  } catch {
    return false;
  }
}

export function stableDecisionRank(items, compare, keyOf) {
  return [...(Array.isArray(items) ? items : [])].sort((left, right) => {
    const compared = Number(compare(left, right)) || 0;
    if (compared !== 0) return compared;
    return String(keyOf(left)).localeCompare(String(keyOf(right)));
  });
}

export function runDecisionPipeline({
  candidates = [],
  context = {},
  eligibility = [],
  scorers = [],
  policies = [],
  limit,
} = {}) {
  const requestedLimit = limit ?? candidates.length;
  const safeLimit = Math.max(1, Math.min(Number(requestedLimit) || 1, 100));
  const rejected = [];
  const scored = [];

  for (const rawCandidate of candidates) {
    let item = cloneCandidate(rawCandidate);

    for (const gate of eligibility) {
      if (!gateAllows(gate, item, context)) {
        item = block(item, `eligibility:${gate.id}`);
      }
    }

    if (item.blockedBy.length) {
      rejected.push(item);
      continue;
    }

    const breakdown = {};
    let nextScore = item.baseScore;
    let scorerFailed = false;

    for (const scorer of scorers) {
      try {
        const contribution = finiteNumber(Number(scorer.score(item, context)));
        if (contribution == null) {
          item = block(item, `scorer:${scorer.id}`);
          scorerFailed = true;
          break;
        }
        const weight = finiteNumber(Number(scorer.weight ?? 1)) ?? 1;
        const weighted = contribution * weight;
        breakdown[scorer.id] = weighted;
        nextScore += weighted;
      } catch {
        item = block(item, `scorer:${scorer.id}`);
        scorerFailed = true;
        break;
      }
    }

    if (scorerFailed) {
      rejected.push({
        ...item,
        scoreBreakdown: breakdown,
      });
      continue;
    }

    item = {
      ...item,
      score: nextScore,
      scoreBreakdown: breakdown,
    };

    for (const policy of policies) {
      if (!gateAllows(policy, item, context)) {
        item = block(item, `policy:${policy.id}`);
      }
    }

    if (item.blockedBy.length) rejected.push(item);
    else scored.push(item);
  }

  const selected = stableDecisionRank(
    scored,
    (left, right) => right.score - left.score,
    (item) => item.candidateKey,
  )
    .slice(0, safeLimit)
    .map((item, index) => ({ ...item, rank: index + 1 }));

  return { selected, rejected };
}
