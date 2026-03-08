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
 *
 * V3 UNIVERSAL ACTION FAMILIES:
 * - CREATE_ENTITY: Create any entity type (params: { entityType, payload })
 * - UPDATE_ENTITY: Update any entity with field-level diffs (params: { entityType, entityId, changes })
 * - LINK_ENTITIES: Change parent-child relationships (params: { relationType, from, to, mode })
 * - ATTACH_TO_ENTITY: Add notes/documents to any entity (params: { target, attachmentType, payload })
 *
 * V3 LEGACY ACTIONS (deprecated, backward compatible):
 * - CREATE_TASK, UPDATE_TASK, ADD_NOTE, CREATE_DOCUMENT_DRAFT, UPDATE_DOCUMENT_METADATA
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

function validateJsonLike(value, path = "value") {
  if (value === null || value === undefined) return;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return;
  if (Array.isArray(value)) {
    value.forEach((item, idx) => validateJsonLike(item, `${path}[${idx}]`));
    return;
  }
  if (t === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (typeof key !== "string") {
        throw new Error(`${path} contains non-string key`);
      }
      validateJsonLike(item, `${path}.${key}`);
    }
    return;
  }
  throw new Error(`${path} must be JSON-serializable`);
}

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
 * @param {string} proposal.actionType - Action family identifier (for execute proposals this may map to universalMutation during confirmation)
 * @param {string} proposal.toolCategory - Tool category (read/analysis/draft/execute)
 * @param {Object} proposal.params - Action parameters (validated against tool input schema)
 * @param {boolean} proposal.reversible - Whether action can be reversed
 * @param {boolean} proposal.requiresConfirmation - Whether action requires explicit confirmation
 * @param {string} proposal.humanReadableSummary - Human-readable description of what action will do
 * @param {Array} proposal.affectedEntities - Entities that will be affected
 * @param {string} proposal.status - Proposal status
 * @param {string} [proposal.blockedReason] - If BLOCKED, the reason
 * @param {Object} [proposal.suggestedAlternative] - If BLOCKED, suggested alternative action
 * @param {string} [proposal.version] - V3: Agent version
 * @param {string} [proposal.posture] - V3: Interaction posture (must be WORK for execution)
 * @param {Object} [proposal.snapshot] - V3: Entity snapshot for validation { scope, scopeId, timestamp, hash }
 * @param {string} [proposal.userMessageDraft] - V3: Draft message to user
 * @param {Object} [proposal.confirmation] - V3: Confirmation config { mode, expiresAt }
 * @param {string} [proposal.sessionId] - V3: Session identifier
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
  version = null,
  posture = null,
  snapshot = null,
  userMessageDraft = null,
  confirmation = null,
  sessionId = null,
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

  // V3: Validate posture if provided
  if (posture && !['WORK', 'ASSISTANT', 'INSPECTION'].includes(posture)) {
    throw new Error('posture must be one of: WORK, ASSISTANT, INSPECTION');
  }

  // V3: Validate snapshot if provided
  if (snapshot) {
    if (!snapshot.scope || !snapshot.scopeId || !snapshot.timestamp || !snapshot.hash) {
      throw new Error('snapshot must include: scope, scopeId, timestamp, hash');
    }
  }

  const proposal = {
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
  };

  // V3: Add optional fields if provided
  if (version) proposal.version = version;
  if (posture) proposal.posture = posture;
  if (snapshot) proposal.snapshot = Object.freeze(snapshot);
  if (userMessageDraft) proposal.userMessageDraft = userMessageDraft;
  if (confirmation) proposal.confirmation = Object.freeze(confirmation);
  if (confirmation?.preview) validateJsonLike(confirmation.preview, "confirmation.preview");
  if (sessionId) proposal.sessionId = sessionId;

  return Object.freeze(proposal);
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
