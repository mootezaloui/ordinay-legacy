"use strict";

function validateTurnArtifactComposition(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("turn artifact composition must be an object");
  }
  const assistantText =
    input.assistantText && typeof input.assistantText === "object" ? input.assistantText : null;
  if (!assistantText || assistantText.required !== true) {
    throw new Error("assistantText.required must be true");
  }
  if (!Array.isArray(input.suggestions)) {
    throw new Error("suggestions must be an array");
  }
  if (!Array.isArray(input.proposalArtifacts)) {
    throw new Error("proposalArtifacts must be an array");
  }
  if (
    input.clarificationArtifact !== null &&
    input.clarificationArtifact !== undefined &&
    (typeof input.clarificationArtifact !== "object" || Array.isArray(input.clarificationArtifact))
  ) {
    throw new Error("clarificationArtifact must be an object or null");
  }
  return Object.freeze({
    assistantText: Object.freeze({ ...assistantText }),
    suggestions: Object.freeze(input.suggestions.map((item) => Object.freeze({ ...item }))),
    proposalArtifacts: Object.freeze(input.proposalArtifacts.map((item) => Object.freeze({ ...item }))),
    clarificationArtifact:
      input.clarificationArtifact && typeof input.clarificationArtifact === "object"
        ? Object.freeze({ ...input.clarificationArtifact })
        : null,
    primaryRoute: String(input.primaryRoute || "").trim().toUpperCase() || null,
  });
}

module.exports = {
  validateTurnArtifactComposition,
};
