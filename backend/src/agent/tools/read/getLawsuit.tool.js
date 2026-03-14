'use strict';

/**
 * READ TOOL: getLawsuit
 *
 * Retrieve a single lawsuit by ID with related dossier and client information.
 * Read-only, no side effects, safe for all agent versions.
 */

const lawsuitsService = require('../../../services/lawsuits.service');
const TOOL_CATEGORIES = { READ: 'READ' };

const inputSchema = {
  type: 'object',
  properties: {
    lawsuitId: {
      type: 'integer',
      minimum: 1,
      description: 'The unique ID of the lawsuit',
    },
  },
  required: ['lawsuitId'],
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    lawsuit: {
      type: ['object', 'null'],
      description: 'Lawsuit record with dossier and client info or null if not found',
    },
  },
  required: ['lawsuit'],
  additionalProperties: false,
};

async function handler({ lawsuitId }) {
  const lawsuit = lawsuitsService.get(lawsuitId);
  return { lawsuit: lawsuit || null };
}

module.exports = {
  name: 'getLawsuit',
  category: TOOL_CATEGORIES.READ,
  description: 'Retrieve a single lawsuit by ID with dossier and client information',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};


