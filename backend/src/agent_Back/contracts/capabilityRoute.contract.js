"use strict";

const CAPABILITIES = Object.freeze({
  DRAFT: "DRAFT",
  READ: "READ",
  SEARCH: "SEARCH",
  ANALYZE: "ANALYZE",
  ASSISTANT: "ASSISTANT",
});

function normalizeRequires(requires) {
  return {
    entity: Boolean(requires?.entity),
    draftType: Boolean(requires?.draftType),
    scope: Boolean(requires?.scope),
  };
}

function buildRoutingResult({
  capability,
  intent = null,
  confidence = 1,
  signals = [],
  requires = {},
  candidates = [],
  reason = null,
  metadata = null,
} = {}) {
  return {
    type: "routing_result",
    capability,
    intent,
    confidence,
    signals: Array.isArray(signals) ? signals : [],
    requires: normalizeRequires(requires),
    candidates: Array.isArray(candidates) ? candidates : [],
    reason,
    metadata,
    timestamp: new Date().toISOString(),
  };
}

function buildRoutingClarification({
  message,
  candidates = [],
  confidence = 0,
  signals = [],
  reason = "ambiguous",
} = {}) {
  return {
    type: "routing_clarification",
    message: String(message || "I need clarification to route your request."),
    candidates: Array.isArray(candidates) ? candidates : [],
    confidence,
    signals: Array.isArray(signals) ? signals : [],
    reason,
    timestamp: new Date().toISOString(),
  };
}

function buildActivationOk({
  capability,
  intent = null,
  draftIntent = null,
  readIntent = null,
  searchIntent = null,
  analyzeIntent = null,
  normalized = {},
} = {}) {
  return {
    type: "activation_ok",
    capability,
    intent,
    draftIntent,
    readIntent,
    searchIntent,
    analyzeIntent,
    normalized,
    timestamp: new Date().toISOString(),
  };
}

function validateRoutingResult(payload) {
  if (!payload || payload.type !== "routing_result") return false;
  if (!Object.values(CAPABILITIES).includes(payload.capability)) return false;
  if (typeof payload.confidence !== "number") return false;
  return true;
}

function validateRoutingClarification(payload) {
  if (!payload || payload.type !== "routing_clarification") return false;
  if (!payload.message) return false;
  if (!Array.isArray(payload.candidates)) return false;
  return true;
}

module.exports = {
  CAPABILITIES,
  buildRoutingResult,
  buildRoutingClarification,
  buildActivationOk,
  validateRoutingResult,
  validateRoutingClarification,
};
