"use strict";

const cachePolicyModule = require("./cache.policy");
const { createLRUCache } = require("./lru.cache");
const { getMemoryStats, shouldTrimCaches } = require("./memory.guard");
const { buildPerformanceSnapshot } = require("./profile.snapshot");
const hotpath = require("./hotpath.optimizer");

function createPerformanceRuntime({ policyOverrides = {} } = {}) {
  const policy = cachePolicyModule.createCachePolicy(policyOverrides);
  const cacheProviders = new Map();
  let turnCounter = 0;

  function safe(label, fallback, fn) {
    try {
      return fn();
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : String(error || "unknown performance error");
      console.warn(`[agent.performance] ${label} failed: ${message}`);
      return fallback;
    }
  }

  function registerCacheProvider(name, provider) {
    const key = normalizeName(name);
    if (!key) {
      return false;
    }

    const normalized = normalizeProvider(provider);
    if (!normalized) {
      return false;
    }

    cacheProviders.set(key, normalized);
    return true;
  }

  function createCache(name, max) {
    const key = normalizeName(name) || `cache_${cacheProviders.size + 1}`;
    const limit = normalizePositiveInt(max, policy.SUMMARY_CACHE_MAX);
    const cache = createLRUCache({ name: key, max: limit });
    registerCacheProvider(key, cache);
    return cache;
  }

  function getCacheStats() {
    const output = {};
    for (const [name, provider] of cacheProviders.entries()) {
      const stats = safe(`cache stats (${name})`, {}, () => provider.stats());
      output[name] = normalizeRecord(stats);
    }
    return output;
  }

  function maybeTrimCaches() {
    return safe("maybeTrimCaches", { trimmed: false, removedEntries: 0 }, () => {
      const cacheStats = getCacheStats();
      const memoryStats = getMemoryStats();
      if (!shouldTrimCaches(policy, { cacheStats, memoryStats })) {
        return { trimmed: false, removedEntries: 0 };
      }

      let removedEntries = 0;
      for (const [name, provider] of cacheProviders.entries()) {
        if (typeof provider.clear !== "function") {
          continue;
        }
        const removed = safe(`cache clear (${name})`, 0, () => provider.clear());
        removedEntries += normalizeNumber(removed);
      }
      return { trimmed: true, removedEntries };
    });
  }

  function recordTurnAndMaybeSnapshot({ metrics, latency, activeStats } = {}) {
    turnCounter += 1;
    maybeTrimCaches();

    const cadence = normalizePositiveInt(
      policy.PERFORMANCE_SNAPSHOT_EVERY_N_TURNS,
      cachePolicyModule.DEFAULT_CACHE_POLICY.PERFORMANCE_SNAPSHOT_EVERY_N_TURNS,
    );
    if (turnCounter % cadence !== 0) {
      return null;
    }

    return safe("recordTurnAndMaybeSnapshot", null, () =>
      buildPerformanceSnapshot({
        metrics: normalizeRecord(metrics),
        latency,
        cacheStats: getCacheStats(),
        memoryStats: getMemoryStats(),
        activeStats: normalizeRecord(activeStats),
      }),
    );
  }

  return {
    policy,
    hotpath,
    registerCacheProvider,
    createCache,
    getCacheStats,
    getMemoryStats,
    maybeTrimCaches,
    recordTurnAndMaybeSnapshot,
    getTurnCount() {
      return turnCounter;
    },
  };
}

function normalizeProvider(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "function") {
    return { stats: value };
  }

  if (typeof value !== "object") {
    return null;
  }

  if (typeof value.stats === "function") {
    return {
      stats: () => value.stats(),
      clear: typeof value.clear === "function" ? () => value.clear() : undefined,
    };
  }

  if (typeof value.getCacheStats === "function") {
    return {
      stats: () => value.getCacheStats(),
      clear: typeof value.clearCache === "function" ? () => value.clearCache() : undefined,
    };
  }

  return null;
}

function normalizeName(value) {
  const text = String(value || "").trim();
  return text || "";
}

function normalizePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value;
}

module.exports = {
  ...cachePolicyModule,
  ...hotpath,
  createPerformanceRuntime,
  createLRUCache,
  getMemoryStats,
  shouldTrimCaches,
  buildPerformanceSnapshot,
};
