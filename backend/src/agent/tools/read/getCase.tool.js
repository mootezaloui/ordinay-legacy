'use strict';

/**
 * READ TOOL: getCase
 *
 * Retrieve a single case by ID with related dossier and client information.
 * Read-only, no side effects, safe for all agent versions.
 */

const db = require('../../../db/connection');
const { TOOL_CATEGORIES } = require('../tool.registry');

const inputSchema = {
  type: 'object',
  properties: {
    caseId: {
      type: 'integer',
      minimum: 1,
      description: 'The unique ID of the case',
    },
  },
  required: ['caseId'],
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    case: {
      type: ['object', 'null'],
      description: 'Case record with dossier and client info or null if not found',
    },
  },
  required: ['case'],
  additionalProperties: false,
};

async function handler({ caseId }) {
  const caseRecord = db
    .prepare(
      `
      SELECT
        c.id, c.reference, c.case_number, c.dossier_id, c.title,
        c.description, c.adversary, c.adversary_party, c.adversary_lawyer,
        c.court, c.filing_date, c.next_hearing, c.reference_number,
        c.status, c.priority, c.opened_at, c.closed_at,
        c.created_at, c.updated_at,
        d.reference as dossier_reference, d.title as dossier_title,
        cl.name as client_name, cl.email as client_email
      FROM cases c
      LEFT JOIN dossiers d ON d.id = c.dossier_id
      LEFT JOIN clients cl ON cl.id = d.client_id
      WHERE c.id = ? AND c.deleted_at IS NULL
      `
    )
    .get(caseId);

  return { case: caseRecord || null };
}

module.exports = {
  name: 'getCase',
  category: TOOL_CATEGORIES.READ,
  description: 'Retrieve a single case by ID with dossier and client information',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
