'use strict';

/**
 * EXECUTE TOOL: createTask (STUB)
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
    dossierId: {
      type: ['integer', 'null'],
      minimum: 1,
      description: 'Dossier ID to attach task to',
    },
    lawsuitId: {
      type: ['integer', 'null'],
      minimum: 1,
      description: 'Lawsuit ID to attach task to',
    },
    title: {
      type: 'string',
      minLength: 1,
      maxLength: 255,
      description: 'Task title',
    },
    description: {
      type: ['string', 'null'],
      description: 'Task description',
    },
    priority: {
      type: 'string',
      enum: ['urgent', 'high', 'medium', 'low'],
      default: 'medium',
      description: 'Task priority',
    },
    dueDate: {
      type: ['string', 'null'],
      format: 'date-time',
      description: 'Due date in ISO 8601 format',
    },
  },
  required: ['title'],
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
    'EXECUTE tool createTask is not implemented. This is a stub for v3 planning only.'
  );
}

module.exports = {
  name: 'createTask',
  category: TOOL_CATEGORIES.EXECUTE,
  description: 'Create a new task (STUB - NOT IMPLEMENTED)',
  inputSchema,
  outputSchema,
  reversibility: true, // Tasks can be deleted
  sideEffects: true, // Creates database record
  allowedAgentVersions: ['v3'], // ONLY v3
  confirmationRequired: true, // Requires explicit confirmation
  handler,
};

