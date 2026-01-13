'use strict';

/**
 * READ TOOL: getSession
 *
 * Retrieve a single session by ID with related dossier/case information.
 * Read-only, no side effects, safe for all agent versions.
 */

const db = require('../../../db/connection');
const { TOOL_CATEGORIES } = require('../tool.registry');

const inputSchema = {
  type: 'object',
  properties: {
    sessionId: {
      type: 'integer',
      minimum: 1,
      description: 'The unique ID of the session',
    },
  },
  required: ['sessionId'],
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    session: {
      type: ['object', 'null'],
      description: 'Session record with related info or null if not found',
    },
  },
  required: ['session'],
  additionalProperties: false,
};

async function handler({ sessionId }) {
  const session = db
    .prepare(
      `
      SELECT
        s.id, s.title, s.session_type, s.status, s.scheduled_at,
        s.duration, s.location, s.court_room, s.judge, s.outcome,
        s.description, s.notes, s.participants, s.dossier_id, s.case_id,
        s.created_at, s.updated_at,
        d.reference as dossier_reference, d.title as dossier_title,
        c.reference as case_reference, c.title as case_title,
        cl.name as client_name
      FROM sessions s
      LEFT JOIN dossiers d ON d.id = s.dossier_id
      LEFT JOIN cases c ON c.id = s.case_id
      LEFT JOIN clients cl ON cl.id = d.client_id OR cl.id = (SELECT client_id FROM dossiers WHERE id = c.dossier_id)
      WHERE s.id = ? AND s.deleted_at IS NULL
      `
    )
    .get(sessionId);

  return { session: session || null };
}

module.exports = {
  name: 'getSession',
  category: TOOL_CATEGORIES.READ,
  description: 'Retrieve a single session by ID with related information',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
