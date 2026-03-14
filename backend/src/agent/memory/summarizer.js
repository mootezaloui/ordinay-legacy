"use strict";

const {
  MAX_RECENT_TURNS,
  SUMMARY_GENERATE_MAX_TOKENS,
  SUMMARY_MAX_TOKENS,
  SUMMARY_OUTPUT_MAX_CHARS,
  SUMMARY_TRIGGER_TURNS,
  estimateSessionTokens,
} = require("./memory.policy");
const {
  buildDeterministicKey,
  stableStringify,
} = require("../performance/hotpath.optimizer");

const SUMMARY_SYSTEM_PROMPT = [
  "You are summarizing a legal-assistant conversation for working memory.",
  "Keep only legally relevant facts, decisions, commitments, dates, amounts, and pending items.",
  "Include stable entity references (type, id, label) when available.",
  "Do not include conversational fluff.",
  "Return concise plain text.",
].join(" ");

function createSummarizer({ llmProvider, policy = {}, dedupeCache, operationsRuntime } = {}) {
  const maxRecentTurns = normalizePositiveInt(policy.MAX_RECENT_TURNS, MAX_RECENT_TURNS);
  const summaryTriggerTurns = normalizePositiveInt(
    policy.SUMMARY_TRIGGER_TURNS,
    SUMMARY_TRIGGER_TURNS,
  );
  const summaryMaxTokens = normalizePositiveInt(policy.SUMMARY_MAX_TOKENS, SUMMARY_MAX_TOKENS);
  const summaryOutputMaxChars = normalizePositiveInt(
    policy.SUMMARY_OUTPUT_MAX_CHARS,
    SUMMARY_OUTPUT_MAX_CHARS,
  );
  const dedupeMaxEntries = normalizePositiveInt(policy.SUMMARY_CACHE_MAX, 256);
  const basisCache = normalizeCache(dedupeCache);
  const inFlightBySession = new Map();
  const lastBasisBySession = new Map();
  const stats = {
    runs: 0,
    updates: 0,
    skippedDuplicate: 0,
    coalesced: 0,
    failures: 0,
  };

  return {
    shouldSummarize(session) {
      const turnCount = Array.isArray(session?.turns) ? session.turns.length : 0;
      const tokenEstimate = estimateSessionTokens(session);
      return turnCount > summaryTriggerTurns || tokenEstimate > summaryMaxTokens;
    },

    async maybeUpdateSummary(session) {
      if (isSummarizationDisabledBySafeMode(operationsRuntime)) {
        maybeLogSummaryDecision(operationsRuntime, "summary update skipped by safe mode");
        return false;
      }
      if (!isSessionLike(session) || !hasGenerate(llmProvider)) {
        return false;
      }
      if (!this.shouldSummarize(session)) {
        return false;
      }

      const turns = Array.isArray(session.turns) ? session.turns : [];
      const oldTurns = turns.slice(0, Math.max(0, turns.length - maxRecentTurns));
      if (oldTurns.length === 0) {
        return false;
      }

      const sessionKey = normalizeSessionKey(session);
      const basisKey = buildSummaryBasisKey(session, oldTurns);
      const cacheKey = `summary_basis:${sessionKey}`;
      const cachedBasis = basisCache ? basisCache.get(cacheKey) : undefined;
      const previousBasis = cachedBasis || lastBasisBySession.get(sessionKey);
      if (previousBasis === basisKey) {
        stats.skippedDuplicate += 1;
        return false;
      }

      const inFlight = inFlightBySession.get(sessionKey);
      if (inFlight && inFlight.basisKey === basisKey) {
        stats.coalesced += 1;
        return inFlight.promise;
      }

      const promise = runSummaryUpdate({
        llmProvider,
        session,
        turns,
        oldTurns,
        maxRecentTurns,
        summaryOutputMaxChars,
        sessionKey,
        basisKey,
      })
        .then((updated) => {
          if (updated) {
            stats.updates += 1;
          }
          lastBasisBySession.set(sessionKey, basisKey);
          if (basisCache) {
            basisCache.set(cacheKey, basisKey);
          }
          trimOldestMapEntries(lastBasisBySession, dedupeMaxEntries);
          return updated;
        })
        .catch((error) => {
          stats.failures += 1;
          const message =
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : String(error || "unknown summary error");
          console.warn(`[agent.memory] summarization skipped: ${message}`);
          return false;
        })
        .finally(() => {
          const current = inFlightBySession.get(sessionKey);
          if (current && current.basisKey === basisKey) {
            inFlightBySession.delete(sessionKey);
          }
        });

      stats.runs += 1;
      inFlightBySession.set(sessionKey, { basisKey, promise });
      trimOldestMapEntries(inFlightBySession, dedupeMaxEntries);
      return promise;
    },

    getCacheStats() {
      return {
        name: "summaryDedupe",
        inFlight: inFlightBySession.size,
        lastBasisEntries: lastBasisBySession.size,
        runs: stats.runs,
        updates: stats.updates,
        skippedDuplicate: stats.skippedDuplicate,
        coalesced: stats.coalesced,
        failures: stats.failures,
      };
    },
  };
}

async function runSummaryUpdate({
  llmProvider,
  session,
  turns,
  oldTurns,
  maxRecentTurns,
  summaryOutputMaxChars,
}) {
  const userPayload = buildSummaryPayload(session.summary, oldTurns);
  const response = await llmProvider.generate({
    messages: [
      { role: "system", content: SUMMARY_SYSTEM_PROMPT },
      { role: "user", content: userPayload },
    ],
    tools: [],
    temperature: 0,
    maxTokens: SUMMARY_GENERATE_MAX_TOKENS,
    metadata: { task: "memory_summary" },
  });

  const summary = normalizeSummary(response?.text, summaryOutputMaxChars);
  if (!summary) {
    return false;
  }

  session.summary = summary;
  session.turns = turns.slice(-maxRecentTurns);
  session.updatedAt = new Date().toISOString();
  return true;
}

function buildSummaryPayload(existingSummary, turns) {
  const preface = String(existingSummary || "").trim();
  const transcript = turns
    .map((turn) => {
      const role = String(turn?.role || "assistant");
      const message = String(turn?.message || "").replace(/\s+/g, " ").trim();
      return message ? `[${role}] ${message}` : "";
    })
    .filter(Boolean)
    .join("\n");

  if (!preface) {
    return transcript;
  }
  return [`Existing summary:`, preface, `New turns to fold in:`, transcript].join("\n\n");
}

function normalizeSummary(text, maxChars) {
  const normalized = String(text || "").replace(/\s+\n/g, "\n").trim();
  if (!normalized) {
    return "";
  }
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return normalized.slice(0, maxChars - 3).trimEnd() + "...";
}

function normalizePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function hasGenerate(llmProvider) {
  return Boolean(llmProvider && typeof llmProvider.generate === "function");
}

function normalizeCache(value) {
  if (
    value &&
    typeof value === "object" &&
    typeof value.get === "function" &&
    typeof value.set === "function"
  ) {
    return value;
  }
  return null;
}

function buildSummaryBasisKey(session, oldTurns) {
  const normalizedSummary = String(session?.summary || "").trim();
  const compactTurns = oldTurns.map((turn) => ({
    id: String(turn?.id || ""),
    role: String(turn?.role || ""),
    message: String(turn?.message || ""),
    turnType: String(turn?.turnType || ""),
    createdAt: String(turn?.createdAt || ""),
  }));

  return buildDeterministicKey([
    "summary_basis",
    String(session?.id || ""),
    normalizedSummary,
    stableStringify(compactTurns),
  ]);
}

function normalizeSessionKey(session) {
  const text = String(session?.id || "").trim();
  if (text) {
    return text;
  }
  return buildDeterministicKey(["anonymous_session", stableStringify(session || {})]);
}

function trimOldestMapEntries(map, maxEntries) {
  while (map.size > maxEntries) {
    const oldestKey = map.keys().next().value;
    if (typeof oldestKey === "undefined") {
      break;
    }
    map.delete(oldestKey);
  }
}

function isSessionLike(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray(value.turns) &&
    typeof value.state === "object"
  );
}

function isSummarizationDisabledBySafeMode(operationsRuntime) {
  return (
    operationsRuntime &&
    operationsRuntime.safeMode &&
    typeof operationsRuntime.safeMode.isSummarizationDisabled === "function" &&
    operationsRuntime.safeMode.isSummarizationDisabled() === true
  );
}

function maybeLogSummaryDecision(operationsRuntime, message) {
  const shouldLog =
    operationsRuntime &&
    operationsRuntime.debugFlags &&
    typeof operationsRuntime.debugFlags.shouldLogVerboseTurnTrace === "function" &&
    operationsRuntime.debugFlags.shouldLogVerboseTurnTrace() === true;
  if (shouldLog) {
    console.info(`[agent.operations] ${message}`);
  }
}

module.exports = {
  createSummarizer,
};
