"use strict";

function selectResponsePosture({
  ambiguityResult,
  workflowOpportunity,
  turnType,
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

  if (researchMode === true) {
    return "research_grounded";
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

function toRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value;
}

module.exports = {
  selectResponsePosture,
};
