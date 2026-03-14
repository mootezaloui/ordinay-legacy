'use strict';

/**
 * READ TOOL: listPersonalTasks
 *
 * List personal tasks with optional filters.
 * Read-only, no side effects, safe for all agent versions.
 */

const personalTasksService = require('../../../services/personalTasks.service');
const TOOL_CATEGORIES = { READ: 'READ' };

const inputSchema = {
  type: 'object',
  properties: {
    query: {
      type: ['string', 'null'],
      description: 'Optional text search on personal task title',
    },
    status: {
      type: ['string', 'null'],
      description: 'Filter by personal task status',
    },
    priority: {
      type: ['string', 'null'],
      description: 'Filter by personal task priority',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 200,
      default: 50,
      description: 'Maximum number of personal tasks to return',
    },
  },
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    personalTasks: {
      type: 'array',
      items: { type: 'object' },
      description: 'Array of personal task records',
    },
    count: {
      type: 'integer',
      description: 'Number of personal tasks returned',
    },
  },
  required: ['personalTasks', 'count'],
  additionalProperties: false,
};

async function handler({ query = null, status = null, priority = null, limit = 50 } = {}) {
  const limited = personalTasksService.listFiltered({
    query,
    status,
    priority,
    limit,
  });

  return {
    personalTasks: limited,
    count: limited.length,
  };
}

module.exports = {
  name: 'listPersonalTasks',
  category: TOOL_CATEGORIES.READ,
  description:
    'List personal task records with optional status, priority, and title query filters.',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
