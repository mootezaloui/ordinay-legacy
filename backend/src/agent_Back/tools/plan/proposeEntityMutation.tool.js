"use strict";

const actionProposalSchema = require("../../schemas/actionProposal.schema.json");
const { TOOL_CATEGORIES } = require("../tool.registry");
const agentMutationProposalService = require("../../mutation/agentMutationProposal.service");

const identityCollisionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["type", "entityType", "message", "suggestedActions"],
  properties: {
    type: { const: "identity_collision" },
    sessionId: { anyOf: [{ type: "string" }, { type: "null" }] },
    entityType: { type: "string", minLength: 1 },
    matchedEntity: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["id", "label", "entityType"],
          properties: {
            id: { type: "integer" },
            label: { type: "string", minLength: 1 },
            entityType: { type: "string", minLength: 1 },
            subtitle: { anyOf: [{ type: "string" }, { type: "null" }] },
            metadata: {
              anyOf: [
                { type: "null" },
                { type: "object", additionalProperties: { anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }] } },
              ],
            },
          },
        },
      ],
    },
    matches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "label", "score", "reasons"],
        properties: {
          id: { type: "integer" },
          label: { type: "string", minLength: 1 },
          score: { type: "number" },
          reasons: { type: "array", items: { type: "string" } },
          entityType: { type: "string", minLength: 1 },
          subtitle: { anyOf: [{ type: "string" }, { type: "null" }] },
          metadata: {
            anyOf: [
              { type: "null" },
              { type: "object", additionalProperties: { anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }] } },
            ],
          },
        },
      },
    },
    reasonCode: { anyOf: [{ type: "string" }, { type: "null" }] },
    confidence: { anyOf: [{ type: "number" }, { type: "null" }] },
    ambiguous: { type: "boolean" },
    message: { type: "string", minLength: 1 },
    suggestedActions: { type: "array", items: { type: "string", minLength: 1 } },
    scope: {
      anyOf: [
        { type: "null" },
        { type: "object", additionalProperties: true },
      ],
    },
  },
};

const inputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["entityType", "entityId", "operation", "payload", "reasoningSummary"],
  properties: {
    entityType: {
      type: "string",
      minLength: 1,
    },
    entityId: {
      type: "string",
      minLength: 1,
    },
    operation: {
      type: "string",
      enum: ["create", "update", "delete"],
    },
    payload: {
      type: "object",
      additionalProperties: true,
    },
    reasoningSummary: {
      type: "string",
      minLength: 1,
      maxLength: 280,
    },
    parent: {
      type: "object",
      additionalProperties: false,
      required: ["entityType", "entityId"],
      properties: {
        entityType: { type: "string", minLength: 1 },
        entityId: { type: "integer", minimum: 1 },
        source: { type: "string" },
      },
    },
  },
};

async function handler(input, executionContext = {}) {
  const allowExplicit = executionContext.explicitMutationCommand === true;
  const allowStrongIntent =
    executionContext.strongMutationIntent === true &&
    ["create", "update", "delete"].includes(String(input?.operation || "").toLowerCase());

  if (!allowExplicit && !allowStrongIntent) {
    const err = new Error("Mutation proposals are only allowed via explicit /mutate command");
    err.code = "EXPLICIT_MUTATION_COMMAND_REQUIRED";
    err.status = 403;
    throw err;
  }

  return await agentMutationProposalService.buildProposal(input, executionContext);
}

module.exports = {
  name: "propose_entity_mutation",
  category: TOOL_CATEGORIES.PLAN,
  description:
    "Create a proposal (not execution) for a create/update/delete entity mutation. Callable via explicit /mutate or strong chat mutation intent.",
  inputSchema,
  outputSchema: {
    anyOf: [actionProposalSchema, identityCollisionSchema],
  },
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ["v3"],
  confirmationRequired: false,
  handler,
};
