"use strict";

const DEFAULT_RETRIEVAL_POLICY = Object.freeze({
  RETRIEVAL_ENABLED: true,
  RETRIEVAL_TOP_K: 6,
  RETRIEVAL_MAX_CHARS: 1400,
  RETRIEVAL_MIN_SCORE: 0.1,
  RETRIEVAL_MAX_CHUNKS_PER_DOC: 2,
  RETRIEVAL_CHUNK_SIZE: 700,
  RETRIEVAL_CHUNK_OVERLAP: 140,
  RETRIEVAL_CACHE_MAX_SESSIONS: 120,
  RETRIEVAL_CACHE_MAX_DOCS_PER_SESSION: 80,
  RAG_FULL_TEXT_BUDGET: 8000,
  RAG_CHUNK_BUDGET: 4000,
  RAG_TOP_K: 8,
  RAG_MIN_SCORE: 0.08,
  RAG_MAX_CHUNKS_PER_DOC: 3,
  RAG_CURRENT_DOC_BUDGET: 5000,
  RAG_FTS5_WEIGHT: 0.4,
  RAG_TFIDF_WEIGHT: 0.6,
  RAG_OVERLAP_BONUS: 0.1,
});

function createRetrievalPolicy(overrides = {}) {
  const envPolicy = {
    RETRIEVAL_ENABLED: readBoolean("RETRIEVAL_ENABLED", DEFAULT_RETRIEVAL_POLICY.RETRIEVAL_ENABLED),
    RETRIEVAL_TOP_K: readInteger("RETRIEVAL_TOP_K", DEFAULT_RETRIEVAL_POLICY.RETRIEVAL_TOP_K),
    RETRIEVAL_MAX_CHARS: readInteger(
      "RETRIEVAL_MAX_CHARS",
      DEFAULT_RETRIEVAL_POLICY.RETRIEVAL_MAX_CHARS,
    ),
    RETRIEVAL_MIN_SCORE: readFloat(
      "RETRIEVAL_MIN_SCORE",
      DEFAULT_RETRIEVAL_POLICY.RETRIEVAL_MIN_SCORE,
    ),
    RETRIEVAL_MAX_CHUNKS_PER_DOC: readInteger(
      "RETRIEVAL_MAX_CHUNKS_PER_DOC",
      DEFAULT_RETRIEVAL_POLICY.RETRIEVAL_MAX_CHUNKS_PER_DOC,
    ),
    RETRIEVAL_CHUNK_SIZE: readInteger(
      "RETRIEVAL_CHUNK_SIZE",
      DEFAULT_RETRIEVAL_POLICY.RETRIEVAL_CHUNK_SIZE,
    ),
    RETRIEVAL_CHUNK_OVERLAP: readInteger(
      "RETRIEVAL_CHUNK_OVERLAP",
      DEFAULT_RETRIEVAL_POLICY.RETRIEVAL_CHUNK_OVERLAP,
    ),
    RETRIEVAL_CACHE_MAX_SESSIONS: readInteger(
      "RETRIEVAL_CACHE_MAX_SESSIONS",
      DEFAULT_RETRIEVAL_POLICY.RETRIEVAL_CACHE_MAX_SESSIONS,
    ),
    RETRIEVAL_CACHE_MAX_DOCS_PER_SESSION: readInteger(
      "RETRIEVAL_CACHE_MAX_DOCS_PER_SESSION",
      DEFAULT_RETRIEVAL_POLICY.RETRIEVAL_CACHE_MAX_DOCS_PER_SESSION,
    ),
    RAG_FULL_TEXT_BUDGET: readInteger("RAG_FULL_TEXT_BUDGET", DEFAULT_RETRIEVAL_POLICY.RAG_FULL_TEXT_BUDGET),
    RAG_CHUNK_BUDGET: readInteger("RAG_CHUNK_BUDGET", DEFAULT_RETRIEVAL_POLICY.RAG_CHUNK_BUDGET),
    RAG_TOP_K: readInteger("RAG_TOP_K", DEFAULT_RETRIEVAL_POLICY.RAG_TOP_K),
    RAG_MIN_SCORE: readFloat("RAG_MIN_SCORE", DEFAULT_RETRIEVAL_POLICY.RAG_MIN_SCORE),
    RAG_MAX_CHUNKS_PER_DOC: readInteger("RAG_MAX_CHUNKS_PER_DOC", DEFAULT_RETRIEVAL_POLICY.RAG_MAX_CHUNKS_PER_DOC),
    RAG_CURRENT_DOC_BUDGET: readInteger("RAG_CURRENT_DOC_BUDGET", DEFAULT_RETRIEVAL_POLICY.RAG_CURRENT_DOC_BUDGET),
    RAG_FTS5_WEIGHT: readFloat("RAG_FTS5_WEIGHT", DEFAULT_RETRIEVAL_POLICY.RAG_FTS5_WEIGHT),
    RAG_TFIDF_WEIGHT: readFloat("RAG_TFIDF_WEIGHT", DEFAULT_RETRIEVAL_POLICY.RAG_TFIDF_WEIGHT),
    RAG_OVERLAP_BONUS: readFloat("RAG_OVERLAP_BONUS", DEFAULT_RETRIEVAL_POLICY.RAG_OVERLAP_BONUS),
  };

  const merged = { ...DEFAULT_RETRIEVAL_POLICY, ...envPolicy, ...normalizeOverrides(overrides) };
  const chunkSize = normalizePositiveInt(merged.RETRIEVAL_CHUNK_SIZE, DEFAULT_RETRIEVAL_POLICY.RETRIEVAL_CHUNK_SIZE);
  const chunkOverlap = normalizeChunkOverlap(
    merged.RETRIEVAL_CHUNK_OVERLAP,
    chunkSize,
    DEFAULT_RETRIEVAL_POLICY.RETRIEVAL_CHUNK_OVERLAP,
  );

  return Object.freeze({
    RETRIEVAL_ENABLED: Boolean(merged.RETRIEVAL_ENABLED),
    RETRIEVAL_TOP_K: normalizePositiveInt(
      merged.RETRIEVAL_TOP_K,
      DEFAULT_RETRIEVAL_POLICY.RETRIEVAL_TOP_K,
    ),
    RETRIEVAL_MAX_CHARS: normalizePositiveInt(
      merged.RETRIEVAL_MAX_CHARS,
      DEFAULT_RETRIEVAL_POLICY.RETRIEVAL_MAX_CHARS,
    ),
    RETRIEVAL_MIN_SCORE: normalizeScore(
      merged.RETRIEVAL_MIN_SCORE,
      DEFAULT_RETRIEVAL_POLICY.RETRIEVAL_MIN_SCORE,
    ),
    RETRIEVAL_MAX_CHUNKS_PER_DOC: normalizePositiveInt(
      merged.RETRIEVAL_MAX_CHUNKS_PER_DOC,
      DEFAULT_RETRIEVAL_POLICY.RETRIEVAL_MAX_CHUNKS_PER_DOC,
    ),
    RETRIEVAL_CHUNK_SIZE: chunkSize,
    RETRIEVAL_CHUNK_OVERLAP: chunkOverlap,
    RETRIEVAL_CACHE_MAX_SESSIONS: normalizePositiveInt(
      merged.RETRIEVAL_CACHE_MAX_SESSIONS,
      DEFAULT_RETRIEVAL_POLICY.RETRIEVAL_CACHE_MAX_SESSIONS,
    ),
    RETRIEVAL_CACHE_MAX_DOCS_PER_SESSION: normalizePositiveInt(
      merged.RETRIEVAL_CACHE_MAX_DOCS_PER_SESSION,
      DEFAULT_RETRIEVAL_POLICY.RETRIEVAL_CACHE_MAX_DOCS_PER_SESSION,
    ),
    RAG_FULL_TEXT_BUDGET: normalizePositiveInt(
      merged.RAG_FULL_TEXT_BUDGET,
      DEFAULT_RETRIEVAL_POLICY.RAG_FULL_TEXT_BUDGET,
    ),
    RAG_CHUNK_BUDGET: normalizePositiveInt(
      merged.RAG_CHUNK_BUDGET,
      DEFAULT_RETRIEVAL_POLICY.RAG_CHUNK_BUDGET,
    ),
    RAG_TOP_K: normalizePositiveInt(
      merged.RAG_TOP_K,
      DEFAULT_RETRIEVAL_POLICY.RAG_TOP_K,
    ),
    RAG_MIN_SCORE: normalizeScore(
      merged.RAG_MIN_SCORE,
      DEFAULT_RETRIEVAL_POLICY.RAG_MIN_SCORE,
    ),
    RAG_MAX_CHUNKS_PER_DOC: normalizePositiveInt(
      merged.RAG_MAX_CHUNKS_PER_DOC,
      DEFAULT_RETRIEVAL_POLICY.RAG_MAX_CHUNKS_PER_DOC,
    ),
    RAG_CURRENT_DOC_BUDGET: normalizePositiveInt(
      merged.RAG_CURRENT_DOC_BUDGET,
      DEFAULT_RETRIEVAL_POLICY.RAG_CURRENT_DOC_BUDGET,
    ),
    RAG_FTS5_WEIGHT: normalizeScore(
      merged.RAG_FTS5_WEIGHT,
      DEFAULT_RETRIEVAL_POLICY.RAG_FTS5_WEIGHT,
    ),
    RAG_TFIDF_WEIGHT: normalizeScore(
      merged.RAG_TFIDF_WEIGHT,
      DEFAULT_RETRIEVAL_POLICY.RAG_TFIDF_WEIGHT,
    ),
    RAG_OVERLAP_BONUS: normalizeScore(
      merged.RAG_OVERLAP_BONUS,
      DEFAULT_RETRIEVAL_POLICY.RAG_OVERLAP_BONUS,
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

function readBoolean(key, fallback) {
  const value = readEnvValue(key);
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function readInteger(key, fallback) {
  const value = readEnvValue(key);
  return normalizePositiveInt(value, fallback);
}

function readFloat(key, fallback) {
  const value = readEnvValue(key);
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeChunkOverlap(value, chunkSize, fallback) {
  const parsed = normalizePositiveInt(value, fallback);
  return Math.max(1, Math.min(parsed, Math.max(chunkSize - 1, 1)));
}

function normalizeScore(value, fallback) {
  const parsed = Number.parseFloat(String(value ?? fallback));
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, 0), 1);
}

const retrievalPolicy = createRetrievalPolicy();

module.exports = {
  ...retrievalPolicy,
  DEFAULT_RETRIEVAL_POLICY,
  createRetrievalPolicy,
};
