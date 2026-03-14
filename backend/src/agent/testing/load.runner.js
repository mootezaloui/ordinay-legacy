"use strict";

const { getScenarioFixture } = require("./scenario.fixtures");
const { runScenario } = require("./scenario.runner");
const { createLiveRuntime } = require("./runtime.resolver");

async function runLoadTest(config = {}, options = {}) {
  const concurrency = normalizePositiveInt(config.concurrency, 4);
  const turnsPerWorker = normalizePositiveInt(config.turnsPerWorker, 10);
  const baseFixture = resolveFixture(config.scenario);
  const runtime = options.runtime || createLiveRuntime();
  const startedAt = Date.now();
  const latencies = [];

  const counters = {
    success: 0,
    failure: 0,
    rateLimited: 0,
  };

  const memoryBefore = snapshotMemory();
  await Promise.all(
    Array.from({ length: concurrency }, (_, index) =>
      runWorker(index, turnsPerWorker, baseFixture, runtime, options, counters, latencies),
    ),
  );
  const memoryAfter = snapshotMemory();

  return {
    ok: counters.failure === 0,
    config: {
      concurrency,
      turnsPerWorker,
      scenarioId: baseFixture.id,
    },
    counters,
    latency: {
      avgMs: average(latencies),
      p95Ms: percentile(latencies, 95),
      sampleCount: latencies.length,
    },
    memory: {
      before: memoryBefore,
      after: memoryAfter,
      heapDelta: memoryAfter.heapUsed - memoryBefore.heapUsed,
      rssDelta: memoryAfter.rss - memoryBefore.rss,
    },
    durationMs: Date.now() - startedAt,
  };
}

async function runWorker(workerIndex, turnsPerWorker, baseFixture, runtime, options, counters, latencies) {
  for (let turnIndex = 0; turnIndex < turnsPerWorker; turnIndex += 1) {
    const start = Date.now();
    const fixture = materializeWorkerFixture(baseFixture, workerIndex, turnIndex);
    try {
      const result = await runScenario(fixture, {
        ...options,
        runtime,
        skipAssertions: true,
      });
      counters.success += 1;
      if (isRateLimitedResult(result)) {
        counters.rateLimited += 1;
      }
    } catch (error) {
      counters.failure += 1;
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : String(error || "unknown load error");
      if (/rate limit/i.test(message)) {
        counters.rateLimited += 1;
      }
    } finally {
      latencies.push(Date.now() - start);
    }
  }
}

function resolveFixture(scenario) {
  if (!scenario) {
    return getScenarioFixture("simple_read_only_query");
  }
  if (typeof scenario === "string") {
    return getScenarioFixture(scenario);
  }
  if (typeof scenario === "object") {
    return scenario;
  }
  throw new Error("runLoadTest scenario must be a fixture id or fixture object.");
}

function materializeWorkerFixture(baseFixture, workerIndex, turnIndex) {
  const seed = baseFixture.input || {};
  const sessionId = `${seed.sessionId || baseFixture.id}_w${workerIndex}`;
  const turnId = `${seed.turnId || baseFixture.id}_w${workerIndex}_t${turnIndex}_${Date.now()}`;
  return {
    ...baseFixture,
    input: {
      ...seed,
      sessionId,
      turnId,
    },
  };
}

function isRateLimitedResult(result) {
  const errors = Array.isArray(result?.events)
    ? result.events.filter((event) => event.event === "error")
    : [];
  return errors.some((event) => /rate limit/i.test(String(event?.data?.message || "")));
}

function snapshotMemory() {
  try {
    const mem = process.memoryUsage();
    return {
      rss: Number(mem.rss || 0),
      heapTotal: Number(mem.heapTotal || 0),
      heapUsed: Number(mem.heapUsed || 0),
      external: Number(mem.external || 0),
      arrayBuffers: Number(mem.arrayBuffers || 0),
    };
  } catch {
    return { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 };
  }
}

function average(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }
  const total = values.reduce((sum, value) => sum + Number(value || 0), 0);
  return total / values.length;
}

function percentile(values, pct) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }
  const sorted = [...values].map((value) => Number(value || 0)).sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1));
  return sorted[rank];
}

function normalizePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

module.exports = {
  runLoadTest,
};

