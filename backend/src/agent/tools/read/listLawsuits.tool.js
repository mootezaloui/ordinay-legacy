'use strict';

/**
 * READ TOOL: listLawsuits
 *
 * List lawsuits with optional filters.
 * Read-only, no side effects, safe for all agent versions.
 */

const lawsuitsService = require('../../../services/lawsuits.service');
const TOOL_CATEGORIES = { READ: 'READ' };

const inputSchema = {
  type: 'object',
  properties: {
    query: {
      type: ['string', 'null'],
      description: 'Optional text search on lawsuit reference or title',
    },
    status: {
      type: ['string', 'null'],
      description: 'Filter by lawsuit status',
    },
    dossierId: {
      type: ['integer', 'null'],
      minimum: 1,
      description: 'Filter by dossier ID',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 200,
      default: 50,
      description: 'Maximum number of lawsuits to return',
    },
  },
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    lawsuits: {
      type: 'array',
      items: { type: 'object' },
      description: 'Array of lawsuit records',
    },
    count: {
      type: 'integer',
      description: 'Number of lawsuits returned',
    },
  },
  required: ['lawsuits', 'count'],
  additionalProperties: false,
};

async function handler({ query = null, status = null, dossierId = null, limit = 50 } = {}) {
  const limited = lawsuitsService.listFiltered({ query, status, dossierId, limit });

  return {
    lawsuits: limited,
    count: limited.length,
  };
}

module.exports = {
  name: 'listLawsuits',
  category: TOOL_CATEGORIES.READ,
  description:
    'List lawsuit records with optional filters by dossier, status, and reference/title search. Use to retrieve case proceedings before reading details.',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
