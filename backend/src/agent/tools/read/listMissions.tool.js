'use strict';

/**
 * READ TOOL: listMissions
 *
 * List missions with optional filters.
 * Read-only, no side effects, safe for all agent versions.
 */

const missionsService = require('../../../services/missions.service');
const TOOL_CATEGORIES = { READ: 'READ' };

const inputSchema = {
  type: 'object',
  properties: {
    query: {
      type: ['string', 'null'],
      description: 'Optional text search on mission reference or title',
    },
    status: {
      type: ['string', 'null'],
      description: 'Filter by mission status',
    },
    priority: {
      type: ['string', 'null'],
      description: 'Filter by mission priority',
    },
    dossierId: {
      type: ['integer', 'null'],
      minimum: 1,
      description: 'Filter by dossier ID',
    },
    lawsuitId: {
      type: ['integer', 'null'],
      minimum: 1,
      description: 'Filter by lawsuit ID',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 200,
      default: 50,
      description: 'Maximum number of missions to return',
    },
  },
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    missions: {
      type: 'array',
      items: { type: 'object' },
      description: 'Array of mission records',
    },
    count: {
      type: 'integer',
      description: 'Number of missions returned',
    },
  },
  required: ['missions', 'count'],
  additionalProperties: false,
};

async function handler({
  query = null,
  status = null,
  priority = null,
  dossierId = null,
  lawsuitId = null,
  limit = 50,
} = {}) {
  const limited = missionsService.listFiltered({
    query,
    status,
    priority,
    dossierId,
    lawsuitId,
    limit,
  });

  return {
    missions: limited,
    count: limited.length,
  };
}

module.exports = {
  name: 'listMissions',
  category: TOOL_CATEGORIES.READ,
  description:
    'List mission records with optional filters by dossier/lawsuit scope, status, priority, and reference/title search.',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
