'use strict';

/**
 * READ TOOL: searchClientsByName
 *
 * Search clients by name (case-insensitive substring match).
 * Read-only, no side effects, safe for all agent versions.
 */

const clientsService = require('../../../services/clients.service');
const { TOOL_CATEGORIES } = require('../tool.registry');

const inputSchema = {
  type: 'object',
  properties: {
    nameHint: {
      type: 'string',
      minLength: 1,
      description: 'Name or partial name to search for',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 50,
      default: 10,
      description: 'Maximum number of clients to return',
    },
  },
  required: ['nameHint'],
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    clients: {
      type: 'array',
      items: { type: 'object' },
      description: 'Matching client records',
    },
  },
  required: ['clients'],
  additionalProperties: false,
};

async function handler({ nameHint, limit = 10 }) {
  const q = String(nameHint).toLowerCase();
  const clients = clientsService
    .list()
    .filter(client => String(client.name || '').toLowerCase().includes(q))
    .slice(0, limit);

  return { clients };
}

module.exports = {
  name: 'searchClientsByName',
  category: TOOL_CATEGORIES.READ,
  description: 'Search clients by name',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
