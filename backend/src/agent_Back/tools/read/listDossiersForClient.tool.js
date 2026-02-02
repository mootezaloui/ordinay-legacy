'use strict';

/**
 * READ TOOL: listDossiersForClient
 *
 * List dossiers for a specific client.
 * Read-only, no side effects, safe for all agent versions.
 */

const dossiersService = require('../../../services/dossiers.service');
const { TOOL_CATEGORIES } = require('../tool.registry');

const inputSchema = {
  type: 'object',
  properties: {
    clientId: {
      type: 'integer',
      minimum: 1,
      description: 'Client ID to list dossiers for',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 200,
      default: 20,
      description: 'Maximum number of dossiers to return',
    },
  },
  required: ['clientId'],
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    dossiers: {
      type: 'array',
      items: { type: 'object' },
      description: 'Array of dossier records',
    },
    count: {
      type: 'integer',
      description: 'Number of dossiers returned',
    },
  },
  required: ['dossiers', 'count'],
  additionalProperties: false,
};

async function handler({ clientId, limit = 20 }) {
  const dossiers = dossiersService
    .list()
    .filter(dossier => dossier.client_id === clientId)
    .sort((a, b) => {
      const aUpdated = new Date(a.updated_at || a.created_at || 0).getTime();
      const bUpdated = new Date(b.updated_at || b.created_at || 0).getTime();
      return bUpdated - aUpdated;
    })
    .slice(0, limit);

  return { dossiers, count: dossiers.length };
}

module.exports = {
  name: 'listDossiersForClient',
  category: TOOL_CATEGORIES.READ,
  description: 'List dossiers for a specific client',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
