"use strict";

function createMetricsAggregator() {
  const state = createInitialState();

  function recordTurn(metricData = {}) {
    state.turnsTotal += 1;

    if (metricData.success === false) {
      state.turnsFailed += 1;
      if (metricData.failureType) {
        state.failuresByType[metricData.failureType] =
          (state.failuresByType[metricData.failureType] || 0) + 1;
      }
    } else {
      state.turnsSucceeded += 1;
    }

    const uxAction = normalizeText(metricData.uxAction);
    if (uxAction === "ask" || uxAction === "offer_choices") {
      state.clarificationCount += 1;
    }
    if (uxAction === "guided_workflow") {
      state.guidedWorkflowCount += 1;
    }

    if (metricData.pendingProposed === true) {
      state.pendingProposalsCreated += 1;
    }
    if (metricData.confirmedExecution === true) {
      state.confirmedExecutions += 1;
    }
    if (metricData.rejectedExecution === true) {
      state.rejectedExecutions += 1;
    }

    if (metricData.retrievalHit === true) {
      state.retrievalHits += 1;
      state.retrievalEvaluated += 1;
    } else if (metricData.retrievalMiss === true) {
      state.retrievalMisses += 1;
      state.retrievalEvaluated += 1;
    }

    if (metricData.ragActivated === true) {
      state.ragActivations += 1;
    }
    if (metricData.fullTextInjected === true) {
      state.fullTextInjections += 1;
    }
    const ragChunks = normalizeNumber(metricData.ragChunksInjected);
    if (ragChunks > 0) {
      state.ragChunksInjectedTotal += ragChunks;
      state.ragChunksInjectedSamples += 1;
    }
    const ragAvgScore = normalizeNumber(metricData.ragAvgScore);
    if (ragAvgScore > 0) {
      state.ragScoreTotal += ragAvgScore;
      state.ragScoreSamples += 1;
    }
    state.ragHydrations += normalizeNumber(metricData.ragHydrations);
    state.ragHydrationCacheHits += normalizeNumber(metricData.ragHydrationCacheHits);

    if (metricData.citationAppended === true) {
      state.citationAppendedResponses += 1;
    }
    if (metricData.lowSourceDensity === true) {
      state.lowConfidenceGroundedResponses += 1;
    }

    const turnLatencyMs = normalizeNumber(metricData.turnLatencyMs);
    if (turnLatencyMs > 0) {
      state.turnLatencyTotalMs += turnLatencyMs;
      state.turnLatencySamples += 1;
    }
  }

  function recordTool(metricData = {}) {
    state.toolCallsTotal += 1;
    const ok = metricData.ok === true;
    if (!ok) {
      state.toolCallsFailed += 1;
    }

    const toolName = normalizeText(metricData.toolName) || "unknown_tool";
    const byTool = state.toolStatsByName[toolName] || { total: 0, failed: 0 };
    byTool.total += 1;
    if (!ok) {
      byTool.failed += 1;
    }
    state.toolStatsByName[toolName] = byTool;
  }

  function snapshot() {
    const turnsTotal = state.turnsTotal;
    const toolCallsTotal = state.toolCallsTotal;
    const retrievalEvaluated = state.retrievalEvaluated;
    return {
      counters: {
        turnsTotal,
        turnsSucceeded: state.turnsSucceeded,
        turnsFailed: state.turnsFailed,
        clarificationCount: state.clarificationCount,
        guidedWorkflowCount: state.guidedWorkflowCount,
        pendingProposalsCreated: state.pendingProposalsCreated,
        confirmedExecutions: state.confirmedExecutions,
        rejectedExecutions: state.rejectedExecutions,
        toolCallsTotal,
        toolCallsFailed: state.toolCallsFailed,
        retrievalHits: state.retrievalHits,
        retrievalMisses: state.retrievalMisses,
        ragActivations: state.ragActivations,
        fullTextInjections: state.fullTextInjections,
        ragChunksInjectedTotal: state.ragChunksInjectedTotal,
        ragChunksInjectedSamples: state.ragChunksInjectedSamples,
        ragHydrations: state.ragHydrations,
        ragHydrationCacheHits: state.ragHydrationCacheHits,
        citationAppendedResponses: state.citationAppendedResponses,
        lowConfidenceGroundedResponses: state.lowConfidenceGroundedResponses,
      },
      rates: {
        turnFailureRate: safeRate(state.turnsFailed, turnsTotal),
        toolFailureRate: safeRate(state.toolCallsFailed, toolCallsTotal),
        clarificationRate: safeRate(state.clarificationCount, turnsTotal),
        retrievalMissRate: safeRate(state.retrievalMisses, retrievalEvaluated),
        ragActivationRate: safeRate(state.ragActivations, state.ragActivations + state.fullTextInjections),
        avgRagChunksInjected: safeRate(state.ragChunksInjectedTotal, state.ragChunksInjectedSamples),
        avgRagScore: safeRate(state.ragScoreTotal, state.ragScoreSamples),
        averageTurnLatencyMs: safeRate(state.turnLatencyTotalMs, state.turnLatencySamples),
      },
      failuresByType: { ...state.failuresByType },
      toolStatsByName: cloneToolStats(state.toolStatsByName),
    };
  }

  function reset() {
    Object.assign(state, createInitialState());
  }

  return {
    recordTurn,
    recordTool,
    snapshot,
    reset,
  };
}

function createInitialState() {
  return {
    turnsTotal: 0,
    turnsSucceeded: 0,
    turnsFailed: 0,
    clarificationCount: 0,
    guidedWorkflowCount: 0,
    pendingProposalsCreated: 0,
    confirmedExecutions: 0,
    rejectedExecutions: 0,
    toolCallsTotal: 0,
    toolCallsFailed: 0,
    retrievalHits: 0,
    retrievalMisses: 0,
    retrievalEvaluated: 0,
    ragActivations: 0,
    fullTextInjections: 0,
    ragChunksInjectedTotal: 0,
    ragChunksInjectedSamples: 0,
    ragScoreTotal: 0,
    ragScoreSamples: 0,
    ragHydrations: 0,
    ragHydrationCacheHits: 0,
    citationAppendedResponses: 0,
    lowConfidenceGroundedResponses: 0,
    turnLatencyTotalMs: 0,
    turnLatencySamples: 0,
    failuresByType: {},
    toolStatsByName: {},
  };
}

function cloneToolStats(value) {
  const clone = {};
  for (const key of Object.keys(value || {}).sort()) {
    const item = value[key] || { total: 0, failed: 0 };
    clone[key] = { total: item.total || 0, failed: item.failed || 0 };
  }
  return clone;
}

function safeRate(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }
  return Math.round((numerator / denominator) * 10000) / 10000;
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

module.exports = {
  createMetricsAggregator,
};
