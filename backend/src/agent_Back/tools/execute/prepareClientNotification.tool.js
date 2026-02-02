'use strict';

/**
 * EXECUTE TOOL: prepareClientNotification (STUB)
 *
 * CRITICAL: This is a STUB only.
 * - NO implementation logic
 * - BLOCKED in v1 and v2
 * - Only available in v3 with explicit confirmation
 *
 * This tool MUST NOT be executed in v1 or v2.
 */

const { TOOL_CATEGORIES } = require('../tool.registry');

const inputSchema = {
  type: 'object',
  properties: {
    clientId: {
      type: 'integer',
      minimum: 1,
      description: 'Client ID to send notification to',
    },
    notificationType: {
      type: 'string',
      enum: ['email', 'sms', 'both'],
      description: 'Type of notification to send',
    },
    subject: {
      type: 'string',
      minLength: 1,
      maxLength: 200,
      description: 'Notification subject',
    },
    message: {
      type: 'string',
      minLength: 1,
      description: 'Notification message',
    },
    urgent: {
      type: 'boolean',
      default: false,
      description: 'Mark as urgent notification',
    },
  },
  required: ['clientId', 'notificationType', 'subject', 'message'],
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    error: {
      type: 'string',
      description: 'Error message (stub not implemented)',
    },
  },
  required: ['error'],
  additionalProperties: false,
};

/**
 * STUB HANDLER
 * This function should NEVER be called in v1 or v2.
 * The firewall will block execution.
 */
async function handler() {
  throw new Error(
    'EXECUTE tool prepareClientNotification is not implemented. This is a stub for v3 planning only.'
  );
}

module.exports = {
  name: 'prepareClientNotification',
  category: TOOL_CATEGORIES.EXECUTE,
  description: 'Prepare and queue a client notification (STUB - NOT IMPLEMENTED)',
  inputSchema,
  outputSchema,
  reversibility: false, // Notifications cannot be unsent once sent
  sideEffects: true, // Sends communication
  allowedAgentVersions: ['v3'], // ONLY v3
  confirmationRequired: true, // Requires explicit confirmation
  handler,
};
