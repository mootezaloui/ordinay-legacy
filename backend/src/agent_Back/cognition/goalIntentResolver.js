"use strict";

const { parseJsonResponse } = require("../llm/llm.validation");
const {
  PRIMARY_ROUTES,
  GOAL_TYPES,
  LEGAL_PHASES,
  SECONDARY_OPPORTUNITIES,
  MINIMAL_SUPPORTING_READ_TYPES,
  normalizeDecision,
} = require("./goalIntent.contract");
const { decomposeTurnIntent } = require("./turnIntentDecomposer");
const { arbitrateGoalRoute } = require("./goalRouteArbitrator");

function normalizeText(value) {
  return String(value || "").trim();
}

function lower(value) {
  return normalizeText(value).toLowerCase();
}

function toScore(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
}

function summarizeRequestContext(requestContext = {}) {
  return {
    hasResolvedEntity:
      Boolean(requestContext?.resolvedEntity?.type) &&
      Number(requestContext?.resolvedEntity?.id || 0) > 0,
    resolvedEntityType: String(requestContext?.resolvedEntity?.type || "").trim().toLowerCase() || null,
    clientId: Number(requestContext?.clientId || 0) || null,
    dossierId: Number(requestContext?.dossierId || 0) || null,
    lawsuitId: Number(requestContext?.lawsuitId || 0) || null,
    sessionId: Number(requestContext?.sessionId || 0) || null,
    taskId: Number(requestContext?.taskId || 0) || null,
  };
}

function summarizeSessionState(sessionState = {}) {
  return {
    lastPrimaryRoute: String(sessionState?.lastPrimaryRoute || "").trim().toUpperCase() || null,
    lastGoalType: String(sessionState?.lastGoalType || "").trim().toUpperCase() || null,
    lastLegalPhase: String(sessionState?.lastLegalPhase || "").trim().toUpperCase() || null,
    hasPendingProposal: Boolean(sessionState?.pendingProposal?.proposalId),
    hasPendingClarification: Boolean(sessionState?.pendingClarification?.artifact),
  };
}

function summarizeLastAssistantArtifact(lastAssistantArtifact = null) {
  if (!lastAssistantArtifact || typeof lastAssistantArtifact !== "object") return null;
  return {
    type: String(lastAssistantArtifact?.type || "").trim().toLowerCase() || null,
    entityType: String(lastAssistantArtifact?.entityType || "").trim().toLowerCase() || null,
    message: String(lastAssistantArtifact?.message || "").trim().slice(0, 240) || null,
  };
}

function inferFallbackGoalType({ decomposition = {}, requestContext = {}, userMessage = "" }) {
  if (decomposition.hasProgressionIntent) return GOAL_TYPES.WORKFLOW_CONTINUATION;
  if (decomposition.hasRetrievalIntent) return GOAL_TYPES.STATUS_INQUIRY;
  if (Number(requestContext?.resolvedEntity?.id || 0) > 0 && /\?/.test(String(userMessage || ""))) {
    return GOAL_TYPES.STATUS_INQUIRY;
  }
  return GOAL_TYPES.UNKNOWN;
}

function inferFallbackTargetEntityType({ requestContext = {}, decomposition = {} }) {
  if (Number(requestContext?.lawsuitId || 0) > 0) return "lawsuit";
  if (Number(requestContext?.dossierId || 0) > 0) return decomposition.hasProgressionIntent ? "lawsuit" : "dossier";
  if (Number(requestContext?.clientId || 0) > 0) return "client";
  const resolvedType = String(requestContext?.resolvedEntity?.type || "").trim().toLowerCase();
  return resolvedType || null;
}

function inferFallbackIntendedOperation({ decomposition = {}, userMessage = "" }) {
  const text = lower(userMessage);
  if (/\b(update|change|reschedule|move|edit|modify)\b/.test(text)) return "update";
  if (decomposition.hasProgressionIntent) return "create";
  if (decomposition.hasRetrievalIntent) return "inspect";
  return null;
}

function inferFallbackLegalPhase(goalType = GOAL_TYPES.UNKNOWN) {
  if (goalType === GOAL_TYPES.WORKFLOW_CONTINUATION) return LEGAL_PHASES.PRE_FILING;
  if (goalType === GOAL_TYPES.STATUS_INQUIRY) return LEGAL_PHASES.UNKNOWN;
  return LEGAL_PHASES.UNKNOWN;
}

function inferSignals({ userMessage = "", decomposition = {}, sessionState = {} }) {
  const text = lower(userMessage);
  const pendingProposal = Boolean(sessionState?.pendingProposal?.proposalId);
  return {
    goalDeclaration: /\b(we(?:'re| are)|i(?:'m| am)|let'?s|please|need to|have to)\b/.test(text) ? 0.8 : 0.45,
    escalationIntent: /\b(court|hearing|trial|lawsuit|case|petition|serve|served)\b/.test(text) ? 0.78 : 0.25,
    planningIntent: decomposition.hasProgressionIntent ? 0.78 : 0.2,
    advisoryIntent: decomposition.hasAdvisoryIntent ? 0.72 : 0.2,
    statusInquiry: decomposition.hasRetrievalIntent ? 0.78 : 0.1,
    emotionalUrgency: /\b(urgent|asap|immediately|today|tomorrow)\b/.test(text) ? 0.7 : 0.15,
    continuityStrength:
      pendingProposal || sessionState?.lastPrimaryRoute === PRIMARY_ROUTES.GOAL_FIRST ? 0.8 : 0.35,
  };
}

function inferSafetyProfile({ intendedOperation, targetEntityType, requestContext = {} }) {
  const hasResolvedEntity =
    Boolean(requestContext?.resolvedEntity?.type) && Number(requestContext?.resolvedEntity?.id || 0) > 0;
  const updateExisting = intendedOperation === "update";
  return {
    class: updateExisting ? "MEDIUM" : "LOW",
    exactEntityRequiredForProposal:
      updateExisting && !hasResolvedEntity && Boolean(targetEntityType),
    exactEntityRequiredForExecution:
      Boolean(targetEntityType) && !["inspect", "advise", null].includes(intendedOperation),
    confirmationRequired: intendedOperation !== "inspect",
  };
}

function dedupe(items = []) {
  return Array.from(new Set((Array.isArray(items) ? items : []).map((item) => String(item || "").trim()).filter(Boolean)));
}

function inferContextRequirements({
  llmDecision = null,
  goalType,
  targetEntityType,
  intendedOperation,
  requestContext = {},
  decomposition = {},
  safetyProfile = {},
}) {
  const needsParentScopeForCreate =
    intendedOperation === "create" && ["lawsuit", "task", "session", "document", "note"].includes(targetEntityType);
  const hasParentScope =
    Number(requestContext?.dossierId || 0) > 0 ||
    Number(requestContext?.clientId || 0) > 0 ||
    Number(requestContext?.lawsuitId || 0) > 0;
  const hasResolvedEntity =
    Boolean(requestContext?.resolvedEntity?.type) && Number(requestContext?.resolvedEntity?.id || 0) > 0;

  const understandingContextNeeded = dedupe([
    ...(Array.isArray(llmDecision?.understandingContextNeeded) ? llmDecision.understandingContextNeeded : []),
    !goalType || goalType === GOAL_TYPES.UNKNOWN ? "goal_type" : "",
    !targetEntityType && decomposition.hasProgressionIntent ? "target_entity_type" : "",
  ]);
  const proposalContextNeeded = dedupe([
    ...(Array.isArray(llmDecision?.proposalContextNeeded) ? llmDecision.proposalContextNeeded : []),
    needsParentScopeForCreate && !hasParentScope ? "parent_scope" : "",
    safetyProfile.exactEntityRequiredForProposal && !hasResolvedEntity ? "exact_target_entity" : "",
  ]);
  const executionContextNeeded = dedupe([
    ...(Array.isArray(llmDecision?.executionContextNeeded) ? llmDecision.executionContextNeeded : []),
    intendedOperation === "create" && !hasParentScope ? "parent_scope" : "",
    safetyProfile.exactEntityRequiredForExecution && intendedOperation === "update" && !hasResolvedEntity
      ? "exact_target_entity"
      : "",
    intendedOperation && intendedOperation !== "inspect" && intendedOperation !== "advise" ? "confirmation" : "",
  ]);

  return {
    understandingContextNeeded,
    proposalContextNeeded,
    executionContextNeeded,
    understandingSatisfied: understandingContextNeeded.length === 0,
    proposalSatisfied: proposalContextNeeded.length === 0,
    executionSatisfied: executionContextNeeded.length === 0,
  };
}

function inferSecondaryOpportunities({ decomposition = {}, goalType, targetEntityType }) {
  const items = [];
  if (decomposition.hasMixedIntent) {
    items.push({
      type: SECONDARY_OPPORTUNITIES.RUN_FOCUSED_EXISTENCE_CHECK,
      confidence: 0.84,
      gatedByClarification: true,
      reason: "mixed_turn_supporting_read",
    });
  }
  if ([GOAL_TYPES.CASE_DEVELOPMENT, GOAL_TYPES.FACT_UPDATE].includes(goalType)) {
    items.push({
      type: SECONDARY_OPPORTUNITIES.SUGGEST_NOTE,
      confidence: 0.68,
      gatedByClarification: true,
      reason: "capture_case_development",
    });
  }
  if (targetEntityType === "lawsuit") {
    items.push({
      type: SECONDARY_OPPORTUNITIES.SUGGEST_CREATE_IF_ABSENT,
      confidence: 0.78,
      gatedByClarification: true,
      reason: "lawsuit_progression",
    });
  }
  return items;
}

function inferMinimalSupportingReads({ decomposition = {}, targetEntityType, requestContext = {}, primaryMode }) {
  if (primaryMode !== PRIMARY_ROUTES.GOAL_FIRST && !decomposition.hasMixedIntent) return [];
  if (!targetEntityType) return [];
  return [
    {
      type: MINIMAL_SUPPORTING_READ_TYPES.EXISTENCE_CHECK,
      entityType: targetEntityType,
      scope: {
        clientId: Number(requestContext?.clientId || 0) || null,
        dossierId: Number(requestContext?.dossierId || 0) || null,
        lawsuitId: Number(requestContext?.lawsuitId || 0) || null,
      },
      reason: decomposition.hasMixedIntent ? "mixed_turn_supporting_read" : "goal_supporting_read",
    },
  ];
}

function normalizeGoalType(value, fallback = GOAL_TYPES.UNKNOWN) {
  const normalized = String(value || "").trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(GOAL_TYPES, normalized) ? GOAL_TYPES[normalized] : fallback;
}

function normalizeLegalPhase(value, fallback = LEGAL_PHASES.UNKNOWN) {
  const normalized = String(value || "").trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(LEGAL_PHASES, normalized) ? LEGAL_PHASES[normalized] : fallback;
}

function buildJudgePrompt({
  userMessage = "",
  decomposition = {},
  requestSummary = {},
  sessionSummary = {},
  lastAssistantArtifact = null,
}) {
  return [
    "You are a routing judge for a legal assistant.",
    "Decide the user's actual goal before any tool search dominates the turn.",
    "Do not rely on exact keywords. Infer intent from semantics and conversation state.",
    "Return JSON only with this schema:",
    '{"goalType":"LEGAL_ACTION_INITIATION|WORKFLOW_CONTINUATION|CASE_DEVELOPMENT|FACT_UPDATE|CASE_PREPARATION|DOCUMENT_PREPARATION|ADVISORY_PLANNING|STATUS_INQUIRY|ENTITY_LOOKUP|UNKNOWN","legalPhase":"INTAKE|PRE_FILING|FILING|LITIGATION|HEARING_PREP|ENFORCEMENT|POST_JUDGMENT|UNKNOWN","targetEntityType":"client|dossier|lawsuit|task|session|mission|document|note|null","intendedOperation":"create|update|link|inspect|advise|null","routeHint":"GOAL_FIRST|DATABASE_FIRST|CLARIFY","confidence":0.0,"understandingContextNeeded":["string"],"proposalContextNeeded":["string"],"executionContextNeeded":["string"],"secondaryOpportunities":["SUGGEST_CREATE_IF_ABSENT|SUGGEST_NOTE|SUGGEST_TASK|SUGGEST_SESSION|SUGGEST_DOCUMENT|SHOW_STATUS_SUMMARY|RUN_FOCUSED_EXISTENCE_CHECK"]}',
    "Rules:",
    "- GOAL_FIRST when the user is progressing a matter, declaring a legal development, or signaling the need to initiate a workflow, even if no entity exists yet.",
    "- DATABASE_FIRST when the main goal is inspection, lookup, or status retrieval.",
    "- CLARIFY only when understanding is blocked or a proposal would be unsafe without more context.",
    "- Missing execution bindings alone should not force clarification.",
    `userMessage: ${userMessage}`,
    `turnDecomposition: ${JSON.stringify(decomposition)}`,
    `requestContext: ${JSON.stringify(requestSummary)}`,
    `sessionState: ${JSON.stringify(sessionSummary)}`,
    `lastAssistantArtifact: ${JSON.stringify(lastAssistantArtifact)}`,
  ].join("\n");
}

async function classifyWithLLM({
  llmExtractor = null,
  userMessage = "",
  decomposition = {},
  requestContext = {},
  sessionState = {},
  lastAssistantArtifact = null,
} = {}) {
  if (typeof llmExtractor !== "function") return null;
  const prompt = buildJudgePrompt({
    userMessage,
    decomposition,
    requestSummary: summarizeRequestContext(requestContext),
    sessionSummary: summarizeSessionState(sessionState),
    lastAssistantArtifact: summarizeLastAssistantArtifact(lastAssistantArtifact),
  });
  let raw = "";
  try {
    raw = await Promise.race([
      llmExtractor(prompt),
      new Promise((_, reject) => setTimeout(() => reject(new Error("COGNITIVE_INTENT_TIMEOUT")), 1800)),
    ]);
  } catch (_) {
    return null;
  }
  const parsed = parseJsonResponse(raw);
  if (!parsed || typeof parsed !== "object") return null;
  return {
    goalType: normalizeGoalType(parsed.goalType, null),
    legalPhase: normalizeLegalPhase(parsed.legalPhase, null),
    targetEntityType: String(parsed.targetEntityType || "").trim().toLowerCase() || null,
    intendedOperation: String(parsed.intendedOperation || "").trim().toLowerCase() || null,
    routeHint: String(parsed.routeHint || "").trim().toUpperCase() || null,
    confidence: toScore(parsed.confidence, 0),
    understandingContextNeeded: Array.isArray(parsed.understandingContextNeeded)
      ? parsed.understandingContextNeeded
      : [],
    proposalContextNeeded: Array.isArray(parsed.proposalContextNeeded)
      ? parsed.proposalContextNeeded
      : [],
    executionContextNeeded: Array.isArray(parsed.executionContextNeeded)
      ? parsed.executionContextNeeded
      : [],
    secondaryOpportunities: Array.isArray(parsed.secondaryOpportunities)
      ? parsed.secondaryOpportunities
      : [],
  };
}

function convertLlmSecondaryOpportunities(values = []) {
  return (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim().toUpperCase())
    .filter((value) => Object.prototype.hasOwnProperty.call(SECONDARY_OPPORTUNITIES, value))
    .map((value) => ({
      type: SECONDARY_OPPORTUNITIES[value],
      confidence: 0.7,
      gatedByClarification: true,
      reason: "llm_judge_secondary_opportunity",
    }));
}

async function resolveCognitiveGoalIntent({
  userMessage = "",
  requestContext = {},
  sessionState = {},
  lastAssistantArtifact = null,
  llmExtractor = null,
} = {}) {
  const decomposition = decomposeTurnIntent({ userMessage, lastAssistantArtifact });
  const llmDecision = await classifyWithLLM({
    llmExtractor,
    userMessage,
    decomposition,
    requestContext,
    sessionState,
    lastAssistantArtifact,
  });

  const fallbackGoalType = inferFallbackGoalType({
    decomposition,
    requestContext,
    userMessage,
  });
  const goalType = llmDecision?.goalType || fallbackGoalType;
  const targetEntityType =
    llmDecision?.targetEntityType || inferFallbackTargetEntityType({ requestContext, decomposition });
  const intendedOperation =
    llmDecision?.intendedOperation || inferFallbackIntendedOperation({ decomposition, userMessage });
  const legalPhase = llmDecision?.legalPhase || inferFallbackLegalPhase(goalType);
  const signals = inferSignals({ userMessage, decomposition, sessionState });
  const confidence = Math.max(
    llmDecision?.confidence || 0,
    signals.goalDeclaration * 0.3 +
      signals.escalationIntent * 0.25 +
      signals.planningIntent * 0.25 +
      signals.continuityStrength * 0.2,
  );
  const safetyProfile = inferSafetyProfile({
    intendedOperation,
    targetEntityType,
    requestContext,
  });
  const contextRequirements = inferContextRequirements({
    llmDecision,
    goalType,
    targetEntityType,
    intendedOperation,
    requestContext,
    decomposition,
    safetyProfile,
  });
  const routeDecision = arbitrateGoalRoute({
    decomposition,
    confidence,
    understandingSatisfied: contextRequirements.understandingSatisfied,
    proposalSatisfied: contextRequirements.proposalSatisfied,
    exactEntityRequiredForProposal: safetyProfile.exactEntityRequiredForProposal,
    explicitReadIntent: decomposition.hasRetrievalIntent,
    ambiguousExistingEntity: false,
  });

  let primaryRoute = {
    mode: routeDecision.mode,
    reason: routeDecision.reason,
    confidence: toScore(confidence),
  };
  if (
    llmDecision?.routeHint &&
    Object.values(PRIMARY_ROUTES).includes(llmDecision.routeHint) &&
    !(routeDecision.mode === PRIMARY_ROUTES.CLARIFY && llmDecision.routeHint !== PRIMARY_ROUTES.CLARIFY)
  ) {
    primaryRoute = {
      mode: llmDecision.routeHint,
      reason: `${routeDecision.reason}_llm_judge`,
      confidence: Math.max(primaryRoute.confidence, llmDecision.confidence || 0),
    };
  }

  const secondaryOpportunities = [
    ...inferSecondaryOpportunities({
      decomposition,
      goalType,
      targetEntityType,
    }),
    ...convertLlmSecondaryOpportunities(llmDecision?.secondaryOpportunities),
  ].filter(
    (item, index, list) => list.findIndex((candidate) => candidate.type === item.type) === index,
  );

  const minimalSupportingReads = inferMinimalSupportingReads({
    decomposition,
    targetEntityType,
    requestContext,
    primaryMode: primaryRoute.mode,
  });

  return normalizeDecision({
    primaryRoute,
    secondaryOpportunities,
    goal: {
      goalType,
      legalPhase,
      targetEntityType,
      intendedOperation,
    },
    contextRequirements,
    minimalSupportingReads,
    safetyProfile,
    cognitiveSignals: signals,
    observability: {
      llmUsed: Boolean(llmDecision),
      llmLabel: llmDecision?.goalType || null,
      overrides: [],
    },
    turnDecomposition: decomposition,
  });
}

module.exports = {
  resolveCognitiveGoalIntent,
};
