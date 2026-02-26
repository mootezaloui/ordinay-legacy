"use strict";

const actionProposalSchema = require("../../schemas/actionProposal.schema.json");
const { TOOL_CATEGORIES } = require("../tool.registry");
const agentMutationProposalService = require("../../engine/agentMutationProposal.service");

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

  return agentMutationProposalService.buildProposal(input, executionContext);
}

module.exports = {
  name: "propose_entity_mutation",
  category: TOOL_CATEGORIES.PLAN,
  description:
    "Create a proposal (not execution) for a create/update/delete entity mutation. Callable via explicit /mutate or strong chat mutation intent.",
  inputSchema,
  outputSchema: actionProposalSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ["v3"],
  confirmationRequired: false,
  handler,
};
