"use strict";

const { chunkText } = require("./chunker");
const { embedText, normalizeText, scoreSimilarity } = require("./simple.embedder");
const {
  RETRIEVAL_CHUNK_OVERLAP,
  RETRIEVAL_CHUNK_SIZE,
  RETRIEVAL_CACHE_MAX_DOCS_PER_SESSION,
  RETRIEVAL_CACHE_MAX_SESSIONS,
  RETRIEVAL_MAX_CHUNKS_PER_DOC,
  RETRIEVAL_MIN_SCORE,
  RETRIEVAL_TOP_K,
} = require("./retrieval.policy");

function createRetrievalIndex(policy = {}) {
  const config = normalizePolicy(policy);
  const chunksById = new Map();
  const chunkIdsBySourceId = new Map();
  const chunkIdsByDocumentId = new Map();
  const documentSessionById = new Map();
  const documentsBySession = new Map();
  const sessionTouchOrder = new Map();
  let touchTick = 0;
  const stats = {
    addOrReplaceCalls: 0,
    sourceReplacements: 0,
    chunksInserted: 0,
    chunksRemoved: 0,
    skippedEmpty: 0,
    queries: 0,
    queryHits: 0,
    queryMisses: 0,
    sessionEvictions: 0,
    documentEvictions: 0,
  };

  function addOrReplaceBySource({ sourceId, documentId, text, metadata } = {}) {
    stats.addOrReplaceCalls += 1;
    const safeSourceId = normalizeNonEmpty(sourceId, "sourceId");
    const safeDocumentId = normalizeNonEmpty(documentId, "documentId");
    const safeText = String(text || "");
    const safeMetadata = isRecord(metadata) ? metadata : {};
    const sessionKey = inferSessionKey(safeDocumentId, safeMetadata);

    const hadExisting = chunkIdsBySourceId.has(safeSourceId);
    removeSourceChunks(safeSourceId);
    if (hadExisting) {
      stats.sourceReplacements += 1;
    }

    if (!safeText.trim()) {
      stats.skippedEmpty += 1;
      touchDocumentSession(sessionKey, safeDocumentId);
      enforceSessionCaps();
      return { sourceId: safeSourceId, documentId: safeDocumentId, chunkCount: 0, replaced: true };
    }

    const chunks = chunkText({
      sourceId: safeSourceId,
      documentId: safeDocumentId,
      text: safeText,
      metadata: safeMetadata,
      chunkSize: config.chunkSize,
      chunkOverlap: config.chunkOverlap,
    });

    const seenTexts = new Set();
    let inserted = 0;

    for (const chunk of chunks) {
      const normalizedChunkText = normalizeText(chunk.text);
      if (!normalizedChunkText) {
        continue;
      }

      const dedupeKey = `${safeSourceId}::${normalizedChunkText}`;
      if (seenTexts.has(dedupeKey)) {
        continue;
      }
      seenTexts.add(dedupeKey);

      const chunkEmbedding = embedText(chunk.text);
      if (chunkEmbedding.tokenCount === 0) {
        continue;
      }

      const chunkId = `${safeSourceId}:chunk:${chunk.chunkIndex}`;
      chunksById.set(chunkId, {
        chunkId,
        sourceId: safeSourceId,
        documentId: safeDocumentId,
        sessionKey,
        chunkIndex: chunk.chunkIndex,
        text: chunk.text,
        charStart: chunk.charStart,
        charEnd: chunk.charEnd,
        metadata: safeMetadata,
        embedding: chunkEmbedding,
      });
      addToSetMap(chunkIdsBySourceId, safeSourceId, chunkId);
      addToSetMap(chunkIdsByDocumentId, safeDocumentId, chunkId);
      inserted += 1;
    }
    documentSessionById.set(safeDocumentId, sessionKey);
    touchDocumentSession(sessionKey, safeDocumentId);
    enforceSessionCaps();
    stats.chunksInserted += inserted;

    return {
      sourceId: safeSourceId,
      documentId: safeDocumentId,
      chunkCount: inserted,
      replaced: true,
    };
  }

  function removeDocument(documentId) {
    const safeDocumentId = normalizeNonEmpty(documentId, "documentId");
    const sessionKey = documentSessionById.get(safeDocumentId);
    const chunkIds = chunkIdsByDocumentId.get(safeDocumentId);
    if (!chunkIds || chunkIds.size === 0) {
      cleanupDocumentTracking(safeDocumentId, sessionKey);
      return 0;
    }

    let removed = 0;
    for (const chunkId of [...chunkIds]) {
      const row = chunksById.get(chunkId);
      if (!row) {
        continue;
      }
      chunksById.delete(chunkId);
      removeFromSetMap(chunkIdsBySourceId, row.sourceId, chunkId);
      removeFromSetMap(chunkIdsByDocumentId, row.documentId, chunkId);
      removed += 1;
    }
    stats.chunksRemoved += removed;
    cleanupDocumentTracking(safeDocumentId, sessionKey);
    return removed;
  }

  function query({ text, topK, minScore, maxChunksPerDoc } = {}) {
    stats.queries += 1;
    const safeQueryText = String(text || "").trim();
    if (!safeQueryText) {
      stats.queryMisses += 1;
      return [];
    }

    const queryEmbedding = embedText(safeQueryText);
    if (queryEmbedding.tokenCount === 0) {
      stats.queryMisses += 1;
      return [];
    }

    const safeTopK = normalizePositiveInt(topK, config.topK);
    const safeMinScore = normalizeScore(minScore, config.minScore);
    const safeMaxPerDoc = normalizePositiveInt(maxChunksPerDoc, config.maxChunksPerDoc);

    const scored = [];
    for (const row of chunksById.values()) {
      const score = scoreSimilarity(queryEmbedding, row.embedding);
      if (score < safeMinScore) {
        continue;
      }
      scored.push({ ...row, score });
    }

    scored.sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if (left.documentId !== right.documentId) {
        return String(left.documentId).localeCompare(String(right.documentId));
      }
      if (left.sourceId !== right.sourceId) {
        return String(left.sourceId).localeCompare(String(right.sourceId));
      }
      return left.chunkIndex - right.chunkIndex;
    });

    const perDocCounts = new Map();
    const dedupe = new Set();
    const output = [];

    for (const row of scored) {
      const normalizedChunkText = normalizeText(row.text);
      const dedupeKey = `${row.sourceId}::${normalizedChunkText}`;
      if (dedupe.has(dedupeKey)) {
        continue;
      }

      const docCount = perDocCounts.get(row.documentId) || 0;
      if (docCount >= safeMaxPerDoc) {
        continue;
      }

      output.push({
        chunkId: row.chunkId,
        sourceId: row.sourceId,
        documentId: row.documentId,
        chunkIndex: row.chunkIndex,
        text: row.text,
        score: row.score,
        metadata: row.metadata,
      });

      perDocCounts.set(row.documentId, docCount + 1);
      dedupe.add(dedupeKey);

      if (output.length >= safeTopK) {
        break;
      }
    }

    if (output.length > 0) {
      stats.queryHits += 1;
    } else {
      stats.queryMisses += 1;
    }

    return output;
  }

  function getStats() {
    return {
      chunkCount: chunksById.size,
      sourceCount: chunkIdsBySourceId.size,
      documentCount: chunkIdsByDocumentId.size,
      sessionCount: documentsBySession.size,
      maxSessions: config.maxCacheSessions,
      maxDocsPerSession: config.maxDocsPerSession,
      queries: stats.queries,
      queryHits: stats.queryHits,
      queryMisses: stats.queryMisses,
      addOrReplaceCalls: stats.addOrReplaceCalls,
      sourceReplacements: stats.sourceReplacements,
      chunksInserted: stats.chunksInserted,
      chunksRemoved: stats.chunksRemoved,
      sessionEvictions: stats.sessionEvictions,
      documentEvictions: stats.documentEvictions,
    };
  }

  function clear() {
    const removed = chunksById.size;
    chunksById.clear();
    chunkIdsBySourceId.clear();
    chunkIdsByDocumentId.clear();
    documentSessionById.clear();
    documentsBySession.clear();
    sessionTouchOrder.clear();
    stats.chunksRemoved += removed;
    return removed;
  }

  function trimToPolicy({
    maxCacheSessions = config.maxCacheSessions,
    maxDocsPerSession = config.maxDocsPerSession,
  } = {}) {
    config.maxCacheSessions = normalizePositiveInt(maxCacheSessions, config.maxCacheSessions);
    config.maxDocsPerSession = normalizePositiveInt(maxDocsPerSession, config.maxDocsPerSession);
    enforceSessionCaps();
    return getStats();
  }

  function removeSourceChunks(sourceId) {
    const chunkIds = chunkIdsBySourceId.get(sourceId);
    if (!chunkIds || chunkIds.size === 0) {
      return;
    }

    for (const chunkId of [...chunkIds]) {
      const row = chunksById.get(chunkId);
      chunksById.delete(chunkId);
      if (row) {
        removeFromSetMap(chunkIdsByDocumentId, row.documentId, chunkId);
        if (!chunkIdsByDocumentId.has(row.documentId)) {
          cleanupDocumentTracking(row.documentId, row.sessionKey);
        }
      }
      stats.chunksRemoved += 1;
    }
    chunkIdsBySourceId.delete(sourceId);
  }

  function touchDocumentSession(sessionKey, documentId) {
    touchTick += 1;
    const safeSessionKey = sessionKey || "global";
    if (!documentsBySession.has(safeSessionKey)) {
      documentsBySession.set(safeSessionKey, new Map());
    }
    const docs = documentsBySession.get(safeSessionKey);
    docs.set(documentId, touchTick);
    sessionTouchOrder.set(safeSessionKey, touchTick);
    documentSessionById.set(documentId, safeSessionKey);
  }

  function enforceSessionCaps() {
    for (const [sessionKey, docs] of documentsBySession.entries()) {
      while (docs.size > config.maxDocsPerSession) {
        const oldestDocumentId = getOldestDocumentId(docs);
        if (!oldestDocumentId) {
          break;
        }
        const removed = removeDocument(oldestDocumentId);
        if (removed > 0 || !docs.has(oldestDocumentId)) {
          stats.documentEvictions += 1;
        } else {
          break;
        }
      }
      if (docs.size === 0) {
        documentsBySession.delete(sessionKey);
        sessionTouchOrder.delete(sessionKey);
      }
    }

    while (documentsBySession.size > config.maxCacheSessions) {
      const oldestSessionKey = getOldestSessionKey();
      if (!oldestSessionKey) {
        break;
      }
      const docs = documentsBySession.get(oldestSessionKey);
      const docIds = docs ? [...docs.keys()] : [];
      for (const documentId of docIds) {
        removeDocument(documentId);
      }
      documentsBySession.delete(oldestSessionKey);
      sessionTouchOrder.delete(oldestSessionKey);
      stats.sessionEvictions += 1;
    }
  }

  function getOldestDocumentId(docMap) {
    let oldestId = "";
    let oldestTick = Number.POSITIVE_INFINITY;
    for (const [documentId, touchedAt] of docMap.entries()) {
      const tick = Number(touchedAt);
      if (tick < oldestTick) {
        oldestTick = tick;
        oldestId = documentId;
      }
    }
    return oldestId;
  }

  function getOldestSessionKey() {
    let oldestSession = "";
    let oldestTick = Number.POSITIVE_INFINITY;
    for (const [sessionKey, touchedAt] of sessionTouchOrder.entries()) {
      const tick = Number(touchedAt);
      if (tick < oldestTick) {
        oldestTick = tick;
        oldestSession = sessionKey;
      }
    }
    return oldestSession;
  }

  function cleanupDocumentTracking(documentId, sessionKey) {
    const safeSessionKey = sessionKey || documentSessionById.get(documentId) || "global";
    documentSessionById.delete(documentId);
    const docs = documentsBySession.get(safeSessionKey);
    if (!docs) {
      return;
    }
    docs.delete(documentId);
    if (docs.size === 0) {
      documentsBySession.delete(safeSessionKey);
      sessionTouchOrder.delete(safeSessionKey);
    }
  }

  return {
    addOrReplaceBySource,
    removeDocument,
    query,
    getStats,
    clear,
    trimToPolicy,
  };
}

function normalizePolicy(policy) {
  return {
    chunkSize: normalizePositiveInt(policy.RETRIEVAL_CHUNK_SIZE, RETRIEVAL_CHUNK_SIZE),
    chunkOverlap: normalizePositiveInt(policy.RETRIEVAL_CHUNK_OVERLAP, RETRIEVAL_CHUNK_OVERLAP),
    topK: normalizePositiveInt(policy.RETRIEVAL_TOP_K, RETRIEVAL_TOP_K),
    minScore: normalizeScore(policy.RETRIEVAL_MIN_SCORE, RETRIEVAL_MIN_SCORE),
    maxChunksPerDoc: normalizePositiveInt(
      policy.RETRIEVAL_MAX_CHUNKS_PER_DOC,
      RETRIEVAL_MAX_CHUNKS_PER_DOC,
    ),
    maxCacheSessions: normalizePositiveInt(
      policy.RETRIEVAL_CACHE_MAX_SESSIONS,
      RETRIEVAL_CACHE_MAX_SESSIONS,
    ),
    maxDocsPerSession: normalizePositiveInt(
      policy.RETRIEVAL_CACHE_MAX_DOCS_PER_SESSION,
      RETRIEVAL_CACHE_MAX_DOCS_PER_SESSION,
    ),
  };
}

function addToSetMap(map, key, value) {
  if (!map.has(key)) {
    map.set(key, new Set());
  }
  map.get(key).add(value);
}

function removeFromSetMap(map, key, value) {
  const set = map.get(key);
  if (!set) {
    return;
  }
  set.delete(value);
  if (set.size === 0) {
    map.delete(key);
  }
}

function normalizeNonEmpty(value, label) {
  const text = String(value || "").trim();
  if (!text) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return text;
}

function normalizePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeScore(value, fallback) {
  const parsed = Number.parseFloat(String(value ?? fallback));
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, 0), 1);
}

function inferSessionKey(documentId, metadata) {
  const metadataSession = normalizeOptionalText(metadata?.sessionId);
  if (metadataSession) {
    return metadataSession;
  }

  const document = normalizeOptionalText(documentId);
  if (!document) {
    return "global";
  }

  if (document.startsWith("session:")) {
    const parts = document.split(":");
    if (parts.length >= 2 && normalizeOptionalText(parts[1])) {
      return normalizeOptionalText(parts[1]);
    }
  }
  return "global";
}

function normalizeOptionalText(value) {
  const text = String(value || "").trim();
  return text || "";
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

module.exports = {
  createRetrievalIndex,
};
