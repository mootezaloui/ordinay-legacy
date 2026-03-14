'use strict';

/**
 * READ TOOL: getFinancialEntry
 *
 * Retrieve a single financial entry by ID.
 * Read-only, no side effects, safe for all agent versions.
 */

const financialService = require('../../../services/financial.service');
const TOOL_CATEGORIES = { READ: 'READ' };

const inputSchema = {
  type: 'object',
  properties: {
    financialEntryId: {
      type: 'integer',
      minimum: 1,
      description: 'The unique ID of the financial entry',
    },
  },
  required: ['financialEntryId'],
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    financialEntry: {
      type: ['object', 'null'],
      description: 'Financial entry record or null if not found',
    },
  },
  required: ['financialEntry'],
  additionalProperties: false,
};

async function handler({ financialEntryId }) {
  const financialEntry = financialService.get(financialEntryId);
  return { financialEntry: financialEntry || null };
}

module.exports = {
  name: 'getFinancialEntry',
  category: TOOL_CATEGORIES.READ,
  description: 'Retrieve a single financial entry by ID',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
