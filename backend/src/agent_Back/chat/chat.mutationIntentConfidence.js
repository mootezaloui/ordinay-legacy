"use strict";

const DEFAULT_THRESHOLD = Number.parseFloat(
  process.env.AGENT_MUTATION_INTENT_THRESHOLD || "0.85",
);
const DEFAULT_ENTITY_THRESHOLD = Number.parseFloat(
  process.env.AGENT_MUTATION_INTENT_ENTITY_THRESHOLD || "0.93",
);

const WEIGHTS = Object.freeze({
  intentVerbClarity: 0.2,
  operationConfidence: 0.1,
  entityTypeConfidence: 0.1,
  entityResolutionConfidence: 0.25,
  fieldParseConfidence: 0.15,
  valueParseConfidence: 0.15,
  contextCoherenceConfidence: 0.05,
});

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function computeFinalConfidence(scores = {}) {
  let total = 0;
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    total += clamp01(scores[key]) * weight;
  }
  return Number(total.toFixed(4));
}

function buildScoreBreakdown({
  scores = {},
  hardGateFailures = [],
  threshold = DEFAULT_THRESHOLD,
  entityThreshold = DEFAULT_ENTITY_THRESHOLD,
} = {}) {
  const normalizedScores = {};
  for (const key of Object.keys(WEIGHTS)) {
    normalizedScores[key] = clamp01(scores[key]);
  }
  return {
    threshold,
    entityThreshold,
    finalConfidence: computeFinalConfidence(normalizedScores),
    hardGateFailures: Array.isArray(hardGateFailures) ? [...hardGateFailures] : [],
    components: normalizedScores,
  };
}

module.exports = {
  WEIGHTS,
  DEFAULT_THRESHOLD,
  DEFAULT_ENTITY_THRESHOLD,
  clamp01,
  computeFinalConfidence,
  buildScoreBreakdown,
};
