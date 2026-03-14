"use strict";

const {
  RETRIEVAL_MAX_CHARS,
  RETRIEVAL_MAX_CHUNKS_PER_DOC,
  RETRIEVAL_MIN_SCORE,
  RETRIEVAL_TOP_K,
} = require("./retrieval.policy");
const { normalizeText } = require("./simple.embedder");

function createRetrievalContextBuilder(retrievalIndex, policy = {}) {
  if (!retrievalIndex || typeof retrievalIndex.query !== "function") {
    throw new Error("createRetrievalContextBuilder requires a retrieval index with query().");
  }

  const maxChars = normalizePositiveInt(policy.RETRIEVAL_MAX_CHARS, RETRIEVAL_MAX_CHARS);
  const topK = normalizePositiveInt(policy.RETRIEVAL_TOP_K, RETRIEVAL_TOP_K);
  const minScore = normalizeScore(policy.RETRIEVAL_MIN_SCORE, RETRIEVAL_MIN_SCORE);
  const maxChunksPerDoc = normalizePositiveInt(
    policy.RETRIEVAL_MAX_CHUNKS_PER_DOC,
    RETRIEVAL_MAX_CHUNKS_PER_DOC,
  );

  return {
    buildRetrievalContext({ session, input, retrievalIndex: runtimeIndex } = {}) {
      const index = runtimeIndex && typeof runtimeIndex.query === "function" ? runtimeIndex : retrievalIndex;
      const queryText = String(input?.message || "").trim();
      if (!queryText) {
        return { text: "", matches: [] };
      }

      const matches = index.query({
        text: queryText,
        topK,
        minScore,
        maxChunksPerDoc,
      });

      if (!Array.isArray(matches) || matches.length === 0) {
        return { text: "", matches: [] };
      }

      const selected = [];
      const lines = [];
      const dedupe = new Set();
      let usedChars = 0;

      for (const match of matches) {
        const content = compactText(match?.text, 320);
        if (!content) {
          continue;
        }

        const sourceId = String(match?.sourceId || "").trim();
        const normalized = normalizeText(content);
        const dedupeKey = `${sourceId}::${normalized}`;
        if (dedupe.has(dedupeKey)) {
          continue;
        }

        const sourceLabel = buildSourceLabel(match, session);
        const line = `[${sourceLabel}] ${content}`;
        const nextChars = usedChars + line.length + (lines.length > 0 ? 1 : 0);
        if (nextChars > maxChars) {
          break;
        }

        lines.push(line);
        usedChars = nextChars;
        dedupe.add(dedupeKey);
        selected.push(match);
      }

      const overflow = Math.max(matches.length - selected.length, 0);
      if (overflow > 0) {
        const overflowLine = `+${overflow} more`;
        if (usedChars + overflowLine.length + 1 <= maxChars) {
          lines.push(overflowLine);
        }
      }

      return {
        text: lines.join("\n"),
        matches: selected,
      };
    },
  };
}

function buildSourceLabel(match, session) {
  const sourceLabel = String(match?.metadata?.sourceLabel || "").trim();
  if (sourceLabel) {
    return sourceLabel;
  }

  const documentId = String(match?.documentId || "").trim();
  if (documentId) {
    return documentId;
  }

  const sessionId = String(session?.id || "").trim();
  if (sessionId) {
    return `session:${sessionId}`;
  }

  return "retrieval";
}

function compactText(value, maxChars) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return "";
  }
  if (text.length <= maxChars) {
    return text;
  }
  return text.slice(0, maxChars - 3).trimEnd() + "...";
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

module.exports = {
  createRetrievalContextBuilder,
};
