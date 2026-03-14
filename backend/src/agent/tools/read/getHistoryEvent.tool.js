'use strict';

/**
 * READ TOOL: getHistoryEvent
 *
 * Retrieve a single history/audit event by ID.
 * Read-only, no side effects, safe for all agent versions.
 */

const historyService = require('../../../services/history.service');
const TOOL_CATEGORIES = { READ: 'READ' };

const inputSchema = {
  type: 'object',
  properties: {
    historyEventId: {
      type: 'integer',
      minimum: 1,
      description: 'The unique ID of the history event',
    },
  },
  required: ['historyEventId'],
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    historyEvent: {
      type: ['object', 'null'],
      description: 'History event record or null if not found',
    },
  },
  required: ['historyEvent'],
  additionalProperties: false,
};

async function handler({ historyEventId }) {
  const historyEvent = historyService.get(historyEventId);
  return { historyEvent: historyEvent || null };
}

module.exports = {
  name: 'getHistoryEvent',
  category: TOOL_CATEGORIES.READ,
  description: 'Retrieve a single history event by ID',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
