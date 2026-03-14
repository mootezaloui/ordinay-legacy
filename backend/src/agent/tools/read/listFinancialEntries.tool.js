'use strict';

/**
 * READ TOOL: listFinancialEntries
 *
 * List accounting/financial entries with optional filters.
 * Read-only, no side effects, safe for all agent versions.
 */

const financialService = require('../../../services/financial.service');
const TOOL_CATEGORIES = { READ: 'READ' };

const inputSchema = {
  type: 'object',
  properties: {
    query: {
      type: ['string', 'null'],
      description: 'Optional text search on entry title or reference',
    },
    status: {
      type: ['string', 'null'],
      description: 'Filter by entry status',
    },
    direction: {
      type: ['string', 'null'],
      description: 'Filter by entry direction (receivable/payable)',
    },
    scope: {
      type: ['string', 'null'],
      description: 'Filter by entry scope',
    },
    paymentStatus: {
      type: ['string', 'null'],
      enum: ['paid', 'unpaid', 'overdue', null],
      description: 'Filter by payment status',
    },
    clientId: {
      type: ['integer', 'null'],
      minimum: 1,
      description: 'Filter by client ID',
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
    missionId: {
      type: ['integer', 'null'],
      minimum: 1,
      description: 'Filter by mission ID',
    },
    taskId: {
      type: ['integer', 'null'],
      minimum: 1,
      description: 'Filter by task ID',
    },
    personalTaskId: {
      type: ['integer', 'null'],
      minimum: 1,
      description: 'Filter by personal task ID',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 200,
      default: 50,
      description: 'Maximum number of entries to return',
    },
  },
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    financialEntries: {
      type: 'array',
      items: { type: 'object' },
      description: 'Array of financial entry records',
    },
    count: {
      type: 'integer',
      description: 'Number of entries returned',
    },
  },
  required: ['financialEntries', 'count'],
  additionalProperties: false,
};

async function handler({
  query = null,
  status = null,
  direction = null,
  scope = null,
  paymentStatus = null,
  clientId = null,
  dossierId = null,
  lawsuitId = null,
  missionId = null,
  taskId = null,
  personalTaskId = null,
  limit = 50,
} = {}) {
  const limited = financialService.listFiltered({
    query,
    status,
    direction,
    scope,
    paymentStatus,
    clientId,
    dossierId,
    lawsuitId,
    missionId,
    taskId,
    personalTaskId,
    limit,
  });

  return {
    financialEntries: limited,
    count: limited.length,
  };
}

module.exports = {
  name: 'listFinancialEntries',
  category: TOOL_CATEGORIES.READ,
  description:
    'List financial entry records with optional scope, relation, direction, payment, and text filters.',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
