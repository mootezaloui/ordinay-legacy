"use strict";

const { classifyFailure } = require("./failure.taxonomy");
const { createHealthPolicy, evaluateHealth, shouldEmitHealthSnapshot } = require("./health.policy");
const { createLatencyTracker } = require("./latency.tracker");
const { createMetricsAggregator } = require("./metrics.aggregator");
const { buildTurnTrace } = require("./turn.trace");

function createObservabilityRuntime(options = {}) {
  const policy = createHealthPolicy(options.policyOverrides);
  const metrics = createMetricsAggregator();
  let turnCounter = 0;

  function safe(label, fallback, fn) {
    try {
      return fn();
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : String(error || "unknown observability error");
      console.warn(`[agent.observability] ${label} failed: ${message}`);
      return fallback;
    }
  }

  return {
    policy,
    createLatencyTracker() {
      return safe("createLatencyTracker", createLatencyTracker(), () => createLatencyTracker());
    },
    classifyFailure(errorOrResult, context) {
      return safe("classifyFailure", classifyFailure(errorOrResult, context), () =>
        classifyFailure(errorOrResult, context),
      );
    },
    recordTool(metricData) {
      return safe("recordTool", undefined, () => metrics.recordTool(metricData));
    },
    recordTurn(metricData) {
      return safe("recordTurn", undefined, () => {
        turnCounter += 1;
        metrics.recordTurn(metricData);
      });
    },
    buildTurnTrace(traceInput) {
      return safe("buildTurnTrace", null, () => buildTurnTrace(traceInput));
    },
    snapshotMetrics() {
      return safe("snapshotMetrics", metrics.snapshot(), () => metrics.snapshot());
    },
    resetMetrics() {
      return safe("resetMetrics", undefined, () => {
        turnCounter = 0;
        metrics.reset();
      });
    },
    getTurnCount() {
      return turnCounter;
    },
    maybeBuildHealthSnapshot() {
      return safe("maybeBuildHealthSnapshot", null, () => {
        if (!shouldEmitHealthSnapshot(turnCounter, policy)) {
          return null;
        }
        const snapshot = metrics.snapshot();
        const health = evaluateHealth(snapshot, policy);
        return {
          generatedAt: new Date().toISOString(),
          turnCount: turnCounter,
          policy,
          metrics: snapshot,
          health,
        };
      });
    },
  };
}

module.exports = {
  createObservabilityRuntime,
  classifyFailure,
  createLatencyTracker,
  createMetricsAggregator,
  buildTurnTrace,
  createHealthPolicy,
  evaluateHealth,
  shouldEmitHealthSnapshot,
};
