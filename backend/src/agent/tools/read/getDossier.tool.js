'use strict';

/**
 * READ TOOL: getDossier
 *
 * Retrieve a single dossier by ID with related client information.
 * Read-only, no side effects, safe for all agent versions.
 */

const db = require('../../../db/connection');
const { TOOL_CATEGORIES } = require('../tool.registry');

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
  const dossier = db
    .prepare(
      `
      SELECT
        d.id, d.reference, d.client_id, d.title, d.description,
        d.category, d.phase, d.adversary_party, d.adversary_lawyer,
        d.estimated_value, d.court_reference, d.assigned_lawyer,
        d.status, d.priority, d.opened_at, d.next_deadline,
        d.closed_at, d.created_at, d.updated_at,
        c.name as client_name, c.email as client_email, c.phone as client_phone
      FROM dossiers d
      LEFT JOIN clients c ON c.id = d.client_id
      WHERE d.id = ? AND d.deleted_at IS NULL
      `
    )
    .get(dossierId);

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
