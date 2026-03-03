"use strict";

const GLOBAL_SAFE_INTENTS = new Set([
  "LIST_CLIENTS",
  "LIST_DOSSIERS",
  "LIST_LAWSUITS",
  "LIST_TASKS",
  "LIST_PERSONAL_TASKS",
  "LIST_OVERDUE_TASKS",
  "LIST_SESSIONS",
  "LIST_UPCOMING_SESSIONS",
  "LIST_MISSIONS",
  "LIST_OFFICERS",
  "LIST_DOCUMENTS",
  "LIST_NOTIFICATIONS",
  "LIST_HISTORY_EVENTS",
  "LIST_FINANCIAL_ENTRIES",
]);

const POLICY_TABLE = Object.freeze({
  LIST_CLIENTS: { scopeRequired: false, globalSafe: true, preferredExecutionPath: "direct", reasonCode: "global_safe_collection_listing" },
  LIST_DOSSIERS: { scopeRequired: false, globalSafe: true, preferredExecutionPath: "direct", reasonCode: "global_safe_collection_listing" },
  LIST_LAWSUITS: { scopeRequired: false, globalSafe: true, preferredExecutionPath: "direct", reasonCode: "global_safe_collection_listing" },
  LIST_TASKS: { scopeRequired: false, globalSafe: true, preferredExecutionPath: "direct", reasonCode: "global_safe_collection_listing" },
  LIST_PERSONAL_TASKS: { scopeRequired: false, globalSafe: true, preferredExecutionPath: "direct", reasonCode: "global_safe_collection_listing" },
  LIST_OVERDUE_TASKS: { scopeRequired: false, globalSafe: true, preferredExecutionPath: "direct", reasonCode: "global_safe_collection_listing" },
  LIST_SESSIONS: { scopeRequired: false, globalSafe: true, preferredExecutionPath: "direct", reasonCode: "global_safe_collection_listing" },
  LIST_UPCOMING_SESSIONS: { scopeRequired: false, globalSafe: true, preferredExecutionPath: "direct", reasonCode: "global_safe_collection_listing" },
  LIST_MISSIONS: { scopeRequired: false, globalSafe: true, preferredExecutionPath: "direct", reasonCode: "global_safe_collection_listing" },
  LIST_OFFICERS: { scopeRequired: false, globalSafe: true, preferredExecutionPath: "direct", reasonCode: "global_safe_collection_listing" },
  LIST_DOCUMENTS: { scopeRequired: false, globalSafe: true, preferredExecutionPath: "direct", reasonCode: "global_safe_collection_listing" },
  LIST_NOTIFICATIONS: { scopeRequired: false, globalSafe: true, preferredExecutionPath: "direct", reasonCode: "global_safe_collection_listing" },
  LIST_HISTORY_EVENTS: { scopeRequired: false, globalSafe: true, preferredExecutionPath: "direct", reasonCode: "global_safe_collection_listing" },
  LIST_FINANCIAL_ENTRIES: { scopeRequired: false, globalSafe: true, preferredExecutionPath: "direct", reasonCode: "global_safe_collection_listing" },
});

function normalizeIntent(intentName = "") {
  return String(intentName || "").trim().toUpperCase();
}

function getIntentExecutionPolicy(intentName) {
  const normalized = normalizeIntent(intentName);
  if (!normalized) {
    return {
      intentName: "",
      scopeRequired: false,
      globalSafe: false,
      preferredExecutionPath: "llm",
      reasonCode: "missing_intent",
    };
  }
  if (POLICY_TABLE[normalized]) {
    return {
      intentName: normalized,
      ...POLICY_TABLE[normalized],
    };
  }
  if (normalized.startsWith("READ_")) {
    return {
      intentName: normalized,
      scopeRequired: true,
      globalSafe: false,
      preferredExecutionPath: "graph",
      reasonCode: "read_intent_requires_scope",
    };
  }
  if (normalized.startsWith("EXPLAIN_")) {
    return {
      intentName: normalized,
      scopeRequired: true,
      globalSafe: false,
      preferredExecutionPath: "graph",
      reasonCode: "explain_intent_requires_scope",
    };
  }
  if (normalized.startsWith("SUMMARIZE_")) {
    return {
      intentName: normalized,
      scopeRequired: true,
      globalSafe: false,
      preferredExecutionPath: "graph",
      reasonCode: "summarize_intent_requires_scope",
    };
  }
  if (normalized.startsWith("LIST_")) {
    return {
      intentName: normalized,
      scopeRequired: false,
      globalSafe: false,
      preferredExecutionPath: "graph",
      reasonCode: "list_intent_scope_optional_not_global_safe",
    };
  }
  return {
    intentName: normalized,
    scopeRequired: false,
    globalSafe: false,
    preferredExecutionPath: "llm",
    reasonCode: "fallback_llm",
  };
}

function isGlobalSafeIntent(intentName) {
  const normalized = normalizeIntent(intentName);
  if (!normalized) return false;
  if (GLOBAL_SAFE_INTENTS.has(normalized)) return true;
  return Boolean(getIntentExecutionPolicy(normalized).globalSafe);
}

function requiresScope(intentName, options = {}) {
  const policy = getIntentExecutionPolicy(intentName);
  if (!policy.scopeRequired) return false;
  if (String(policy.intentName || "").startsWith("SUMMARIZE_")) {
    return !Boolean(options.aggregateSummary);
  }
  return true;
}

function preferredExecutionPath(intentName) {
  return getIntentExecutionPolicy(intentName).preferredExecutionPath;
}

module.exports = {
  getIntentExecutionPolicy,
  isGlobalSafeIntent,
  requiresScope,
  preferredExecutionPath,
};
