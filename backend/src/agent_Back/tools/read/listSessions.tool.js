'use strict';

/**
 * READ TOOL: listSessions
 *
 * List sessions with optional filters.
 * Read-only, no side effects, safe for all agent versions.
 */

const sessionsService = require('../../../services/sessions.service');
const { TOOL_CATEGORIES } = require('../tool.registry');

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

function isSameDate(dateValue, targetDate) {
  const date = new Date(dateValue);
  return date.toISOString().slice(0, 10) === targetDate.toISOString().slice(0, 10);
}

async function handler({
  query = null,
  status = null,
  dossierId = null,
  lawsuitId = null,
  timeframe = null,
  limit = 50,
} = {}) {
  let sessions = sessionsService.list();

  if (dossierId !== null) {
    sessions = sessions.filter(session => session.dossier_id === dossierId);
  }

  if (lawsuitId !== null) {
    sessions = sessions.filter(session => session.lawsuit_id === lawsuitId);
  }

  if (status) {
    const normalized = String(status).toLowerCase();
    sessions = sessions.filter(session => String(session.status || '').toLowerCase() === normalized);
  }

  if (query) {
    const q = String(query).toLowerCase();
    sessions = sessions.filter(session => {
      const haystack = [session.title, session.session_type].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }

  if (timeframe) {
    const now = new Date();
    if (timeframe === 'today') {
      sessions = sessions.filter(session => session.scheduled_at && isSameDate(session.scheduled_at, now));
    } else if (timeframe === 'this-week') {
      const weekEnd = new Date(now);
      weekEnd.setDate(now.getDate() + 7);
      sessions = sessions.filter(session => {
        if (!session.scheduled_at) return false;
        const date = new Date(session.scheduled_at);
        return date >= now && date <= weekEnd;
      });
    } else if (timeframe === 'upcoming') {
      sessions = sessions.filter(session => session.scheduled_at && new Date(session.scheduled_at) >= now);
    }
  }

  sessions = sessions.sort((a, b) => {
    const aDate = new Date(a.scheduled_at || a.created_at || 0).getTime();
    const bDate = new Date(b.scheduled_at || b.created_at || 0).getTime();
    return bDate - aDate;
  });

  const limited = sessions.slice(0, limit);

  return {
    sessions: limited,
    count: limited.length,
  };
}

module.exports = {
  name: 'listSessions',
  category: TOOL_CATEGORIES.READ,
  description: 'List sessions with optional filters',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
