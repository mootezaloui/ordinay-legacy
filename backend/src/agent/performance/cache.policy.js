"use strict";

const DEFAULT_CACHE_POLICY = Object.freeze({
  SESSION_CACHE_MAX: 200,
  RETRIEVAL_CACHE_MAX_SESSIONS: 120,
  RETRIEVAL_CACHE_MAX_DOCS_PER_SESSION: 80,
  SUMMARY_CACHE_MAX: 256,
  CACHE_EVICT_AFTER_TURNS: 120,
  MEMORY_WARNING_HEAP_MB: 768,
  PERFORMANCE_SNAPSHOT_EVERY_N_TURNS: 100,
});

function createCachePolicy(overrides = {}) {
  const envPolicy = {
    SESSION_CACHE_MAX: readInteger("SESSION_CACHE_MAX", DEFAULT_CACHE_POLICY.SESSION_CACHE_MAX),
    RETRIEVAL_CACHE_MAX_SESSIONS: readInteger(
      "RETRIEVAL_CACHE_MAX_SESSIONS",
      DEFAULT_CACHE_POLICY.RETRIEVAL_CACHE_MAX_SESSIONS,
    ),
    RETRIEVAL_CACHE_MAX_DOCS_PER_SESSION: readInteger(
      "RETRIEVAL_CACHE_MAX_DOCS_PER_SESSION",
      DEFAULT_CACHE_POLICY.RETRIEVAL_CACHE_MAX_DOCS_PER_SESSION,
    ),
    SUMMARY_CACHE_MAX: readInteger("SUMMARY_CACHE_MAX", DEFAULT_CACHE_POLICY.SUMMARY_CACHE_MAX),
    CACHE_EVICT_AFTER_TURNS: readInteger(
      "CACHE_EVICT_AFTER_TURNS",
      DEFAULT_CACHE_POLICY.CACHE_EVICT_AFTER_TURNS,
    ),
    MEMORY_WARNING_HEAP_MB: readInteger(
      "MEMORY_WARNING_HEAP_MB",
      DEFAULT_CACHE_POLICY.MEMORY_WARNING_HEAP_MB,
    ),
    PERFORMANCE_SNAPSHOT_EVERY_N_TURNS: readInteger(
      "PERFORMANCE_SNAPSHOT_EVERY_N_TURNS",
      DEFAULT_CACHE_POLICY.PERFORMANCE_SNAPSHOT_EVERY_N_TURNS,
    ),
  };

  const merged = {
    ...DEFAULT_CACHE_POLICY,
    ...envPolicy,
    ...normalizeOverrides(overrides),
  };

  return Object.freeze({
    SESSION_CACHE_MAX: normalizePositiveInt(
      merged.SESSION_CACHE_MAX,
      DEFAULT_CACHE_POLICY.SESSION_CACHE_MAX,
    ),
    RETRIEVAL_CACHE_MAX_SESSIONS: normalizePositiveInt(
      merged.RETRIEVAL_CACHE_MAX_SESSIONS,
      DEFAULT_CACHE_POLICY.RETRIEVAL_CACHE_MAX_SESSIONS,
    ),
    RETRIEVAL_CACHE_MAX_DOCS_PER_SESSION: normalizePositiveInt(
      merged.RETRIEVAL_CACHE_MAX_DOCS_PER_SESSION,
      DEFAULT_CACHE_POLICY.RETRIEVAL_CACHE_MAX_DOCS_PER_SESSION,
    ),
    SUMMARY_CACHE_MAX: normalizePositiveInt(
      merged.SUMMARY_CACHE_MAX,
      DEFAULT_CACHE_POLICY.SUMMARY_CACHE_MAX,
    ),
    CACHE_EVICT_AFTER_TURNS: normalizePositiveInt(
      merged.CACHE_EVICT_AFTER_TURNS,
      DEFAULT_CACHE_POLICY.CACHE_EVICT_AFTER_TURNS,
    ),
    MEMORY_WARNING_HEAP_MB: normalizePositiveInt(
      merged.MEMORY_WARNING_HEAP_MB,
      DEFAULT_CACHE_POLICY.MEMORY_WARNING_HEAP_MB,
    ),
    PERFORMANCE_SNAPSHOT_EVERY_N_TURNS: normalizePositiveInt(
      merged.PERFORMANCE_SNAPSHOT_EVERY_N_TURNS,
      DEFAULT_CACHE_POLICY.PERFORMANCE_SNAPSHOT_EVERY_N_TURNS,
    ),
  });
}

function normalizeOverrides(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value;
}

function readEnvValue(key) {
  if (!process || !process.env) {
    return undefined;
  }
  return process.env[key] ?? process.env[`AGENT_${key}`];
}

function readInteger(key, fallback) {
  const value = readEnvValue(key);
  return normalizePositiveInt(value, fallback);
}

function normalizePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const cachePolicy = createCachePolicy();

module.exports = {
  ...cachePolicy,
  DEFAULT_CACHE_POLICY,
  createCachePolicy,
};
