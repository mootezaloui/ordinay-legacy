"use strict";

const actionProposalSchema = require("../../schemas/actionProposal.schema.json");
const { TOOL_CATEGORIES } = require("../tool.registry");
const workflowProposalService = require("../../engine/agentMutationWorkflowProposal.service");

const inputSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "workflowType",
    "rootEntity",
    "requestedGoal",
    "facts",
    "steps",
    "canReachRequestedGoal",
    "reasoningSummary",
  ],
  properties: {
    workflowType: { type: "string", minLength: 1 },
    rootEntity: {
      type: "object",
      additionalProperties: false,
      required: ["type", "id"],
      properties: {
        type: { type: "string", minLength: 1 },
        id: { type: "integer", minimum: 1 },
      },
    },
    rootLabel: { type: "string", minLength: 1 },
    requestedGoal: {
      type: "object",
      additionalProperties: true,
    },
    facts: {
      type: "object",
      additionalProperties: true,
    },
    steps: {
      type: "array",
      minItems: 1,
      items: { type: "object", additionalProperties: true },
    },
    canReachRequestedGoal: { type: "boolean" },
    blockedTerminalStep: {
      anyOf: [
        { type: "null" },
        { type: "object", additionalProperties: true },
      ],
    },
    reasoningSummary: {
      type: "string",
      minLength: 1,
      maxLength: 280,
    },
  },
};

async function handler(input, executionContext = {}) {
  const allowStrongIntent = executionContext.strongMutationIntent === true;
  const allowExplicit = executionContext.explicitMutationCommand === true;
  if (!allowStrongIntent && !allowExplicit) {
    const err = new Error("Mutation workflow proposals are only allowed from approved mutation flows");
    err.code = "EXPLICIT_MUTATION_COMMAND_REQUIRED";
    err.status = 403;
    throw err;
  }
  return workflowProposalService.buildWorkflowProposal(input, executionContext);
}

module.exports = {
  name: "propose_mutation_workflow",
  category: TOOL_CATEGORIES.PLAN,
  description:
    "Create a confirmation proposal for a multi-step mutation workflow that resolves data constraints before applying a requested change.",
  inputSchema,
  outputSchema: actionProposalSchema,
  reversibility: false,
  sideEffects: false,
  allowedAgentVersions: ["v3"],
  confirmationRequired: false,
  handler,
};
