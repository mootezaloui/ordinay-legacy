'use strict';

/**
 * READ TOOL: getSession
 *
 * Retrieve a single session by ID with related dossier/lawsuit information.
 * Read-only, no side effects, safe for all agent versions.
 */

const sessionsService = require('../../../services/sessions.service');
const TOOL_CATEGORIES = { READ: 'READ' };

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
  const session = sessionsService.get(sessionId);
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


