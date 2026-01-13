'use strict';

/**
 * Agent Response Contract
 *
 * CRITICAL: This contract defines what the Agent can return to the UI.
 *
 * The Agent is AUTHORITATIVE, not FLEXIBLE.
 * Partial responses are FORBIDDEN.
 * If ANY section fails validation → ENTIRE response FAILS.
 *
 * All Agent responses MUST pass through this validation boundary.
 */

/**
 * Response Status (ENUM)
 *
 * Explicit status of the agent response.
 */
const RESPONSE_STATUS = Object.freeze({
  /**
   * SUCCESS
   * Agent completed request successfully
   */
  SUCCESS: 'SUCCESS',

  /**
   * BLOCKED
   * Agent blocked request due to policy, permissions, or safety
   */
  BLOCKED: 'BLOCKED',

  /**
   * FAILED
   * Agent failed to process request due to error
   */
  FAILED: 'FAILED',
});

/**
 * Validate response status
 * @param {string} status - Response status
 * @throws {Error} If status is invalid
 */
function validateResponseStatus(status) {
  const validStatuses = Object.values(RESPONSE_STATUS);
  if (!validStatuses.includes(status)) {
    throw new Error(
      `Invalid response status: "${status}". Must be one of: ${validStatuses.join(', ')}`
    );
  }
}

/**
 * Generate a unique response ID
 * @param {string} requestId - Request ID
 * @returns {string} Unique response ID
 */
function generateResponseId(requestId) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `res-${requestId}-${timestamp}-${random}`;
}

/**
 * Create an agent response with validation
 *
 * This is the ONLY way the Agent can send responses to the UI.
 *
 * CRITICAL: If any section fails validation, the ENTIRE response FAILS.
 * NO partial responses, NO silent failures, NO guessing.
 *
 * @param {Object} response - Response data
 * @param {string} response.requestId - Original request ID
 * @param {string} response.agentVersion - Agent version used
 * @param {string} response.intent - Intent that was processed
 * @param {string} response.status - Response status (SUCCESS | BLOCKED | FAILED)
 * @param {Object} [response.explanation] - Optional explanation (schema-validated)
 * @param {Array} [response.risks] - Optional risks array (schema-validated)
 * @param {Array} [response.drafts] - Optional drafts array (schema-validated)
 * @param {Array} [response.actionProposals] - Optional action proposals (schema-validated)
 * @param {string} [response.blockingReason] - Reason for BLOCKED status (required if BLOCKED)
 * @param {Array} [response.errors] - Errors for FAILED status (required if FAILED)
 * @param {string} [response.responseId] - Optional response ID (generated if not provided)
 * @returns {Object} Validated agent response
 * @throws {Error} If validation fails
 */
function createAgentResponse({
  requestId,
  agentVersion,
  intent,
  status,
  explanation = null,
  risks = [],
  drafts = [],
  actionProposals = [],
  blockingReason = null,
  errors = [],
  responseId,
}) {
  // Validate requestId
  if (!requestId || typeof requestId !== 'string') {
    throw new Error('requestId is required and must be a string');
  }

  // Validate agentVersion
  const validVersions = ['v1', 'v2', 'v3'];
  if (!validVersions.includes(agentVersion)) {
    throw new Error(
      `agentVersion must be one of: ${validVersions.join(', ')}`
    );
  }

  // Validate intent
  if (!intent || typeof intent !== 'string') {
    throw new Error('intent is required and must be a string');
  }

  // Validate status
  validateResponseStatus(status);

  // Status-specific validation
  if (status === RESPONSE_STATUS.BLOCKED) {
    if (!blockingReason || typeof blockingReason !== 'string' || blockingReason.trim().length === 0) {
      throw new Error('blockingReason is required when status is BLOCKED');
    }
  }

  if (status === RESPONSE_STATUS.FAILED) {
    if (!Array.isArray(errors) || errors.length === 0) {
      throw new Error('errors array is required and must be non-empty when status is FAILED');
    }

    // Validate error structure
    errors.forEach((error, index) => {
      if (!error || typeof error !== 'object') {
        throw new Error(`errors[${index}] must be an object`);
      }
      if (!error.message || typeof error.message !== 'string') {
        throw new Error(`errors[${index}].message is required and must be a string`);
      }
      if (!error.code || typeof error.code !== 'string') {
        throw new Error(`errors[${index}].code is required and must be a string`);
      }
    });
  }

  // Validate arrays
  if (!Array.isArray(risks)) {
    throw new Error('risks must be an array');
  }

  if (!Array.isArray(drafts)) {
    throw new Error('drafts must be an array');
  }

  if (!Array.isArray(actionProposals)) {
    throw new Error('actionProposals must be an array');
  }

  // Validate explanation (if provided)
  if (explanation !== null) {
    if (typeof explanation !== 'object') {
      throw new Error('explanation must be an object or null');
    }
    // Explanation structure validated by explanation.schema.json
  }

  // Validate risks array elements
  // Each risk must conform to risk.schema.json (validated by Agent Engine)
  risks.forEach((risk, index) => {
    if (!risk || typeof risk !== 'object') {
      throw new Error(`risks[${index}] must be an object`);
    }
    if (risk.type !== 'operational_risk_analysis') {
      throw new Error(`risks[${index}].type must be 'operational_risk_analysis'`);
    }
  });

  // Validate drafts array elements
  // Each draft must conform to draft.schema.json (validated by Agent Engine)
  drafts.forEach((draft, index) => {
    if (!draft || typeof draft !== 'object') {
      throw new Error(`drafts[${index}] must be an object`);
    }
    if (!draft.type || !['INVITATION', 'CLIENT_EMAIL', 'HEARING_SUMMARY', 'INTERNAL_NOTE'].includes(draft.type)) {
      throw new Error(`drafts[${index}].type must be a valid draft type`);
    }
    if (!draft.sections || typeof draft.sections !== 'object') {
      throw new Error(`drafts[${index}].sections is required`);
    }
    if (!draft.metadata || typeof draft.metadata !== 'object') {
      throw new Error(`drafts[${index}].metadata is required`);
    }
  });

  // Validate action proposals array elements
  // Each proposal must conform to actionProposal schema
  actionProposals.forEach((proposal, index) => {
    if (!proposal || typeof proposal !== 'object') {
      throw new Error(`actionProposals[${index}] must be an object`);
    }
    if (!proposal.proposalId || typeof proposal.proposalId !== 'string') {
      throw new Error(`actionProposals[${index}].proposalId is required and must be a string`);
    }
    if (!proposal.status || typeof proposal.status !== 'string') {
      throw new Error(`actionProposals[${index}].status is required and must be a string`);
    }
  });

  // NO FORBIDDEN FIELDS ALLOWED
  // Agent cannot send these fields (they are UI-controlled or internal)
  const forbiddenFields = [
    'rawLLMOutput',       // Agent cannot leak raw LLM output
    'internalDebug',      // Agent cannot leak debug info
    'toolTrace',          // Agent cannot leak tool execution trace
    'policyOverride',     // Agent cannot send policy overrides
    'executionResult',    // Agent cannot send raw execution results
    'unsafeContent',      // Agent cannot send unvalidated content
  ];

  forbiddenFields.forEach(field => {
    if (field in arguments[0]) {
      throw new Error(
        `AgentResponse must not contain "${field}". Agent cannot leak internal data or unsafe content.`
      );
    }
  });

  // Generate response ID if not provided
  const finalResponseId = responseId || generateResponseId(requestId);

  return Object.freeze({
    responseId: finalResponseId,
    requestId,
    agentVersion,
    intent,
    status,
    explanation: explanation ? Object.freeze(explanation) : null,
    risks: Object.freeze([...risks.map(r => Object.freeze(r))]),
    drafts: Object.freeze([...drafts.map(d => Object.freeze(d))]),
    actionProposals: Object.freeze([...actionProposals.map(a => Object.freeze(a))]),
    blockingReason: status === RESPONSE_STATUS.BLOCKED ? blockingReason : null,
    errors: status === RESPONSE_STATUS.FAILED ? Object.freeze([...errors.map(e => Object.freeze(e))]) : [],
    generatedAt: new Date().toISOString(),
  });
}

/**
 * Validate that a response object conforms to the contract
 * @param {Object} response - Response to validate
 * @returns {boolean} true if valid
 * @throws {Error} If validation fails
 */
function validateAgentResponse(response) {
  if (!response || typeof response !== 'object') {
    throw new Error('Response must be an object');
  }

  // Use createAgentResponse to validate (it will throw if invalid)
  createAgentResponse(response);

  return true;
}

/**
 * Create a SUCCESS response
 * @param {Object} params - Response parameters
 * @returns {Object} Validated SUCCESS response
 */
function createSuccessResponse(params) {
  return createAgentResponse({
    ...params,
    status: RESPONSE_STATUS.SUCCESS,
  });
}

/**
 * Create a BLOCKED response
 * @param {Object} params - Response parameters
 * @param {string} params.blockingReason - Reason for blocking (required)
 * @returns {Object} Validated BLOCKED response
 */
function createBlockedResponse(params) {
  if (!params.blockingReason) {
    throw new Error('blockingReason is required for BLOCKED response');
  }

  return createAgentResponse({
    ...params,
    status: RESPONSE_STATUS.BLOCKED,
  });
}

/**
 * Create a FAILED response
 * @param {Object} params - Response parameters
 * @param {Array} params.errors - Errors array (required)
 * @returns {Object} Validated FAILED response
 */
function createFailedResponse(params) {
  if (!params.errors || !Array.isArray(params.errors) || params.errors.length === 0) {
    throw new Error('errors array is required for FAILED response');
  }

  return createAgentResponse({
    ...params,
    status: RESPONSE_STATUS.FAILED,
  });
}

module.exports = {
  RESPONSE_STATUS,
  validateResponseStatus,
  generateResponseId,
  createAgentResponse,
  validateAgentResponse,
  createSuccessResponse,
  createBlockedResponse,
  createFailedResponse,
};
