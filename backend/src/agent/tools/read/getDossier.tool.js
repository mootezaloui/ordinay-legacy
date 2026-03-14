'use strict';

/**
 * READ TOOL: getDossier
 *
 * Retrieve a single dossier by ID with related client information.
 * Read-only, no side effects, safe for all agent versions.
 */

const dossiersService = require('../../../services/dossiers.service');
const TOOL_CATEGORIES = { READ: 'READ' };

const inputSchema = {
  type: 'object',
  properties: {
    dossierId: {
      type: 'integer',
      minimum: 1,
      description: 'The unique ID of the dossier',
    },
  },
  required: ['dossierId'],
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    dossier: {
      type: ['object', 'null'],
      description: 'Dossier record with client info or null if not found',
    },
  },
  required: ['dossier'],
  additionalProperties: false,
};

async function handler({ dossierId }) {
  const dossier = dossiersService.get(dossierId);
  return { dossier: dossier || null };
}

module.exports = {
  name: 'getDossier',
  category: TOOL_CATEGORIES.READ,
  description: 'Retrieve a single dossier by ID with client information',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
