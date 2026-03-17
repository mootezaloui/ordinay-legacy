"use strict";

const { createRetrievalContextBuilder } = require("./retrieval.context");
const { createRetrievalIndex } = require("./retrieval.index");
const { createRetrievalLoader } = require("./retrieval.loader");
const { createRetrievalPolicy } = require("./retrieval.policy");

function createRetrievalRuntime({ policyOverrides = {} } = {}) {
  const policy = createRetrievalPolicy(policyOverrides);

  if (!policy.RETRIEVAL_ENABLED) {
    return createDisabledRuntime(policy, "Retrieval disabled by policy.");
  }

  try {
    const retrievalIndex = createRetrievalIndex(policy);
    const retrievalLoader = createRetrievalLoader(retrievalIndex);
    const retrievalContext = createRetrievalContextBuilder(retrievalIndex, policy);

    return createActiveRuntime({
      policy,
      retrievalIndex,
      retrievalLoader,
      retrievalContext,
    });
  } catch (error) {
    const reason = safeErrorMessage(error);
    console.warn(`[agent.retrieval] initialization failed, retrieval disabled: ${reason}`);
    return createDisabledRuntime(policy, reason);
  }
}

function createActiveRuntime({ policy, retrievalIndex, retrievalLoader, retrievalContext }) {
  const state = {
    enabled: true,
    disabledReason: undefined,
  };
  const hydratedDocs = new Map(); // documentId → textLength (skip re-hydration if unchanged)

  function safeRun(label, fallback, fn, mode = "skip") {
    if (!state.enabled) {
      return fallback;
    }
    try {
      return fn();
    } catch (error) {
      const reason = safeErrorMessage(error);
      console.warn(`[agent.retrieval] ${label} failed: ${reason}`);
      if (mode === "disable") {
        state.enabled = false;
        state.disabledReason = reason;
      }
      return fallback;
    }
  }

  return {
    policy,
    isEnabled() {
      return state.enabled;
    },
    getStatus() {
      return {
        enabled: state.enabled,
        disabledReason: state.disabledReason,
      };
    },
    indexSessionArtifacts(session) {
      return safeRun("indexSessionArtifacts", [], () =>
        retrievalLoader.indexSessionArtifacts(session),
      );
    },
    indexTurnArtifacts(session, turn) {
      return safeRun("indexTurnArtifacts", null, () =>
        retrievalLoader.indexTurnArtifacts(session, turn),
      );
    },
    buildRetrievalContext(params) {
      return safeRun(
        "buildRetrievalContext",
        { text: "", matches: [] },
        () => retrievalContext.buildRetrievalContext({ ...params, retrievalIndex }),
        "skip",
      );
    },
    getIndexStats() {
      return safeRun("getIndexStats", { chunkCount: 0, sourceCount: 0, documentCount: 0 }, () =>
        retrievalIndex.getStats(),
      );
    },
    getCacheStats() {
      return safeRun(
        "getCacheStats",
        { chunkCount: 0, sourceCount: 0, documentCount: 0, sessionCount: 0 },
        () => retrievalIndex.getStats(),
      );
    },
    clearCache() {
      return safeRun("clearCache", 0, () => {
        hydratedDocs.clear();
        return typeof retrievalIndex.clear === "function" ? retrievalIndex.clear() : 0;
      });
    },
    hydrateDocument({ documentId, text, metadata } = {}) {
      return safeRun("hydrateDocument", null, () => {
        const safeDocId = String(documentId || "").trim();
        const safeText = String(text || "").trim();
        if (!safeDocId || !safeText) return null;
        const prevLen = hydratedDocs.get(safeDocId);
        if (prevLen === safeText.length) return null; // skip if unchanged
        const sourceId = `rag-doc:${safeDocId}`;
        const result = retrievalIndex.addOrReplaceBySource({
          sourceId,
          documentId: safeDocId,
          text: safeText,
          metadata: metadata || {},
        });
        hydratedDocs.set(safeDocId, safeText.length);
        return result;
      });
    },
    isDocumentHydrated(documentId) {
      return hydratedDocs.has(String(documentId || "").trim());
    },
  };
}

function createDisabledRuntime(policy, reason) {
  return {
    policy,
    isEnabled() {
      return false;
    },
    getStatus() {
      return {
        enabled: false,
        disabledReason: String(reason || "retrieval disabled"),
      };
    },
    indexSessionArtifacts() {
      return [];
    },
    indexTurnArtifacts() {
      return null;
    },
    buildRetrievalContext() {
      return { text: "", matches: [] };
    },
    getIndexStats() {
      return { chunkCount: 0, sourceCount: 0, documentCount: 0 };
    },
    getCacheStats() {
      return { chunkCount: 0, sourceCount: 0, documentCount: 0, sessionCount: 0 };
    },
    clearCache() {
      return 0;
    },
    hydrateDocument() {
      return null;
    },
    isDocumentHydrated() {
      return false;
    },
  };
}

function safeErrorMessage(error) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return String(error || "unknown retrieval error");
}

module.exports = {
  createRetrievalRuntime,
  createRetrievalIndex,
  createRetrievalLoader,
  createRetrievalContextBuilder,
};
