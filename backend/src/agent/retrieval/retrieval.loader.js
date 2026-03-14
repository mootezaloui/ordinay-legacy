"use strict";

const { buildDeterministicKey, normalizeWhitespace, stableStringify } = require("../performance/hotpath.optimizer");

function createRetrievalLoader(retrievalIndex) {
  if (!retrievalIndex || typeof retrievalIndex.addOrReplaceBySource !== "function") {
    throw new Error("createRetrievalLoader requires a retrieval index with addOrReplaceBySource().");
  }

  const artifactFingerprints = new Map();

  return {
    indexSessionArtifacts(session) {
      const sessionId = normalizeId(session?.id);
      if (!sessionId) {
        return [];
      }

      const updates = [];

      const summarySourceId = buildSummarySourceId(sessionId);
      updates.push(
        addOrSkipIfUnchanged({
          sourceId: summarySourceId,
          documentId: buildSessionDocumentId(sessionId),
          text: normalizeText(session?.summary),
          metadata: {
            artifactType: "session_summary",
            sourceLabel: `Session ${sessionId} summary`,
            sessionId,
          },
        }),
      );

      const historyRows = Array.isArray(session?.history) ? session.history : [];
      for (const entry of historyRows) {
        const turnId = normalizeId(entry?.turnId);
        if (!turnId) {
          continue;
        }

        const sourceId = buildHistorySourceId(sessionId, turnId);
        updates.push(
          addOrSkipIfUnchanged({
            sourceId,
            documentId: buildSessionDocumentId(sessionId),
            text: normalizeText(entry?.summary),
            metadata: {
              artifactType: "history_summary",
              sourceLabel: `History ${turnId}`,
              sessionId,
              turnId,
              role: normalizeRole(entry?.role),
            },
          }),
        );
      }

      return updates;
    },

    indexTurnArtifacts(session, turn) {
      const sessionId = normalizeId(session?.id);
      const turnId = normalizeId(turn?.id);
      if (!sessionId || !turnId) {
        return null;
      }

      const role = normalizeRole(turn?.role);
      const sourceId = buildTurnSourceId(sessionId, turnId, role);
      const message = normalizeText(turn?.message);

      return addOrSkipIfUnchanged({
        sourceId,
        documentId: buildSessionDocumentId(sessionId),
        text: message,
        metadata: {
          artifactType: "turn_message",
          sourceLabel: `Turn ${turnId} (${role})`,
          sessionId,
          turnId,
          role,
        },
      });
    },
  };

  function addOrSkipIfUnchanged({ sourceId, documentId, text, metadata }) {
    const safeSourceId = normalizeId(sourceId);
    if (!safeSourceId) {
      return null;
    }

    const payload = {
      sourceId: safeSourceId,
      documentId,
      text: normalizeText(text),
      metadata: normalizeMetadata(metadata),
    };
    const fingerprint = buildArtifactFingerprint(payload);
    const previousFingerprint = artifactFingerprints.get(safeSourceId);
    if (previousFingerprint === fingerprint) {
      return {
        sourceId: safeSourceId,
        documentId: payload.documentId,
        chunkCount: 0,
        replaced: false,
        skipped: true,
      };
    }

    const result = retrievalIndex.addOrReplaceBySource(payload);
    artifactFingerprints.set(safeSourceId, fingerprint);
    return result;
  }
}

function buildSessionDocumentId(sessionId) {
  return `session:${sessionId}`;
}

function buildSummarySourceId(sessionId) {
  return `session:${sessionId}:summary`;
}

function buildTurnSourceId(sessionId, turnId, role) {
  return `session:${sessionId}:turn:${turnId}:role:${role}`;
}

function buildHistorySourceId(sessionId, turnId) {
  return `session:${sessionId}:history:${turnId}`;
}

function normalizeId(value) {
  const text = String(value || "").trim();
  return text || "";
}

function normalizeText(value) {
  return normalizeWhitespace(value);
}

function normalizeRole(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    normalized === "system" ||
    normalized === "user" ||
    normalized === "assistant" ||
    normalized === "tool"
  ) {
    return normalized;
  }
  return "assistant";
}

function normalizeMetadata(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value;
}

function buildArtifactFingerprint({ sourceId, documentId, text, metadata }) {
  return buildDeterministicKey([
    "retrieval_artifact",
    sourceId,
    documentId,
    text,
    stableStringify(metadata),
  ]);
}

module.exports = {
  createRetrievalLoader,
};
