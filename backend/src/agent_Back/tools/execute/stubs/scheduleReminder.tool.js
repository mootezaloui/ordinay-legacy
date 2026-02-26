'use strict';

/**
 * EXECUTE TOOL: scheduleReminder (STUB)
 *
 * CRITICAL: This is a STUB only.
 * - NO implementation logic
 * - BLOCKED in v1 and v2
 * - Only available in v3 with explicit confirmation
 *
 * This tool MUST NOT be executed in v1 or v2.
 */

const { TOOL_CATEGORIES } = require('../../tool.registry');

const inputSchema = {
  type: 'object',
  properties: {
    entityType: {
      type: 'string',
      enum: ['dossier', 'lawsuit', 'session', 'task'],
      description: 'Type of entity to set reminder for',
    },
    entityId: {
      type: 'integer',
      minimum: 1,
      description: 'ID of the entity',
    },
    reminderDate: {
      type: 'string',
      format: 'date-time',
      description: 'Date and time for reminder in ISO 8601 format',
    },
    message: {
      type: 'string',
      minLength: 1,
      maxLength: 500,
      description: 'Reminder message',
    },
  },
  required: ['entityType', 'entityId', 'reminderDate', 'message'],
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
    'EXECUTE tool scheduleReminder is not implemented. This is a stub for v3 planning only.'
  );
}

module.exports = {
  name: 'scheduleReminder',
  category: TOOL_CATEGORIES.EXECUTE,
  description: 'Schedule a reminder for an entity (STUB - NOT IMPLEMENTED)',
  inputSchema,
  outputSchema,
  reversibility: true, // Reminders can be cancelled
  sideEffects: true, // Creates notification/reminder
  allowedAgentVersions: ['v3'], // ONLY v3
  confirmationRequired: true, // Requires explicit confirmation
  handler,
};
