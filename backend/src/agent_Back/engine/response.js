"use strict";

const { createAgentResponse, RESPONSE_STATUS } = require("../contracts/agentResponse.contract");

function _transformToAgentResponse(agentRequest, agentOutput) {
  const { intent, output } = agentOutput;

  // Build response based on intent and output type
  const responseData = {
    requestId: agentRequest.requestId,
    agentVersion: agentRequest.agentVersion,
    intent,
    status: RESPONSE_STATUS.SUCCESS,
  };

  // Map output to appropriate response fields
  if (output.type === "chat") {
    responseData.chat = output;
  } else if (output.type === "explanation") {
    responseData.explanation = output;
  } else if (output.type === "operational_risk_analysis") {
    responseData.risks = [output];
  } else if (
    [
      "INVITATION",
      "CLIENT_EMAIL",
      "HEARING_SUMMARY",
      "INTERNAL_NOTE",
    ].includes(output.type)
  ) {
    responseData.drafts = [output];
  } else if (output.type === "action_plan") {
    responseData.actionProposals = output.actions || [];
  }

  return createAgentResponse(responseData);
}

/**
 * Propose a tool action (separated from execution)
 * @param {string} toolName - Name of the tool to call
 * @param {Object} params - Tool parameters
 * @param {Object} policy - Agent policy
 * @param {Object} context - Execution context
 * @returns {Object} Proposal result
 */

module.exports = {
  _transformToAgentResponse,
};
