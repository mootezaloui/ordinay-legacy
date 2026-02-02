'use strict';

/**
 * READ TOOL: listClients
 *
 * List clients with optional filters.
 * Read-only, no side effects, safe for all agent versions.
 */

const clientsService = require('../../../services/clients.service');
const { TOOL_CATEGORIES } = require('../tool.registry');

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
  let clients = clientsService.list();

  if (status) {
    const normalized = String(status).toLowerCase();
    clients = clients.filter(client => String(client.status || '').toLowerCase() === normalized);
  }

  if (query) {
    const q = String(query).toLowerCase();
    clients = clients.filter(client => {
      const haystack = [
        client.name,
        client.email,
        client.phone,
        client.alternate_phone,
        client.company,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }

  clients = clients.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  const limited = clients.slice(0, limit);

  return {
    clients: limited,
    count: limited.length,
  };
}

module.exports = {
  name: 'listClients',
  category: TOOL_CATEGORIES.READ,
  description: 'List clients with optional filters',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
