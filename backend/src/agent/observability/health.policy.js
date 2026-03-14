"use strict";

const DEFAULT_HEALTH_SNAPSHOT_EVERY_N_TURNS = 25;
const DEFAULT_POLICY = Object.freeze({
  TOOL_FAILURE_RATE_WARN_THRESHOLD: 0.25,
  AVG_TURN_LATENCY_WARN_MS: 8000,
  CLARIFICATION_RATE_WARN_THRESHOLD: 0.45,
  RETRIEVAL_MISS_RATE_WARN_THRESHOLD: 0.7,
  HEALTH_SNAPSHOT_EVERY_N_TURNS: DEFAULT_HEALTH_SNAPSHOT_EVERY_N_TURNS,
});

function createHealthPolicy(overrides = {}) {
  const envValue = parsePositiveInt(
    process.env.HEALTH_SNAPSHOT_EVERY_N_TURNS,
    DEFAULT_HEALTH_SNAPSHOT_EVERY_N_TURNS,
  );
  const normalizedOverrides = toRecord(overrides) || {};
  return {
    TOOL_FAILURE_RATE_WARN_THRESHOLD: normalizeRatio(
      normalizedOverrides.TOOL_FAILURE_RATE_WARN_THRESHOLD,
      DEFAULT_POLICY.TOOL_FAILURE_RATE_WARN_THRESHOLD,
    ),
    AVG_TURN_LATENCY_WARN_MS: parsePositiveInt(
      normalizedOverrides.AVG_TURN_LATENCY_WARN_MS,
      DEFAULT_POLICY.AVG_TURN_LATENCY_WARN_MS,
    ),
    CLARIFICATION_RATE_WARN_THRESHOLD: normalizeRatio(
      normalizedOverrides.CLARIFICATION_RATE_WARN_THRESHOLD,
      DEFAULT_POLICY.CLARIFICATION_RATE_WARN_THRESHOLD,
    ),
    RETRIEVAL_MISS_RATE_WARN_THRESHOLD: normalizeRatio(
      normalizedOverrides.RETRIEVAL_MISS_RATE_WARN_THRESHOLD,
      DEFAULT_POLICY.RETRIEVAL_MISS_RATE_WARN_THRESHOLD,
    ),
    HEALTH_SNAPSHOT_EVERY_N_TURNS: parsePositiveInt(
      normalizedOverrides.HEALTH_SNAPSHOT_EVERY_N_TURNS,
      envValue,
    ),
  };
}

function shouldEmitHealthSnapshot(turnCount, policy) {
  const safePolicy = policy || DEFAULT_POLICY;
  const every = parsePositiveInt(
    safePolicy.HEALTH_SNAPSHOT_EVERY_N_TURNS,
    DEFAULT_HEALTH_SNAPSHOT_EVERY_N_TURNS,
  );
  const count = parsePositiveInt(turnCount, 0);
  return count > 0 && count % every === 0;
}

function evaluateHealth(metricsSnapshot, policy = DEFAULT_POLICY) {
  const snapshot = toRecord(metricsSnapshot) || {};
  const counters = toRecord(snapshot.counters) || {};
  const rates = toRecord(snapshot.rates) || {};
  const warnings = [];

  const toolFailureRate = normalizeNumber(rates.toolFailureRate);
  if (toolFailureRate >= policy.TOOL_FAILURE_RATE_WARN_THRESHOLD) {
    warnings.push({
      code: "TOOL_FAILURE_RATE_HIGH",
      severity: "medium",
      message: `Tool failure rate is ${toolFailureRate}, above threshold ${policy.TOOL_FAILURE_RATE_WARN_THRESHOLD}.`,
    });
  }

  const avgTurnLatency = normalizeNumber(rates.averageTurnLatencyMs);
  if (avgTurnLatency >= policy.AVG_TURN_LATENCY_WARN_MS) {
    warnings.push({
      code: "AVG_TURN_LATENCY_HIGH",
      severity: "medium",
      message: `Average turn latency is ${avgTurnLatency}ms, above threshold ${policy.AVG_TURN_LATENCY_WARN_MS}ms.`,
    });
  }

  const clarificationRate = normalizeNumber(rates.clarificationRate);
  if (clarificationRate >= policy.CLARIFICATION_RATE_WARN_THRESHOLD) {
    warnings.push({
      code: "CLARIFICATION_RATE_HIGH",
      severity: "low",
      message: `Clarification rate is ${clarificationRate}, above threshold ${policy.CLARIFICATION_RATE_WARN_THRESHOLD}.`,
    });
  }

  const retrievalMissRate = normalizeNumber(rates.retrievalMissRate);
  if (retrievalMissRate >= policy.RETRIEVAL_MISS_RATE_WARN_THRESHOLD) {
    warnings.push({
      code: "RETRIEVAL_MISS_RATE_HIGH",
      severity: "low",
      message: `Retrieval miss rate is ${retrievalMissRate}, above threshold ${policy.RETRIEVAL_MISS_RATE_WARN_THRESHOLD}.`,
    });
  }

  return {
    status: warnings.length > 0 ? "warn" : "ok",
    warnings,
    totals: {
      turnsTotal: normalizeNumber(counters.turnsTotal),
      turnsFailed: normalizeNumber(counters.turnsFailed),
      toolCallsTotal: normalizeNumber(counters.toolCallsTotal),
      toolCallsFailed: normalizeNumber(counters.toolCallsFailed),
    },
  };
}

function normalizeRatio(value, fallback) {
  const numeric = normalizeNumber(value);
  if (numeric <= 0 || numeric > 1) {
    return fallback;
  }
  return numeric;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function toRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value;
}

module.exports = {
  DEFAULT_POLICY,
  DEFAULT_HEALTH_SNAPSHOT_EVERY_N_TURNS,
  createHealthPolicy,
  shouldEmitHealthSnapshot,
  evaluateHealth,
};
