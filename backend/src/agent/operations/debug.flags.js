"use strict";

const DEFAULT_DEBUG_FLAGS = Object.freeze({
  verboseTurnTrace: false,
  logToolBoundaryChecks: false,
  logRetrievalDecisions: false,
  exposeOperatorWarnings: false,
});

const KEY_ALIASES = Object.freeze({
  verboseTurnTrace: "verboseTurnTrace",
  shouldLogVerboseTurnTrace: "verboseTurnTrace",
  logToolBoundaryChecks: "logToolBoundaryChecks",
  shouldLogToolBoundaryChecks: "logToolBoundaryChecks",
  logRetrievalDecisions: "logRetrievalDecisions",
  shouldLogRetrievalDecisions: "logRetrievalDecisions",
  exposeOperatorWarnings: "exposeOperatorWarnings",
  shouldExposeOperatorWarnings: "exposeOperatorWarnings",
});

let state = { ...DEFAULT_DEBUG_FLAGS };
let initialized = false;

function initializeDebugFlags(defaults = {}, options = {}) {
  if (!initialized || options.forceReset === true) {
    state = {
      ...DEFAULT_DEBUG_FLAGS,
      ...normalizePatch(defaults, state),
    };
    initialized = true;
  }

  return getDebugApi();
}

function getDebugApi() {
  return {
    getDebugFlags,
    setDebugFlags,
    shouldLogVerboseTurnTrace,
    shouldLogToolBoundaryChecks,
    shouldLogRetrievalDecisions,
    shouldExposeOperatorWarnings,
  };
}

function getDebugFlags() {
  return { ...state };
}

function setDebugFlags(patch) {
  const normalized = normalizePatch(patch, state);
  state = {
    ...state,
    ...normalized,
  };
  return getDebugFlags();
}

function shouldLogVerboseTurnTrace() {
  return state.verboseTurnTrace === true;
}

function shouldLogToolBoundaryChecks() {
  return state.logToolBoundaryChecks === true;
}

function shouldLogRetrievalDecisions() {
  return state.logRetrievalDecisions === true;
}

function shouldExposeOperatorWarnings() {
  return state.exposeOperatorWarnings === true;
}

function normalizePatch(value, currentState) {
  const row = toRecord(value);
  if (!row) {
    return {};
  }

  const next = {};
  for (const [rawKey, rawValue] of Object.entries(row)) {
    const key = KEY_ALIASES[rawKey];
    if (!key) {
      continue;
    }
    const parsed = parseBoolean(rawValue);
    if (typeof parsed === "boolean") {
      next[key] = parsed;
      continue;
    }
    const fallback = toRecord(currentState)?.[key];
    next[key] = typeof fallback === "boolean" ? fallback : DEFAULT_DEBUG_FLAGS[key];
  }

  return next;
}

function parseBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return undefined;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
  }
  return undefined;
}

function toRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value;
}

module.exports = {
  DEFAULT_DEBUG_FLAGS,
  initializeDebugFlags,
  getDebugFlags,
  setDebugFlags,
  shouldLogVerboseTurnTrace,
  shouldLogToolBoundaryChecks,
  shouldLogRetrievalDecisions,
  shouldExposeOperatorWarnings,
};
