"use strict";

const { TOOL_CATEGORIES } = require("../tool.registry");
const documentGenerationService = require("../../../services/documentGeneration/documentGeneration.service");

const legacyInputSchema = {
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

const minimalDraftInputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["content"],
  properties: {
    title: { type: "string" },
    content: { type: "string", minLength: 1 },
    metadata: { type: "object", additionalProperties: true },
  },
};

const inputSchema = {
  oneOf: [legacyInputSchema, minimalDraftInputSchema],
};

const legacyOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "type",
    "status",
    "title",
    "language",
    "content",
    "metadata",
    "documentType",
    "templateKey",
    "schemaVersion",
  ],
  properties: {
    type: { type: "string", const: "document_generation_plan" },
    status: { type: "string", enum: ["missing_fields", "ready"] },
    title: { type: "string" },
    language: { type: "string", enum: ["ar", "en"] },
    content: { type: "object", additionalProperties: true },
    metadata: {
      type: "object",
      additionalProperties: false,
      required: ["templateKey", "schemaVersion", "documentType", "language", "format"],
      properties: {
        templateKey: { type: "string" },
        schemaVersion: { type: "string" },
        documentType: { type: "string" },
        language: { type: "string", enum: ["ar", "en"] },
        format: { type: "string", enum: ["html", "pdf", "docx"] },
      },
    },
    entityType: { type: "string" },
    entityId: { type: "integer", minimum: 1 },
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
    templateKey: { type: "string" },
    schemaVersion: { type: "string" },
    missingFields: { type: "array", items: { type: "object" } },
    placeholderFindings: { type: "array", items: { type: "object" } },
    previewHtml: { type: "string" },
  },
};

const minimalDraftOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["type", "title", "content", "metadata"],
  properties: {
    type: { type: "string", const: "document_draft" },
    title: { type: "string" },
    content: { type: "string" },
    metadata: { type: "object", additionalProperties: true },
    entityType: { anyOf: [{ type: "string" }, { type: "null" }] },
    entityId: { anyOf: [{ type: "integer", minimum: 1 }, { type: "null" }] },
  },
};

const outputSchema = {
  oneOf: [legacyOutputSchema, minimalDraftOutputSchema],
};

function isMinimalDraftRequest(params = {}) {
  return (
    params &&
    typeof params === "object" &&
    typeof params.content === "string" &&
    !Object.prototype.hasOwnProperty.call(params, "target")
  );
}

async function handler(params) {
  if (isMinimalDraftRequest(params)) {
    const metadata =
      params.metadata && typeof params.metadata === "object" && !Array.isArray(params.metadata)
        ? { ...params.metadata }
        : {};
    const title =
      (typeof params.title === "string" && params.title.trim()) ||
      (typeof metadata.title === "string" && metadata.title.trim()) ||
      "Document Draft";
    return {
      type: "document_draft",
      title: String(title).trim(),
      content: String(params.content || ""),
      metadata,
      entityType: null,
      entityId: null,
    };
  }

  const plan = await documentGenerationService.planDocument(params);
  const target = plan?.target && typeof plan.target === "object" ? plan.target : params?.target || null;
  const title =
    plan?.contentJson?.content?.title ||
    `${plan?.documentType || params?.documentType || "document"} ${
      target?.type || "entity"
    }#${target?.id || "unknown"}`;
  return {
    type: "document_generation_plan",
    status: plan.status,
    title,
    language: plan.language,
    content: {
      markdown: plan?.contentJson?.content?.markdown || "",
      contentJson: plan.contentJson || null,
      previewHtml: plan.previewHtml || "",
    },
    metadata: {
      templateKey: plan.templateKey,
      schemaVersion: plan.schemaVersion,
      documentType: plan.documentType,
      language: plan.language,
      format: plan.format,
    },
    ...(target?.type && Number.isInteger(Number(target?.id))
      ? {
          entityType: String(target.type).toLowerCase(),
          entityId: Number(target.id),
          target: { type: String(target.type).toLowerCase(), id: Number(target.id) },
        }
      : {}),
    documentType: plan.documentType,
    templateKey: plan.templateKey,
    schemaVersion: plan.schemaVersion,
    missingFields: Array.isArray(plan.missingFields) ? plan.missingFields : [],
    placeholderFindings: Array.isArray(plan.placeholderFindings) ? plan.placeholderFindings : [],
    previewHtml: plan.previewHtml || "",
  };
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
