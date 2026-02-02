'use strict';

/**
 * Action Proposal Contract
 *
 * CRITICAL: Action proposals are data, NOT commands.
 *
 * This contract defines the structure of proposed actions, even when execution is blocked.
 * In v1/v2: proposals may exist, execution remains impossible.
 * In v3: proposals must be explicitly confirmed before execution.
 *
 * NO action may execute without passing through this proposal stage.
 */

/**
 * Action Status (ENUM)
 */
const ACTION_STATUS = Object.freeze({
  /**
   * PROPOSED
   * Action has been proposed but not yet evaluated
   */
  PROPOSED: 'PROPOSED',

  /**
   * PERMITTED
   * Action passed all permission checks and can proceed to confirmation
   */
  PERMITTED: 'PERMITTED',

  /**
   * BLOCKED
   * Action was blocked by firewall (version, category, or execution constraints)
   */
  BLOCKED: 'BLOCKED',

  /**
   * CONFIRMED
   * Action has been explicitly confirmed by user and is ready for execution
   */
  CONFIRMED: 'CONFIRMED',

  /**
   * REJECTED
   * Action was rejected by user
   */
  REJECTED: 'REJECTED',

  /**
   * EXECUTED
   * Action has been successfully executed
   */
  EXECUTED: 'EXECUTED',

  /**
   * FAILED
   * Action execution failed
   */
  FAILED: 'FAILED',
});

/**
 * Validate action status
 * @param {string} status - Action status
 * @throws {Error} If status is invalid
 */
function validateActionStatus(status) {
  const validStatuses = Object.values(ACTION_STATUS);
  if (!validStatuses.includes(status)) {
    throw new Error(
      `Invalid action status: "${status}". Must be one of: ${validStatuses.join(', ')}`
    );
  }
}

/**
 * Create an action proposal with validation
 * @param {Object} proposal - Proposal data
 * @param {string} proposal.proposalId - Unique proposal identifier
 * @param {string} proposal.actionType - Action type (must match tool name)
 * @param {string} proposal.toolCategory - Tool category (read/analysis/draft/execute)
 * @param {Object} proposal.params - Action parameters (validated against tool input schema)
 * @param {boolean} proposal.reversible - Whether action can be reversed
 * @param {boolean} proposal.requiresConfirmation - Whether action requires explicit confirmation
 * @param {string} proposal.humanReadableSummary - Human-readable description of what action will do
 * @param {Array} proposal.affectedEntities - Entities that will be affected
 * @param {string} proposal.status - Proposal status
 * @param {string} [proposal.blockedReason] - If BLOCKED, the reason
 * @param {Object} [proposal.suggestedAlternative] - If BLOCKED, suggested alternative action
 * @returns {Object} Validated action proposal
 * @throws {Error} If validation fails
 */
function createActionProposal({
  proposalId,
  actionType,
  toolCategory,
  params,
  reversible,
  requiresConfirmation,
  humanReadableSummary,
  affectedEntities,
  status,
  blockedReason = null,
  suggestedAlternative = null,
}) {
  // Validate required fields
  if (!proposalId || typeof proposalId !== 'string') {
    throw new Error('proposalId is required and must be a string');
  }

  if (!actionType || typeof actionType !== 'string') {
    throw new Error('actionType is required and must be a string');
  }

  const validCategories = ['read', 'analysis', 'draft', 'execute'];
  if (!validCategories.includes(toolCategory)) {
    throw new Error(
      `toolCategory must be one of: ${validCategories.join(', ')}`
    );
  }

  if (typeof reversible !== 'boolean') {
    throw new Error('reversible must be a boolean');
  }

  if (typeof requiresConfirmation !== 'boolean') {
    throw new Error('requiresConfirmation must be a boolean');
  }

  if (!humanReadableSummary || typeof humanReadableSummary !== 'string') {
    throw new Error('humanReadableSummary is required and must be a string');
  }

  if (!Array.isArray(affectedEntities)) {
    throw new Error('affectedEntities must be an array');
  }

  // Validate status
  validateActionStatus(status);

  // If BLOCKED, blockedReason is required
  if (status === ACTION_STATUS.BLOCKED && !blockedReason) {
    throw new Error('blockedReason is required when status is BLOCKED');
  }

  // Execute tools MUST require confirmation
  if (toolCategory === 'execute' && !requiresConfirmation) {
    throw new Error('Execute tools MUST require confirmation');
  }

  return Object.freeze({
    proposalId,
    actionType,
    toolCategory,
    params: Object.freeze(params),
    reversible,
    requiresConfirmation,
    humanReadableSummary,
    affectedEntities: Object.freeze([...affectedEntities]),
    status,
    blockedReason,
    suggestedAlternative: suggestedAlternative ? Object.freeze(suggestedAlternative) : null,
    proposedAt: new Date().toISOString(),
  });
}

/**
 * Generate a unique proposal ID
 * @param {string} actionType - Action type
 * @param {string} agentVersion - Agent version
 * @returns {string} Unique proposal ID
 */
function generateProposalId(actionType, agentVersion) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${agentVersion}-${actionType}-${timestamp}-${random}`;
}

module.exports = {
  ACTION_STATUS,
  validateActionStatus,
  createActionProposal,
  generateProposalId,
};
