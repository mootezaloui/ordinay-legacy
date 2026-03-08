"use strict";

const PRIMARY_ROUTES = Object.freeze({
  GOAL_FIRST: "GOAL_FIRST",
  DATABASE_FIRST: "DATABASE_FIRST",
  CLARIFY: "CLARIFY",
});

const GOAL_TYPES = Object.freeze({
  LEGAL_ACTION_INITIATION: "LEGAL_ACTION_INITIATION",
  WORKFLOW_CONTINUATION: "WORKFLOW_CONTINUATION",
  CASE_DEVELOPMENT: "CASE_DEVELOPMENT",
  FACT_UPDATE: "FACT_UPDATE",
  CASE_PREPARATION: "CASE_PREPARATION",
  DOCUMENT_PREPARATION: "DOCUMENT_PREPARATION",
  ADVISORY_PLANNING: "ADVISORY_PLANNING",
  STATUS_INQUIRY: "STATUS_INQUIRY",
  ENTITY_LOOKUP: "ENTITY_LOOKUP",
  UNKNOWN: "UNKNOWN",
});

const LEGAL_PHASES = Object.freeze({
  INTAKE: "INTAKE",
  PRE_FILING: "PRE_FILING",
  FILING: "FILING",
  LITIGATION: "LITIGATION",
  HEARING_PREP: "HEARING_PREP",
  ENFORCEMENT: "ENFORCEMENT",
  POST_JUDGMENT: "POST_JUDGMENT",
  UNKNOWN: "UNKNOWN",
});

const SECONDARY_OPPORTUNITIES = Object.freeze({
  SUGGEST_CREATE_IF_ABSENT: "SUGGEST_CREATE_IF_ABSENT",
  SUGGEST_NOTE: "SUGGEST_NOTE",
  SUGGEST_TASK: "SUGGEST_TASK",
  SUGGEST_SESSION: "SUGGEST_SESSION",
  SUGGEST_DOCUMENT: "SUGGEST_DOCUMENT",
  SHOW_STATUS_SUMMARY: "SHOW_STATUS_SUMMARY",
  RUN_FOCUSED_EXISTENCE_CHECK: "RUN_FOCUSED_EXISTENCE_CHECK",
});

const MINIMAL_SUPPORTING_READ_TYPES = Object.freeze({
  EXISTENCE_CHECK: "EXISTENCE_CHECK",
  SCOPE_CHECK: "SCOPE_CHECK",
  FOCUSED_ENTITY_GRAPH: "FOCUSED_ENTITY_GRAPH",
  STATUS_CHECK: "STATUS_CHECK",
});

function toScore(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function normalizeOpportunity(input = {}) {
  return {
    type: String(input?.type || "").trim().toUpperCase() || SECONDARY_OPPORTUNITIES.SHOW_STATUS_SUMMARY,
    confidence: toScore(input?.confidence),
    gatedByClarification: input?.gatedByClarification !== false,
    reason: String(input?.reason || "").trim() || null,
  };
}

function normalizeMinimalRead(input = {}) {
  const scope =
    input?.scope && typeof input.scope === "object" && !Array.isArray(input.scope)
      ? { ...input.scope }
      : {};
  return {
    type:
      String(input?.type || "").trim().toUpperCase() ||
      MINIMAL_SUPPORTING_READ_TYPES.EXISTENCE_CHECK,
    entityType: String(input?.entityType || "").trim().toLowerCase() || null,
    scope,
    reason: String(input?.reason || "").trim() || null,
  };
}

function createDefaultDecision() {
  return {
    primaryRoute: {
      mode: PRIMARY_ROUTES.DATABASE_FIRST,
      reason: "default_database_first",
      confidence: 0,
    },
    secondaryOpportunities: [],
    goal: {
      goalType: GOAL_TYPES.UNKNOWN,
      legalPhase: LEGAL_PHASES.UNKNOWN,
      targetEntityType: null,
      intendedOperation: null,
    },
    contextRequirements: {
      understandingContextNeeded: [],
      proposalContextNeeded: [],
      executionContextNeeded: [],
      understandingSatisfied: true,
      proposalSatisfied: true,
      executionSatisfied: true,
    },
    minimalSupportingReads: [],
    safetyProfile: {
      class: "LOW",
      exactEntityRequiredForProposal: false,
      exactEntityRequiredForExecution: false,
      confirmationRequired: true,
    },
    cognitiveSignals: {
      goalDeclaration: 0,
      escalationIntent: 0,
      planningIntent: 0,
      advisoryIntent: 0,
      statusInquiry: 0,
      emotionalUrgency: 0,
      continuityStrength: 0,
    },
    observability: {
      llmUsed: false,
      llmLabel: null,
      overrides: [],
    },
    turnDecomposition: {
      hasRetrievalIntent: false,
      hasProgressionIntent: false,
      hasAdvisoryIntent: false,
      hasMixedIntent: false,
    },
  };
}

function normalizeDecision(input = {}) {
  const base = createDefaultDecision();
  const primaryRouteInput =
    input?.primaryRoute && typeof input.primaryRoute === "object" ? input.primaryRoute : {};
  const goalInput = input?.goal && typeof input.goal === "object" ? input.goal : {};
  const contextInput =
    input?.contextRequirements && typeof input.contextRequirements === "object"
      ? input.contextRequirements
      : {};
  const safetyInput =
    input?.safetyProfile && typeof input.safetyProfile === "object" ? input.safetyProfile : {};
  const signalsInput =
    input?.cognitiveSignals && typeof input.cognitiveSignals === "object"
      ? input.cognitiveSignals
      : {};
  const obsInput =
    input?.observability && typeof input.observability === "object" ? input.observability : {};
  const decompInput =
    input?.turnDecomposition && typeof input.turnDecomposition === "object"
      ? input.turnDecomposition
      : {};

  return {
    ...base,
    primaryRoute: {
      mode:
        String(primaryRouteInput.mode || "").trim().toUpperCase() || base.primaryRoute.mode,
      reason: String(primaryRouteInput.reason || base.primaryRoute.reason).trim(),
      confidence: toScore(primaryRouteInput.confidence, base.primaryRoute.confidence),
    },
    secondaryOpportunities: Array.isArray(input?.secondaryOpportunities)
      ? input.secondaryOpportunities.map(normalizeOpportunity)
      : base.secondaryOpportunities,
    goal: {
      goalType: String(goalInput.goalType || base.goal.goalType).trim().toUpperCase(),
      legalPhase: String(goalInput.legalPhase || base.goal.legalPhase).trim().toUpperCase(),
      targetEntityType:
        String(goalInput.targetEntityType || "").trim().toLowerCase() || base.goal.targetEntityType,
      intendedOperation:
        String(goalInput.intendedOperation || "").trim().toLowerCase() || base.goal.intendedOperation,
    },
    contextRequirements: {
      understandingContextNeeded: Array.isArray(contextInput.understandingContextNeeded)
        ? contextInput.understandingContextNeeded.map((v) => String(v || "").trim()).filter(Boolean)
        : base.contextRequirements.understandingContextNeeded,
      proposalContextNeeded: Array.isArray(contextInput.proposalContextNeeded)
        ? contextInput.proposalContextNeeded.map((v) => String(v || "").trim()).filter(Boolean)
        : base.contextRequirements.proposalContextNeeded,
      executionContextNeeded: Array.isArray(contextInput.executionContextNeeded)
        ? contextInput.executionContextNeeded.map((v) => String(v || "").trim()).filter(Boolean)
        : base.contextRequirements.executionContextNeeded,
      understandingSatisfied: Boolean(
        contextInput.understandingSatisfied ?? base.contextRequirements.understandingSatisfied,
      ),
      proposalSatisfied: Boolean(
        contextInput.proposalSatisfied ?? base.contextRequirements.proposalSatisfied,
      ),
      executionSatisfied: Boolean(
        contextInput.executionSatisfied ?? base.contextRequirements.executionSatisfied,
      ),
    },
    minimalSupportingReads: Array.isArray(input?.minimalSupportingReads)
      ? input.minimalSupportingReads.map(normalizeMinimalRead)
      : base.minimalSupportingReads,
    safetyProfile: {
      class: String(safetyInput.class || base.safetyProfile.class).trim().toUpperCase(),
      exactEntityRequiredForProposal: Boolean(
        safetyInput.exactEntityRequiredForProposal ??
          base.safetyProfile.exactEntityRequiredForProposal,
      ),
      exactEntityRequiredForExecution: Boolean(
        safetyInput.exactEntityRequiredForExecution ??
          base.safetyProfile.exactEntityRequiredForExecution,
      ),
      confirmationRequired: Boolean(
        safetyInput.confirmationRequired ?? base.safetyProfile.confirmationRequired,
      ),
    },
    cognitiveSignals: {
      goalDeclaration: toScore(signalsInput.goalDeclaration, base.cognitiveSignals.goalDeclaration),
      escalationIntent: toScore(
        signalsInput.escalationIntent,
        base.cognitiveSignals.escalationIntent,
      ),
      planningIntent: toScore(signalsInput.planningIntent, base.cognitiveSignals.planningIntent),
      advisoryIntent: toScore(signalsInput.advisoryIntent, base.cognitiveSignals.advisoryIntent),
      statusInquiry: toScore(signalsInput.statusInquiry, base.cognitiveSignals.statusInquiry),
      emotionalUrgency: toScore(
        signalsInput.emotionalUrgency,
        base.cognitiveSignals.emotionalUrgency,
      ),
      continuityStrength: toScore(
        signalsInput.continuityStrength,
        base.cognitiveSignals.continuityStrength,
      ),
    },
    observability: {
      llmUsed: Boolean(obsInput.llmUsed),
      llmLabel: String(obsInput.llmLabel || "").trim() || null,
      overrides: Array.isArray(obsInput.overrides)
        ? obsInput.overrides.map((v) => String(v || "").trim()).filter(Boolean)
        : [],
    },
    turnDecomposition: {
      hasRetrievalIntent: Boolean(decompInput.hasRetrievalIntent),
      hasProgressionIntent: Boolean(decompInput.hasProgressionIntent),
      hasAdvisoryIntent: Boolean(decompInput.hasAdvisoryIntent),
      hasMixedIntent: Boolean(decompInput.hasMixedIntent),
    },
  };
}

module.exports = {
  PRIMARY_ROUTES,
  GOAL_TYPES,
  LEGAL_PHASES,
  SECONDARY_OPPORTUNITIES,
  MINIMAL_SUPPORTING_READ_TYPES,
  createDefaultDecision,
  normalizeDecision,
};
