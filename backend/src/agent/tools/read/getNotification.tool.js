'use strict';

/**
 * READ TOOL: getNotification
 *
 * Retrieve a single notification by ID.
 * Read-only, no side effects, safe for all agent versions.
 */

const notificationsService = require('../../../services/notifications.service');
const TOOL_CATEGORIES = { READ: 'READ' };

const inputSchema = {
  type: 'object',
  properties: {
    notificationId: {
      type: 'integer',
      minimum: 1,
      description: 'The unique ID of the notification',
    },
  },
  required: ['notificationId'],
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    notification: {
      type: ['object', 'null'],
      description: 'Notification record or null if not found',
    },
  },
  required: ['notification'],
  additionalProperties: false,
};

async function handler({ notificationId }) {
  const notification = notificationsService.get(notificationId);
  return { notification: notification || null };
}

module.exports = {
  name: 'getNotification',
  category: TOOL_CATEGORIES.READ,
  description: 'Retrieve a single notification by ID',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
