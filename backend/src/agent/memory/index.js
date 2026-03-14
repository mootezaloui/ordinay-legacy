"use strict";

const memoryPolicy = require("./memory.policy");
const { createContextAssembler } = require("./context.assembler");
const { createEntityTracker } = require("./entity.tracker");
const { createSummarizer } = require("./summarizer");

function createMemoryRuntime({
  llmProvider,
  policyOverrides = {},
  retrievalRuntime,
  groundingRuntime,
  performanceRuntime,
  operationsRuntime,
} = {}) {
  const policy = {
    ...memoryPolicy,
    ...normalizePolicyOverrides(policyOverrides),
  };
  const summaryCacheMax = normalizePositiveInt(
    policy.SUMMARY_CACHE_MAX || performanceRuntime?.policy?.SUMMARY_CACHE_MAX,
    128,
  );
  const normalizedRetrievalRuntime = normalizeRetrievalRuntime(retrievalRuntime);
  const normalizedGroundingRuntime = normalizeGroundingRuntime(groundingRuntime);
  const cacheFactory = createCacheFactory(performanceRuntime, policy);
  const summaryBlockCache = cacheFactory("memory.context.summaryBlock", summaryCacheMax);
  const entityDigestCache = cacheFactory("memory.context.entityDigest", summaryCacheMax);
  const pendingBlockCache = cacheFactory("memory.context.pendingBlock", summaryCacheMax);
  const summaryDedupeCache = cacheFactory("memory.summarizer.dedupe", summaryCacheMax);

  return {
    policy,
    contextAssembler: createContextAssembler({
      ...policy,
      retrievalRuntime: normalizedRetrievalRuntime,
      groundingRuntime: normalizedGroundingRuntime,
      operationsRuntime,
      summaryBlockCache,
      entityDigestCache,
      pendingBlockCache,
    }),
    entityTracker: createEntityTracker(policy),
    summarizer: createSummarizer({
      llmProvider,
      policy: { ...policy, SUMMARY_CACHE_MAX: summaryCacheMax },
      dedupeCache: summaryDedupeCache,
      operationsRuntime,
    }),
    retrieval: normalizedRetrievalRuntime,
    grounding: normalizedGroundingRuntime,
  };
}

function normalizePolicyOverrides(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value;
}

function normalizeRetrievalRuntime(value) {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  return value;
}

function normalizeGroundingRuntime(value) {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  return value;
}

function createCacheFactory(performanceRuntime, policy) {
  if (
    !performanceRuntime ||
    typeof performanceRuntime.createCache !== "function"
  ) {
    return () => null;
  }

  return (name, fallbackMax) => {
    const max = normalizePositiveInt(policy?.SUMMARY_CACHE_MAX, fallbackMax || 128);
    try {
      return performanceRuntime.createCache(name, max);
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : String(error || "unknown cache creation error");
      console.warn(`[agent.performance] memory cache "${name}" unavailable: ${message}`);
      return null;
    }
  };
}

function normalizePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

module.exports = {
  ...memoryPolicy,
  createMemoryRuntime,
  createContextAssembler,
  createEntityTracker,
  createSummarizer,
};
