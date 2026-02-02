'use strict';

/**
 * READ TOOL: listLawsuits
 *
 * List lawsuits with optional filters.
 * Read-only, no side effects, safe for all agent versions.
 */

const lawsuitsService = require('../../../services/lawsuits.service');
const { TOOL_CATEGORIES } = require('../tool.registry');

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
  let lawsuits = lawsuitsService.list();

  if (dossierId !== null) {
    lawsuits = lawsuits.filter(lawsuit => lawsuit.dossier_id === dossierId);
  }

  if (status) {
    const normalized = String(status).toLowerCase();
    lawsuits = lawsuits.filter(lawsuit => String(lawsuit.status || '').toLowerCase() === normalized);
  }

  if (query) {
    const q = String(query).toLowerCase();
    lawsuits = lawsuits.filter(lawsuit => {
      const haystack = [lawsuit.reference, lawsuit.lawsuit_number, lawsuit.title]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }

  lawsuits = lawsuits.sort((a, b) => {
    const aUpdated = new Date(a.updated_at || a.created_at || 0).getTime();
    const bUpdated = new Date(b.updated_at || b.created_at || 0).getTime();
    return bUpdated - aUpdated;
  });

  const limited = lawsuits.slice(0, limit);

  return {
    lawsuits: limited,
    count: limited.length,
  };
}

module.exports = {
  name: 'listLawsuits',
  category: TOOL_CATEGORIES.READ,
  description: 'List lawsuits with optional filters',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
