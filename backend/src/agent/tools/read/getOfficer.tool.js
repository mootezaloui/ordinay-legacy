'use strict';

/**
 * READ TOOL: getOfficer
 *
 * Retrieve a single officer (bailiff/huissier) by ID.
 * Read-only, no side effects, safe for all agent versions.
 */

const officersService = require('../../../services/officers.service');
const TOOL_CATEGORIES = { READ: 'READ' };

const inputSchema = {
  type: 'object',
  properties: {
    officerId: {
      type: 'integer',
      minimum: 1,
      description: 'The unique ID of the officer',
    },
  },
  required: ['officerId'],
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    officer: {
      type: ['object', 'null'],
      description: 'Officer record or null if not found',
    },
  },
  required: ['officer'],
  additionalProperties: false,
};

async function handler({ officerId }) {
  const officer = officersService.get(officerId);
  return { officer: officer || null };
}

module.exports = {
  name: 'getOfficer',
  category: TOOL_CATEGORIES.READ,
  description: 'Retrieve a single officer (bailiff/huissier) by ID',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
