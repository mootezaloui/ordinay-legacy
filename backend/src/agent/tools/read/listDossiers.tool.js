'use strict';

/**
 * READ TOOL: listDossiers
 *
 * List dossiers with optional filters.
 * Read-only, no side effects, safe for all agent versions.
 */

const dossiersService = require('../../../services/dossiers.service');
const TOOL_CATEGORIES = { READ: 'READ' };

const inputSchema = {
  type: 'object',
  properties: {
    query: {
      type: ['string', 'null'],
      description: 'Optional text search on dossier reference or title',
    },
    status: {
      type: ['string', 'null'],
      description: 'Filter by dossier status',
    },
    clientId: {
      type: ['integer', 'null'],
      minimum: 1,
      description: 'Filter by client ID',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 200,
      default: 50,
      description: 'Maximum number of dossiers to return',
    },
  },
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

async function handler({ query = null, status = null, clientId = null, limit = 50 } = {}) {
  const limited = dossiersService.listFiltered({ query, status, clientId, limit });

  return {
    dossiers: limited,
    count: limited.length,
  };
}

module.exports = {
  name: 'listDossiers',
  category: TOOL_CATEGORIES.READ,
  description:
    "List dossier records with optional filters by client, status, or reference/title search. Use to find case files before drilling into related entities.",
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
