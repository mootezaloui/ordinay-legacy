"use strict";

function buildMutationIntentExtractionPrompt({
  message,
  activeEntity = null,
  allowedEntityTypes = [],
}) {
  const entityList = Array.isArray(allowedEntityTypes) && allowedEntityTypes.length
    ? allowedEntityTypes.join(", ")
    : "client, dossier, lawsuit, task, personal_task, mission, officer, session, financial_entry, document";

  return [
    "Extract a possible SINGLE-ENTITY SINGLE-FIELD mutation intent from the user message.",
    "Return JSON only. Do not include markdown.",
    "Do not infer multi-entity updates.",
    "If intent is weak, hypothetical, or a question, set hasMutationIntent=false.",
    "Allowed operation values: update, create, unknown.",
    `Allowed entity types: ${entityList}.`,
    "Schema:",
    JSON.stringify(
      {
        hasMutationIntent: true,
        intentStrength: "strong",
        operation: "update",
        entityType: "session",
        entityReference: { kind: "id", value: "42" },
        field: "scheduled_at",
        newValueRaw: "March 12",
        reasoningSummary: "User explicitly asked to move the hearing date.",
        intentSentence: "Update hearing date to March 12.",
        ambiguityFlags: [],
        modelConfidence: 0.91,
      },
      null,
      2,
    ),
    `Active entity context: ${JSON.stringify(activeEntity || null)}`,
    `User message: ${String(message || "")}`,
    "JSON:",
  ].join("\n");
}

module.exports = {
  buildMutationIntentExtractionPrompt,
};
