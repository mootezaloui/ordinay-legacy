'use strict';

/**
 * READ TOOL: listClients
 *
 * List clients with optional filters.
 * Read-only, no side effects, safe for all agent versions.
 */

const clientsService = require('../../../services/clients.service');
const TOOL_CATEGORIES = { READ: 'READ' };

const inputSchema = {
  type: 'object',
  properties: {
    query: {
      type: ['string', 'null'],
      description: 'Optional text search on client name, email, or phone',
    },
    status: {
      type: ['string', 'null'],
      description: 'Filter by client status',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 200,
      default: 50,
      description: 'Maximum number of clients to return',
    },
  },
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    clients: {
      type: 'array',
      items: { type: 'object' },
      description: 'Array of client records',
    },
    count: {
      type: 'integer',
      description: 'Number of clients returned',
    },
  },
  required: ['clients', 'count'],
  additionalProperties: false,
};

async function handler({ query = null, status = null, limit = 50 } = {}) {
  const limited = clientsService.listFiltered({ query, status, limit });

  return {
    clients: limited,
    count: limited.length,
  };
}

module.exports = {
  name: 'listClients',
  category: TOOL_CATEGORIES.READ,
  description:
    "List client records with optional text and status filters. Use when finding clients by name/contact details or narrowing active/inactive client sets.",
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
