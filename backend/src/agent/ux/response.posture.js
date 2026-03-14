"use strict";

function selectResponsePosture({
  ambiguityResult,
  workflowOpportunity,
  turnType,
  mode,
  researchMode,
} = {}) {
  const normalizedTurnType = normalizeTurnType(turnType);
  if (normalizedTurnType === "CONFIRMATION" || normalizedTurnType === "REJECTION") {
    return "confirmation";
  }

  const ambiguity = toRecord(ambiguityResult);
  if (ambiguity && ambiguity.ambiguous === true) {
    return "clarification";
  }

  const workflow = toRecord(workflowOpportunity);
  if (workflow && workflow.detected === true) {
    return "guided_workflow";
  }

  if (researchMode === true || normalizeMode(mode) === "READ_ONLY") {
    return researchMode === true ? "research_grounded" : "direct_answer";
  }

  return "direct_answer";
}

function normalizeTurnType(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (
    normalized === "NEW" ||
    normalized === "CONFIRMATION" ||
    normalized === "REJECTION" ||
    normalized === "AMENDMENT"
  ) {
    return normalized;
  }
  return "NEW";
}

function normalizeMode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (
    normalized === "READ_ONLY" ||
    normalized === "DRAFT" ||
    normalized === "EXECUTE" ||
    normalized === "AUTONOMOUS"
  ) {
    return normalized;
  }
  return "READ_ONLY";
}

function toRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value;
}

module.exports = {
  selectResponsePosture,
};
