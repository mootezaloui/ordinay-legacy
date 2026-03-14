'use strict';

/**
 * READ TOOL: listOfficers
 *
 * List officers (bailiffs/huissiers) with optional filters.
 * Read-only, no side effects, safe for all agent versions.
 */

const officersService = require('../../../services/officers.service');
const TOOL_CATEGORIES = { READ: 'READ' };

const inputSchema = {
  type: 'object',
  properties: {
    query: {
      type: ['string', 'null'],
      description: 'Optional text search on officer name, email, phone, agency, or registration number',
    },
    status: {
      type: ['string', 'null'],
      description: 'Filter by officer status',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 200,
      default: 50,
      description: 'Maximum number of officers to return',
    },
  },
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    officers: {
      type: 'array',
      items: { type: 'object' },
      description: 'Array of officer records',
    },
    count: {
      type: 'integer',
      description: 'Number of officers returned',
    },
  },
  required: ['officers', 'count'],
  additionalProperties: false,
};

async function handler({ query = null, status = null, limit = 50 } = {}) {
  const limited = officersService.listFiltered({ query, status, limit });

  return {
    officers: limited,
    count: limited.length,
  };
}

module.exports = {
  name: 'listOfficers',
  category: TOOL_CATEGORIES.READ,
  description:
    'List officer records (bailiffs/huissiers) with optional status and text filters across identity/contact fields.',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
