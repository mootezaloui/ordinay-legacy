'use strict';

/**
 * READ TOOL: getDossierByReference
 *
 * Retrieve a dossier by reference.
 * Read-only, no side effects, safe for all agent versions.
 */

const dossiersService = require('../../../services/dossiers.service');
const TOOL_CATEGORIES = { READ: 'READ' };

const inputSchema = {
  type: 'object',
  properties: {
    reference: {
      type: 'string',
      minLength: 1,
      description: 'Dossier reference (e.g., DOS-2024-123456)',
    },
  },
  required: ['reference'],
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    dossier: {
      type: ['object', 'null'],
      description: 'Dossier record or null if not found',
    },
  },
  required: ['dossier'],
  additionalProperties: false,
};

async function handler({ reference }) {
  const dossier = dossiersService.getByReference(reference);
  return { dossier: dossier || null };
}

module.exports = {
  name: 'getDossierByReference',
  category: TOOL_CATEGORIES.READ,
  description:
    'Retrieve a single dossier by its official dossier reference. Use when the user gives a reference string and expects a direct match.',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
