"use strict";

const DEFAULT_STATE = Object.freeze({
  writesDisabled: false,
  retrievalDisabled: false,
  groundingDisabled: false,
  summarizationDisabled: false,
  forceReadOnly: false,
  v2Disabled: false,
});

const KEY_ALIASES = Object.freeze({
  writesDisabled: "writesDisabled",
  disableWrites: "writesDisabled",
  retrievalDisabled: "retrievalDisabled",
  disableRetrieval: "retrievalDisabled",
  groundingDisabled: "groundingDisabled",
  disableGrounding: "groundingDisabled",
  summarizationDisabled: "summarizationDisabled",
  disableSummarization: "summarizationDisabled",
  forceReadOnly: "forceReadOnly",
  forceReadOnlyMode: "forceReadOnly",
  v2Disabled: "v2Disabled",
  disableV2: "v2Disabled",
});

let state = { ...DEFAULT_STATE };
let initialized = false;
let lastWarnings = [];

function initializeSafeMode(defaults = {}, options = {}) {
  if (!initialized || options.forceReset === true) {
    const normalized = normalizePatch(defaults, state);
    state = { ...DEFAULT_STATE, ...normalized.state };
    lastWarnings = normalized.warnings;
    initialized = true;
  }
  return getSafeModeApi();
}

function getSafeModeApi() {
  return {
    getSafeModeState,
    setSafeModeState,
    isWritesDisabled,
    isRetrievalDisabled,
    isGroundingDisabled,
    isSummarizationDisabled,
    isAgentV2ReadOnlyForced,
    isAgentV2Disabled,
    getWarnings,
  };
}

function getSafeModeState() {
  return { ...state };
}

function setSafeModeState(patch) {
  const normalized = normalizePatch(patch, state);
  state = {
    ...state,
    ...normalized.state,
  };
  lastWarnings = normalized.warnings;
  return getSafeModeState();
}

function isWritesDisabled() {
  return state.writesDisabled === true;
}

function isRetrievalDisabled() {
  return state.retrievalDisabled === true;
}

function isGroundingDisabled() {
  return state.groundingDisabled === true;
}

function isSummarizationDisabled() {
  return state.summarizationDisabled === true;
}

function isAgentV2ReadOnlyForced() {
  return state.forceReadOnly === true;
}

function isAgentV2Disabled() {
  return state.v2Disabled === true;
}

function getWarnings() {
  return [...lastWarnings];
}

function normalizePatch(value, currentState) {
  const row = toRecord(value);
  if (!row) {
    return { state: {}, warnings: [] };
  }

  const next = {};
  const warnings = [];

  for (const [rawKey, rawValue] of Object.entries(row)) {
    const key = KEY_ALIASES[rawKey];
    if (!key) {
      continue;
    }

    const parsed = parseBooleanFailClosed(rawValue);
    if (parsed.invalid) {
      warnings.push(`Invalid safe-mode value for "${rawKey}"; forced to true (fail-closed).`);
    }

    if (typeof parsed.value === "boolean") {
      next[key] = parsed.value;
      continue;
    }

    const fallback = toRecord(currentState)?.[key];
    next[key] = typeof fallback === "boolean" ? fallback : DEFAULT_STATE[key];
  }

  return { state: next, warnings };
}

function parseBooleanFailClosed(value) {
  if (typeof value === "boolean") {
    return { value, invalid: false };
  }
  if (typeof value === "number") {
    if (value === 1) return { value: true, invalid: false };
    if (value === 0) return { value: false, invalid: false };
    return { value: true, invalid: true };
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return { value: true, invalid: false };
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
      return { value: false, invalid: false };
    }
    return { value: true, invalid: true };
  }
  if (value === null || value === undefined) {
    return { value: undefined, invalid: false };
  }
  return { value: true, invalid: true };
}

function toRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value;
}

module.exports = {
  DEFAULT_STATE,
  initializeSafeMode,
  getSafeModeState,
  setSafeModeState,
  isWritesDisabled,
  isRetrievalDisabled,
  isGroundingDisabled,
  isSummarizationDisabled,
  isAgentV2ReadOnlyForced,
  isAgentV2Disabled,
  getWarnings,
};
