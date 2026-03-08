"use strict";

function normalizeSuggestion(suggestion = {}) {
  return {
    actionType: String(suggestion?.actionType || "").trim().toUpperCase() || "SUGGEST_ACTION",
    source: String(suggestion?.source || "cognitive_layer").trim().toLowerCase(),
    promotionEligible: suggestion?.promotionEligible !== false,
    confidence: Number.isFinite(Number(suggestion?.confidence)) ? Number(suggestion.confidence) : null,
    title: String(suggestion?.title || "").trim() || null,
    description: String(suggestion?.description || "").trim() || null,
    entityType: String(suggestion?.entityType || "").trim().toLowerCase() || null,
  };
}

function buildArtifactComposition({
  primaryRoute = "DATABASE_FIRST",
  assistantMode = "REPORT",
  suggestions = [],
  proposalArtifacts = [],
  clarificationArtifact = null,
} = {}) {
  return {
    assistantText: {
      mode: String(assistantMode || "REPORT").trim().toUpperCase(),
      required: true,
    },
    suggestions:
      clarificationArtifact == null
        ? (Array.isArray(suggestions) ? suggestions : []).map(normalizeSuggestion)
        : [],
    proposalArtifacts: Array.isArray(proposalArtifacts) ? proposalArtifacts.filter(Boolean) : [],
    clarificationArtifact:
      clarificationArtifact && typeof clarificationArtifact === "object" ? clarificationArtifact : null,
    primaryRoute: String(primaryRoute || "DATABASE_FIRST").trim().toUpperCase(),
  };
}

module.exports = {
  buildArtifactComposition,
};
