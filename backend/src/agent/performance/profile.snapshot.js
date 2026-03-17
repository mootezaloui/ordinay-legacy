"use strict";

function buildPerformanceSnapshot({
  metrics,
  latency,
  cacheStats,
  memoryStats,
  activeStats,
} = {}) {
  const metricsRow = normalizeRecord(metrics);
  const counters = normalizeRecord(metricsRow.counters);
  const rates = normalizeRecord(metricsRow.rates);
  const latencySnapshot = normalizeLatencySnapshot(latency);
  const caches = normalizeCacheStats(cacheStats);
  const memory = normalizeMemoryStats(memoryStats);
  const retrievalHits = normalizeNumber(counters.retrievalHits);
  const retrievalMisses = normalizeNumber(counters.retrievalMisses);
  const retrievalEvaluated = retrievalHits + retrievalMisses;

  return {
    schemaVersion: "v1",
    generatedAt: new Date().toISOString(),
    turns: {
      total: normalizeNumber(counters.turnsTotal),
      succeeded: normalizeNumber(counters.turnsSucceeded),
      failed: normalizeNumber(counters.turnsFailed),
      avgLatencyMs: normalizeNumber(rates.averageTurnLatencyMs),
      failureRate: normalizeNumber(rates.turnFailureRate),
    },
    hotPaths: {
      avgLlmGenerateLatencyMs: averageLatencyForLabel(latencySnapshot, "llm_generate"),
      avgToolExecuteLatencyMs: averageLatencyForLabel(latencySnapshot, "tool_execute"),
      avgPromptAssemblyLatencyMs: averageLatencyForLabel(latencySnapshot, "prompt_assembly"),
    },
    retrieval: {
      hits: retrievalHits,
      misses: retrievalMisses,
      hitRatio: retrievalEvaluated > 0 ? round4(retrievalHits / retrievalEvaluated) : 0,
    },
    rag: buildRagSnapshot(caches),
    caches,
    memory,
    active: {
      sessions: normalizeNumber(caches.sessionCache?.size),
      retrievalChunks: normalizeNumber(caches.retrievalIndex?.chunkCount),
      retrievalSources: normalizeNumber(caches.retrievalIndex?.sourceCount),
      retrievalSessions: normalizeNumber(caches.retrievalIndex?.sessionCount),
      ...normalizeRecord(activeStats),
    },
  };
}

function buildRagSnapshot(caches) {
  const rs = normalizeRecord(caches.ragStats);
  const activations = normalizeNumber(rs.ragActivations);
  const fullText = normalizeNumber(rs.fullTextInjections);
  const totalDecisions = activations + fullText;
  const chunkSamples = normalizeNumber(rs.ragChunksInjectedSamples);
  const scoreSamples = normalizeNumber(rs.ragScoreSamples);
  return {
    activations,
    fullTextInjections: fullText,
    activationRate: totalDecisions > 0 ? round4(activations / totalDecisions) : 0,
    avgChunksInjected: chunkSamples > 0 ? round2(normalizeNumber(rs.ragChunksInjectedTotal) / chunkSamples) : 0,
    avgScore: scoreSamples > 0 ? round4(normalizeNumber(rs.ragScoreTotal) / scoreSamples) : 0,
    hydrations: normalizeNumber(rs.ragHydrations),
    hydrationCacheHits: normalizeNumber(rs.ragHydrationCacheHits),
  };
}

function normalizeLatencySnapshot(value) {
  if (value && typeof value.snapshot === "function") {
    return normalizeRecord(value.snapshot());
  }
  return normalizeRecord(value);
}

function averageLatencyForLabel(snapshot, label) {
  const durations = normalizeRecord(snapshot.durationsMs);
  const counts = normalizeRecord(snapshot.counts);
  const total = normalizeNumber(durations[label]);
  const count = normalizeNumber(counts[label]);
  if (count <= 0) {
    return 0;
  }
  return round2(total / count);
}

function normalizeCacheStats(value) {
  const input = normalizeRecord(value);
  const output = {};
  for (const key of Object.keys(input).sort()) {
    output[key] = normalizeRecord(input[key]);
  }
  return output;
}

function normalizeMemoryStats(value) {
  const row = normalizeRecord(value);
  return {
    available: row.available === true,
    heapUsedMb: normalizeNumber(row.heapUsedMb),
    heapTotalMb: normalizeNumber(row.heapTotalMb),
    rssMb: normalizeNumber(row.rssMb),
    externalMb: normalizeNumber(row.externalMb),
  };
}

function normalizeRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value;
}

function normalizeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value) {
  return Math.round(normalizeNumber(value) * 100) / 100;
}

function round4(value) {
  return Math.round(normalizeNumber(value) * 10000) / 10000;
}

module.exports = {
  buildPerformanceSnapshot,
};
