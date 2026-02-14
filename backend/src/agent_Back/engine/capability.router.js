"use strict";

const {
  detectReadIntent,
  detectDraftIntent,
  READ_INTENTS,
} = require("../intent.classifier");
const {
  CAPABILITIES,
  buildRoutingResult,
  buildRoutingClarification,
} = require("../contracts/capabilityRoute.contract");

const CONFIDENCE_THRESHOLD = 0.8;

function hasSearchIntent(readIntent) {
  return (
    readIntent &&
    (readIntent.intent === READ_INTENTS.WEB_SEARCH ||
      readIntent.intent === READ_INTENTS.DEEP_SEARCH)
  );
}

function detectAnalyzeSignals(message, context) {
  const normalized = String(message || "").toLowerCase();
  const signals = [];
  if (
    /\b(risk|mitigation|control|operational risk)\b/i.test(normalized) ||
    context?.operation === "analyze_risks"
  ) {
    signals.push("analyze_risk");
  }
  if (
    /\b(propose actions|action plan|next steps|priorities)\b/i.test(
      normalized,
    ) ||
    context?.operation === "propose_actions"
  ) {
    signals.push("analyze_actions");
  }
  if (/\b(explain|status|state|situation)\b/i.test(normalized)) {
    signals.push("analyze_explain");
  }
  return signals;
}

function detectCaseScopeAmbiguity(message) {
  const normalized = String(message || "").toLowerCase();
  if (!/\bcase\b/i.test(normalized)) return false;
  const hasDossier = /\b(dossier|case\s*file|matter)\b/i.test(normalized);
  const hasLawsuit = /\b(lawsuit|trial|proces)\b/i.test(normalized);
  return !hasDossier && !hasLawsuit;
}

function routeCapability({ message, context, resumeContext = null } = {}) {
  if (resumeContext?.capability) {
    return buildRoutingResult({
      capability: resumeContext.capability,
      intent: resumeContext.intent || null,
      confidence: 1,
      signals: ["resume_mode"],
      requires: resumeContext.requires || {},
      metadata: resumeContext.metadata || null,
    });
  }

  const draftIntent = detectDraftIntent(message, context);
  const readIntent = draftIntent ? null : detectReadIntent(message, context);
  const analyzeSignals = detectAnalyzeSignals(message, context);
  const candidates = [];

  if (draftIntent) {
    candidates.push({
      capability: CAPABILITIES.DRAFT,
      intent: draftIntent.intent,
      confidence: 0.95,
      signals: ["draft_rule"],
      requires: {
        draftType: !draftIntent.draftType,
      },
    });
  }

  if (readIntent) {
    const isSearch = hasSearchIntent(readIntent);
    candidates.push({
      capability: isSearch ? CAPABILITIES.SEARCH : CAPABILITIES.READ,
      intent: readIntent.intent,
      confidence: 0.95,
      signals: [isSearch ? "search_rule" : "read_rule"],
    });
  }

  if (!readIntent && !draftIntent && analyzeSignals.length > 0) {
    candidates.push({
      capability: CAPABILITIES.ANALYZE,
      intent: null,
      confidence: 0.85,
      signals: analyzeSignals,
    });
  }

  if (detectCaseScopeAmbiguity(message) && readIntent) {
    const summarizeMatch = /\b(summary|summarize|overview|recap)\b/i.test(
      String(message || ""),
    );
    const baseIntent = summarizeMatch ? "SUMMARIZE" : "READ";
    return buildRoutingClarification({
      message:
        "I can summarize either a dossier or a lawsuit. Which one should I use?",
      candidates: [
        {
          capability: CAPABILITIES.READ,
          intent: `${baseIntent}_DOSSIER`,
          confidence: 0.7,
        },
        {
          capability: CAPABILITIES.READ,
          intent: `${baseIntent}_LAWSUIT`,
          confidence: 0.7,
        },
      ],
      confidence: 0.7,
      signals: ["ambiguous_case_scope"],
      reason: "read_scope_selection",
    });
  }

  if (candidates.length === 0) {
    return buildRoutingResult({
      capability: CAPABILITIES.ASSISTANT,
      intent: null,
      confidence: 0.9,
      signals: ["no_domain_match"],
    });
  }

  if (candidates.length > 1) {
    return buildRoutingClarification({
      message: "I need clarification to route your request.",
      candidates,
      confidence: 0.5,
      signals: ["multiple_candidates"],
    });
  }

  const selected = candidates[0];
  if (selected.confidence < CONFIDENCE_THRESHOLD) {
    return buildRoutingClarification({
      message: "I need clarification to route your request.",
      candidates,
      confidence: selected.confidence,
      signals: selected.signals,
    });
  }

  return buildRoutingResult(selected);
}

module.exports = {
  routeCapability,
  CAPABILITIES,
};
