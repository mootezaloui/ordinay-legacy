"use strict";

const { TOOL_CATEGORIES } = require("../tool.registry");
const documentGenerationService = require("../../../services/documentGeneration/documentGeneration.service");

const inputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["target", "documentType", "language", "format"],
  properties: {
    target: {
      type: "object",
      additionalProperties: false,
      required: ["type", "id"],
      properties: {
        type: { type: "string" },
        id: { type: "integer", minimum: 1 },
      },
    },
    documentType: { type: "string" },
    language: { type: "string", enum: ["ar", "en"] },
    format: { type: "string", enum: ["html", "pdf", "docx"] },
    instructions: { type: "string" },
  },
};

const outputSchema = {
  type: "object",
  additionalProperties: true,
  required: ["status", "documentType", "templateKey", "schemaVersion"],
  properties: {
    status: { type: "string", enum: ["missing_fields", "ready"] },
    documentType: { type: "string" },
    templateKey: { type: "string" },
    schemaVersion: { type: "string" },
  },
};

async function handler(params) {
  return documentGenerationService.planDocument(params);
}

module.exports = {
  name: "planGeneratedDocument",
  category: TOOL_CATEGORIES.DRAFT,
  description: "Plan structured AI-assisted document generation without mutation",
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ["v3"],
  confirmationRequired: false,
  handler,
};
