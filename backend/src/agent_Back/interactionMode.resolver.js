"use strict";

const DRAFT_OUTPUT_TYPES = new Set([
  "INVITATION",
  "CLIENT_EMAIL",
  "HEARING_SUMMARY",
  "INTERNAL_NOTE",
  "document_generation_preview",
  "document_generation_missing_fields",
]);

const ANALYSIS_OUTPUT_TYPES = new Set([
  "operational_risk_analysis",
  "action_plan",
]);

const RESOLUTION_OUTPUT_TYPES = new Set([
  "context_suggestion",
  "clarification",
  "routing_clarification",
]);

function hasMutationSignal(toolExecutions = []) {
  if (!Array.isArray(toolExecutions)) return false;
  return toolExecutions.some((entry) => {
    const result = entry?.result;
    return Boolean(result?.proposalId || result?.requiresConfirmation === true);
  });
}

function resolveInteractionMode({
  output,
  intent,
  result = null,
  toolExecutions = [],
  documentContext = null,
} = {}) {
  const outputType = String(output?.type || "");
  const hasArtifact = outputType !== "" && outputType !== "chat";
  const requiresEntityResolution =
    RESOLUTION_OUTPUT_TYPES.has(outputType) ||
    result?.needsClarification === true ||
    result?.resolutionMode === true;
  const hasSystemDataAccess =
    (Array.isArray(toolExecutions) && toolExecutions.length > 0) ||
    hasArtifact ||
    Boolean(
      documentContext &&
        Array.isArray(documentContext.documents) &&
        documentContext.documents.length > 0,
    );
  const hasMutation =
    outputType === "proposal" || hasMutationSignal(toolExecutions);
  const hasDrafting = DRAFT_OUTPUT_TYPES.has(outputType);
  const hasAnalysis =
    ANALYSIS_OUTPUT_TYPES.has(outputType) ||
    String(intent || "").toUpperCase().startsWith("ANALYZE_");

  const conversational =
    !hasArtifact &&
    !requiresEntityResolution &&
    !hasSystemDataAccess &&
    !hasMutation &&
    !hasDrafting &&
    !hasAnalysis;

  return conversational ? "conversational" : "operational";
}

function resolveStageVisibility(interactionMode, stage) {
  const mode = String(interactionMode || "operational").toLowerCase();
  if (mode !== "conversational") return "visible";
  if (stage === "intent" || stage === "commentary") return "metadata";
  return "visible";
}

module.exports = {
  resolveInteractionMode,
  resolveStageVisibility,
};

