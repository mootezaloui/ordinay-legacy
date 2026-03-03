"use strict";

const {
  detectReadIntent,
  detectDraftIntent,
  READ_INTENTS,
} = require("../intent.classifier");
const { buildQueryIR } = require("../query/queryIR");
const {
  CAPABILITIES,
  buildRoutingResult,
  buildRoutingClarification,
} = require("../contracts/capabilityRoute.contract");
const { requiresScope } = require("../read/intentExecution.contract");

const CONFIDENCE_THRESHOLD = 0.75;
const ANALYZE_ENTITY_INTENT = "ANALYZE_ENTITY";

function extractScopedResolutionHints(message, intent = null) {
  const sourceHints = Array.isArray(intent?.entityHints) ? intent.entityHints : [];
  const text = String(message || "");
  const low = text.toLowerCase();
  const hasClientToken = /\bclient\b/i.test(low);
  const hasDossierToken = /\b(dossier|matter|case\s*file|قضية|ملف)\b/iu.test(text);
  return {
    entityHints: sourceHints,
    scopedResolution:
      hasClientToken && hasDossierToken
        ? "resolve_client_then_dossier"
        : "standard",
  };
}

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

function resolveActiveDossierId(context = {}) {
  const snapshotId =
    context?.workSnapshot?.entityId ||
    context?.workSnapshot?.scope?.dossierId ||
    context?.workSnapshot?.parent?.id ||
    context?.lastSnapshot?.entityId ||
    context?.lastSnapshot?.scope?.dossierId ||
    context?.lastSnapshot?.parent?.id ||
    context?.workMode?.id ||
    null;
  const snapshotType =
    String(
      context?.workSnapshot?.entityType ||
        context?.lastSnapshot?.entityType ||
        context?.workMode?.type ||
        "",
    )
      .toLowerCase()
      .trim() || null;
  if (snapshotId && snapshotType === "dossier") {
    return Number(snapshotId);
  }

  if (
    String(context?.activeEntityType || "").toLowerCase() === "dossier" &&
    context?.activeEntityId
  ) {
    return Number(context.activeEntityId);
  }
  if (
    context?.activeEntity &&
    String(context.activeEntity.type || "").toLowerCase() === "dossier" &&
    context.activeEntity.id
  ) {
    return Number(context.activeEntity.id);
  }
  if (context?.dossierId) {
    return Number(context.dossierId);
  }
  return null;
}

function detectDossierPriorityAnalysis(message, context) {
  const dossierId = resolveActiveDossierId(context);
  if (!dossierId) return null;

  const normalized = String(message || "").toLowerCase();
  const prioritySignals = [
    /\bpriorit(y|ies)\b/i,
    /\bpriority\b/i,
    /\bnext steps?\b/i,
    /\burgent\b/i,
    /\bimmediate\b/i,
    /\breview\b/i,
    /\bwhat should i do\b/i,
    /\bwhat do i do\b/i,
    /\bwhat do i do with (this )?dossier\b/i,
  ];
  const hasPrioritySignal =
    /\bpriorit(y|ies)\b/i.test(normalized) ||
    /\bpriority\b/i.test(normalized) ||
    /\bwhat should i do\b/i.test(normalized) ||
    /\bwhat do i do\b/i.test(normalized) ||
    (/\bnext steps?\b/i.test(normalized) &&
      (/\bdossier\b/i.test(normalized) || dossierId > 0)) ||
    (/\breview\b/i.test(normalized) && /\bimmediate\b/i.test(normalized));
  if (!hasPrioritySignal) return null;

  return {
    analysisType: "dossier_priorities",
    entityType: "dossier",
    entityId: dossierId,
  };
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

  const queryIR = buildQueryIR({ message, requestContext: context || {} });
  const draftIntent = detectDraftIntent(message, context);
  const readIntent =
    queryIR?.intent?.family &&
    ["LIST", "READ", "SUMMARIZE", "EXPLAIN", "SEARCH"].includes(queryIR.intent.family)
      ? {
          intent: queryIR.intent.name,
          filters: queryIR.filters || {},
          entityHints: Array.isArray(queryIR.entityHints) ? queryIR.entityHints : [],
          aggregateSummary:
            queryIR.intent.family === "SUMMARIZE" && queryIR.target === "collection",
        }
      : draftIntent
        ? null
        : detectReadIntent(message, context);
  const analyzeSignals = detectAnalyzeSignals(message, context);
  const dossierPriorityAnalysis = detectDossierPriorityAnalysis(message, context);
  const candidates = [];

  if (dossierPriorityAnalysis) {
    return buildRoutingResult({
      capability: CAPABILITIES.ANALYZE,
      intent: ANALYZE_ENTITY_INTENT,
      confidence: 0.95,
      signals: ["dossier_priority_rule"],
      requires: { entity: true },
      metadata: dossierPriorityAnalysis,
    });
  }

  if (draftIntent) {
    const draftHints = extractScopedResolutionHints(message, draftIntent);
    candidates.push({
      capability: CAPABILITIES.DRAFT,
      intent: draftIntent.intent,
      confidence: 0.95,
      signals: ["draft_rule"],
      requires: {
        draftType: !draftIntent.draftType,
      },
      metadata: {
        draftType: draftIntent.draftType || null,
        entityHints: draftHints.entityHints,
        scopedResolution: draftHints.scopedResolution,
      },
    });
  }

  if (readIntent) {
    const isSearch = hasSearchIntent(readIntent);
    const readHints = extractScopedResolutionHints(message, readIntent);
    candidates.push({
      capability: isSearch ? CAPABILITIES.SEARCH : CAPABILITIES.READ,
      intent: readIntent.intent,
      confidence: 0.95,
      signals: [isSearch ? "search_rule" : "read_rule"],
      metadata: {
        entityHints: readHints.entityHints,
        scopedResolution: readHints.scopedResolution,
      },
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

  if (
    detectCaseScopeAmbiguity(message) &&
    readIntent &&
    requiresScope(readIntent.intent, {
      aggregateSummary: Boolean(readIntent.aggregateSummary),
    })
  ) {
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
