'use strict';

/**
 * READ TOOL: listSessions
 *
 * List sessions with optional filters.
 * Read-only, no side effects, safe for all agent versions.
 */

const sessionsService = require('../../../services/sessions.service');
const TOOL_CATEGORIES = { READ: 'READ' };

const inputSchema = {
  type: 'object',
  properties: {
    query: {
      type: ['string', 'null'],
      description: 'Optional text search on session title or type',
    },
    status: {
      type: ['string', 'null'],
      description: 'Filter by session status',
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
    timeframe: {
      type: ['string', 'null'],
      enum: ['today', 'this-week', 'upcoming', null],
      description: 'Time-based filter for sessions',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 200,
      default: 50,
      description: 'Maximum number of sessions to return',
    },
  },
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    sessions: {
      type: 'array',
      items: { type: 'object' },
      description: 'Array of session records',
    },
    count: {
      type: 'integer',
      description: 'Number of sessions returned',
    },
  },
  required: ['sessions', 'count'],
  additionalProperties: false,
};

async function handler({
  query = null,
  status = null,
  dossierId = null,
  lawsuitId = null,
  timeframe = null,
  limit = 50,
} = {}) {
  const limited = sessionsService.listFiltered({
    query,
    status,
    dossierId,
    lawsuitId,
    timeframe,
    limit,
  });

  return {
    sessions: limited,
    count: limited.length,
  };
}

module.exports = {
  name: 'listSessions',
  category: TOOL_CATEGORIES.READ,
  description:
    'List session records with optional filters by scope, status, text query, and timeframe. Use for hearing/meeting timelines and scheduling checks.',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
