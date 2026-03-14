'use strict';

/**
 * READ TOOL: getClient
 *
 * Retrieve a single client by ID.
 * Read-only, no side effects, safe for all agent versions.
 */

const clientsService = require('../../../services/clients.service');
const TOOL_CATEGORIES = { READ: 'READ' };

const inputSchema = {
  type: 'object',
  properties: {
    clientId: {
      type: 'integer',
      minimum: 1,
      description: 'The unique ID of the client',
    },
  },
  required: ['clientId'],
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    client: {
      type: ['object', 'null'],
      description: 'Client record or null if not found',
    },
  },
  required: ['client'],
  additionalProperties: false,
};

async function handler({ clientId }) {
  const client = clientsService.get(clientId);
  return { client: client || null };
}

module.exports = {
  name: 'getClient',
  category: TOOL_CATEGORIES.READ,
  description: 'Retrieve a single client by ID',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
