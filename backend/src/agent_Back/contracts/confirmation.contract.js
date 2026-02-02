'use strict';

/**
 * Confirmation & Blocking Flow Contract
 *
 * CRITICAL: This contract defines how confirmations and blocking work.
 *
 * Confirmation is NEVER implicit.
 * Confirmation cannot be expressed via chat text.
 * Confirmation requires structured payload.
 *
 * Even though execution is disabled in v1/v2, this contract establishes
 * the structure for v3 and prevents UI shortcuts.
 */

/**
 * Confirmation Status (ENUM)
 *
 * Explicit status of a confirmation request.
 */
const CONFIRMATION_STATUS = Object.freeze({
  /**
   * PENDING
   * Confirmation is awaiting user decision
   */
  PENDING: 'PENDING',

  /**
   * CONFIRMED
   * User explicitly confirmed the action
   */
  CONFIRMED: 'CONFIRMED',

  /**
   * REJECTED
   * User explicitly rejected the action
   */
  REJECTED: 'REJECTED',

  /**
   * EXPIRED
   * Confirmation request expired (timeout)
   */
  EXPIRED: 'EXPIRED',
});

/**
 * Validate confirmation status
 * @param {string} status - Confirmation status
 * @throws {Error} If status is invalid
 */
function validateConfirmationStatus(status) {
  const validStatuses = Object.values(CONFIRMATION_STATUS);
  if (!validStatuses.includes(status)) {
    throw new Error(
      `Invalid confirmation status: "${status}". Must be one of: ${validStatuses.join(', ')}`
    );
  }
}

/**
 * Generate a unique confirmation ID
 * @param {string} proposalId - Action proposal ID
 * @returns {string} Unique confirmation ID
 */
function generateConfirmationId(proposalId) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `confirm-${proposalId}-${timestamp}-${random}`;
}

/**
 * Create a confirmation request
 *
 * This is what the Agent sends to the UI when an action requires confirmation.
 *
 * @param {Object} request - Confirmation request data
 * @param {string} request.proposalId - Action proposal ID (required)
 * @param {string} request.actionType - Action type (required)
 * @param {string} request.humanReadableSummary - Human-readable summary (required)
 * @param {Array} request.affectedEntities - Entities that will be affected (required)
 * @param {boolean} request.reversible - Whether action can be reversed (required)
 * @param {number} [request.timeoutSeconds] - Timeout in seconds (default: 300 = 5 minutes)
 * @param {string} [request.confirmationId] - Optional confirmation ID (generated if not provided)
 * @returns {Object} Validated confirmation request
 * @throws {Error} If validation fails
 */
function createConfirmationRequest({
  proposalId,
  actionType,
  humanReadableSummary,
  affectedEntities,
  reversible,
  timeoutSeconds = 300,
  confirmationId,
}) {
  // Validate proposalId
  if (!proposalId || typeof proposalId !== 'string') {
    throw new Error('proposalId is required and must be a string');
  }

  // Validate actionType
  if (!actionType || typeof actionType !== 'string') {
    throw new Error('actionType is required and must be a string');
  }

  // Validate humanReadableSummary
  if (!humanReadableSummary || typeof humanReadableSummary !== 'string' || humanReadableSummary.trim().length === 0) {
    throw new Error('humanReadableSummary is required and must be a non-empty string');
  }

  // Validate affectedEntities
  if (!Array.isArray(affectedEntities) || affectedEntities.length === 0) {
    throw new Error('affectedEntities is required and must be a non-empty array');
  }

  affectedEntities.forEach((entity, index) => {
    if (!entity || typeof entity !== 'object') {
      throw new Error(`affectedEntities[${index}] must be an object`);
    }
    if (!entity.type || typeof entity.type !== 'string') {
      throw new Error(`affectedEntities[${index}].type is required and must be a string`);
    }
    if (!entity.id) {
      throw new Error(`affectedEntities[${index}].id is required`);
    }
  });

  // Validate reversible
  if (typeof reversible !== 'boolean') {
    throw new Error('reversible must be a boolean');
  }

  // Validate timeoutSeconds
  if (typeof timeoutSeconds !== 'number' || timeoutSeconds <= 0) {
    throw new Error('timeoutSeconds must be a positive number');
  }

  // Generate confirmation ID if not provided
  const finalConfirmationId = confirmationId || generateConfirmationId(proposalId);

  const expiresAt = new Date(Date.now() + timeoutSeconds * 1000).toISOString();

  return Object.freeze({
    confirmationId: finalConfirmationId,
    proposalId,
    actionType,
    humanReadableSummary,
    affectedEntities: Object.freeze([...affectedEntities.map(e => Object.freeze(e))]),
    reversible,
    status: CONFIRMATION_STATUS.PENDING,
    requestedAt: new Date().toISOString(),
    expiresAt,
  });
}

/**
 * Create a confirmation response
 *
 * This is what the UI sends back to the Agent when user confirms/rejects.
 *
 * @param {Object} response - Confirmation response data
 * @param {string} response.confirmationId - Confirmation ID (required)
 * @param {string} response.proposalId - Action proposal ID (required)
 * @param {string} response.status - Confirmation status (CONFIRMED | REJECTED)
 * @param {number} response.userId - User ID who made the decision (required)
 * @param {string} [response.rejectionReason] - Reason for rejection (required if REJECTED)
 * @returns {Object} Validated confirmation response
 * @throws {Error} If validation fails
 */
function createConfirmationResponse({
  confirmationId,
  proposalId,
  status,
  userId,
  rejectionReason,
}) {
  // Validate confirmationId
  if (!confirmationId || typeof confirmationId !== 'string') {
    throw new Error('confirmationId is required and must be a string');
  }

  // Validate proposalId
  if (!proposalId || typeof proposalId !== 'string') {
    throw new Error('proposalId is required and must be a string');
  }

  // Validate status
  if (status !== CONFIRMATION_STATUS.CONFIRMED && status !== CONFIRMATION_STATUS.REJECTED) {
    throw new Error('status must be CONFIRMED or REJECTED');
  }

  // Validate userId
  if (!userId || typeof userId !== 'number' || userId <= 0) {
    throw new Error('userId is required and must be a positive number');
  }

  // Validate rejectionReason (required if REJECTED)
  if (status === CONFIRMATION_STATUS.REJECTED) {
    if (!rejectionReason || typeof rejectionReason !== 'string' || rejectionReason.trim().length === 0) {
      throw new Error('rejectionReason is required and must be a non-empty string when status is REJECTED');
    }
  }

  // NO FORBIDDEN FIELDS ALLOWED
  // UI cannot send these fields
  const forbiddenFields = [
    'autoConfirm',        // UI cannot auto-confirm
    'skipValidation',     // UI cannot skip validation
    'executeNow',         // UI cannot execute immediately
    'bypassTimeout',      // UI cannot bypass timeout
  ];

  forbiddenFields.forEach(field => {
    if (field in arguments[0]) {
      throw new Error(
        `ConfirmationResponse must not contain "${field}". Confirmation cannot be implicit or bypassed.`
      );
    }
  });

  return Object.freeze({
    confirmationId,
    proposalId,
    status,
    userId,
    rejectionReason: status === CONFIRMATION_STATUS.REJECTED ? rejectionReason : null,
    respondedAt: new Date().toISOString(),
  });
}

/**
 * Create a blocking notification
 *
 * This is what the Agent sends to the UI when an action is blocked.
 *
 * @param {Object} notification - Blocking notification data
 * @param {string} notification.proposalId - Action proposal ID (required)
 * @param {string} notification.actionType - Action type (required)
 * @param {string} notification.blockingReason - Reason for blocking (required)
 * @param {string} notification.blockingPolicy - Policy that blocked the action (required)
 * @param {Object} [notification.suggestedAlternative] - Suggested alternative action (optional)
 * @returns {Object} Validated blocking notification
 * @throws {Error} If validation fails
 */
function createBlockingNotification({
  proposalId,
  actionType,
  blockingReason,
  blockingPolicy,
  suggestedAlternative,
}) {
  // Validate proposalId
  if (!proposalId || typeof proposalId !== 'string') {
    throw new Error('proposalId is required and must be a string');
  }

  // Validate actionType
  if (!actionType || typeof actionType !== 'string') {
    throw new Error('actionType is required and must be a string');
  }

  // Validate blockingReason
  if (!blockingReason || typeof blockingReason !== 'string' || blockingReason.trim().length === 0) {
    throw new Error('blockingReason is required and must be a non-empty string');
  }

  // Validate blockingPolicy
  if (!blockingPolicy || typeof blockingPolicy !== 'string') {
    throw new Error('blockingPolicy is required and must be a string (e.g., "v1", "v2", "v3")');
  }

  // Validate suggestedAlternative (if provided)
  if (suggestedAlternative !== undefined && suggestedAlternative !== null) {
    if (typeof suggestedAlternative !== 'object') {
      throw new Error('suggestedAlternative must be an object or null');
    }
    if (!suggestedAlternative.actionType || typeof suggestedAlternative.actionType !== 'string') {
      throw new Error('suggestedAlternative.actionType is required and must be a string');
    }
  }

  return Object.freeze({
    proposalId,
    actionType,
    blockingReason,
    blockingPolicy,
    suggestedAlternative: suggestedAlternative ? Object.freeze(suggestedAlternative) : null,
    blockedAt: new Date().toISOString(),
  });
}

/**
 * Validate confirmation request
 * @param {Object} request - Confirmation request to validate
 * @returns {boolean} true if valid
 * @throws {Error} If validation fails
 */
function validateConfirmationRequest(request) {
  if (!request || typeof request !== 'object') {
    throw new Error('Confirmation request must be an object');
  }

  // Use createConfirmationRequest to validate (it will throw if invalid)
  createConfirmationRequest(request);

  return true;
}

/**
 * Validate confirmation response
 * @param {Object} response - Confirmation response to validate
 * @returns {boolean} true if valid
 * @throws {Error} If validation fails
 */
function validateConfirmationResponse(response) {
  if (!response || typeof response !== 'object') {
    throw new Error('Confirmation response must be an object');
  }

  // Use createConfirmationResponse to validate (it will throw if invalid)
  createConfirmationResponse(response);

  return true;
}

/**
 * Check if confirmation has expired
 * @param {Object} confirmationRequest - Confirmation request
 * @returns {boolean} true if expired
 */
function isConfirmationExpired(confirmationRequest) {
  if (!confirmationRequest || !confirmationRequest.expiresAt) {
    throw new Error('Invalid confirmation request');
  }

  const expiresAt = new Date(confirmationRequest.expiresAt);
  const now = new Date();

  return now > expiresAt;
}

module.exports = {
  CONFIRMATION_STATUS,
  validateConfirmationStatus,
  generateConfirmationId,
  createConfirmationRequest,
  createConfirmationResponse,
  createBlockingNotification,
  validateConfirmationRequest,
  validateConfirmationResponse,
  isConfirmationExpired,
};
