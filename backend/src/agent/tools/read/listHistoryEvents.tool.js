'use strict';

/**
 * READ TOOL: listHistoryEvents
 *
 * List history/audit events with optional filters.
 * Read-only, no side effects, safe for all agent versions.
 */

const historyService = require('../../../services/history.service');
const TOOL_CATEGORIES = { READ: 'READ' };

const inputSchema = {
  type: 'object',
  properties: {
    entityType: {
      type: ['string', 'null'],
      description: 'Filter by entity type',
    },
    entityId: {
      type: ['integer', 'null'],
      minimum: 1,
      description: 'Filter by entity ID',
    },
    query: {
      type: ['string', 'null'],
      description: 'Optional text search on action or description',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 200,
      default: 50,
      description: 'Maximum number of history events to return',
    },
  },
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    historyEvents: {
      type: 'array',
      items: { type: 'object' },
      description: 'Array of history/audit events',
    },
    count: {
      type: 'integer',
      description: 'Number of events returned',
    },
  },
  required: ['historyEvents', 'count'],
  additionalProperties: false,
};

async function handler({ entityType = null, entityId = null, query = null, limit = 50 } = {}) {
  const limited = historyService.listFiltered({
    entityType,
    entityId,
    query,
    limit,
  });

  return {
    historyEvents: limited,
    count: limited.length,
  };
}

module.exports = {
  name: 'listHistoryEvents',
  category: TOOL_CATEGORIES.READ,
  description:
    'List history/audit events with optional entity scope and action/description query filters.',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
