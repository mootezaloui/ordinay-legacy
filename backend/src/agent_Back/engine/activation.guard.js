"use strict";

const { READ_INTENTS } = require("../intent.classifier");
const {
  CAPABILITIES,
  buildActivationOk,
  buildRoutingClarification,
} = require("../contracts/capabilityRoute.contract");

function normalizeQuery(searchIntent, message, context) {
  const metadata = context?.requestMetadata || {};
  const metadataQuery = String(metadata.webSearchQuery || "").trim();
  if (metadataQuery) return metadataQuery;
  const intentQuery = String(searchIntent?.filters?.query || "").trim();
  if (intentQuery) return intentQuery;
  return String(message || "").trim();
}

function requiresEntityForRead(readIntent) {
  if (!readIntent || !readIntent.intent) return false;
  const normalized = String(readIntent.intent || "").toUpperCase();
  if (normalized.startsWith("LIST_")) return false;
  if (normalized.startsWith("READ_")) return true;
  if (normalized.startsWith("EXPLAIN_")) return true;
  if (normalized.startsWith("SUMMARIZE_")) {
    return !readIntent.aggregateSummary;
  }
  return false;
}

function activationGuard({
  routingResult,
  draftIntent,
  readIntent,
  searchIntent,
  message,
  context,
} = {}) {
  const capability = routingResult?.capability;

  if (capability === CAPABILITIES.SEARCH) {
    const query = normalizeQuery(searchIntent, message, context);
    if (!query) {
      return buildRoutingClarification({
        message: "What should I search for?",
        candidates: [],
        confidence: 0,
        signals: ["missing_search_query"],
        reason: "search_confirmation",
      });
    }

    const normalizedIntent = searchIntent?.intent || READ_INTENTS.WEB_SEARCH;
    return buildActivationOk({
      capability,
      intent: normalizedIntent,
      searchIntent: {
        ...(searchIntent || {}),
        intent: normalizedIntent,
        filters: { ...(searchIntent?.filters || {}), query },
      },
      normalized: { query },
    });
  }

  if (capability === CAPABILITIES.DRAFT) {
    if (!draftIntent) {
      return buildRoutingClarification({
        message: "What type of document would you like me to draft?",
        candidates: [],
        confidence: 0,
        signals: ["missing_draft_intent"],
        reason: "draft_type_selection",
      });
    }

    return buildActivationOk({
      capability,
      intent: draftIntent.intent,
      draftIntent,
    });
  }

  if (capability === CAPABILITIES.READ) {
    if (!readIntent) {
      return buildRoutingClarification({
        message: "What would you like me to read?",
        candidates: [],
        confidence: 0,
        signals: ["missing_read_intent"],
        reason: "read_scope_selection",
      });
    }

    if (requiresEntityForRead(readIntent)) {
      const hasHints =
        Array.isArray(readIntent.entityHints) &&
        readIntent.entityHints.length > 0;
      if (!hasHints) {
        return buildRoutingClarification({
          message: "Which record should I use?",
          candidates: [],
          confidence: 0.3,
          signals: ["missing_read_entity"],
          reason: "read_scope_selection",
        });
      }
    }

    return buildActivationOk({
      capability,
      intent: readIntent.intent,
      readIntent,
    });
  }

  if (capability === CAPABILITIES.ANALYZE) {
    const hasContext = Boolean(
      context?._dataEnriched ||
      context?.activeEntity ||
      context?.dossierId ||
      context?.clientId,
    );
    if (!hasContext) {
      return buildRoutingClarification({
        message: "Which record should I analyze?",
        candidates: [],
        confidence: 0.3,
        signals: ["missing_analysis_context"],
        reason: "read_scope_selection",
      });
    }

    return buildActivationOk({
      capability,
      intent: routingResult?.intent || null,
      analyzeIntent: routingResult?.intent || null,
    });
  }

  return buildActivationOk({
    capability: CAPABILITIES.ASSISTANT,
    intent: routingResult?.intent || null,
  });
}

module.exports = {
  activationGuard,
};
