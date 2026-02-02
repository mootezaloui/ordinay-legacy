'use strict';

/**
 * READ TOOL: listMissions
 *
 * List missions with optional filters.
 * Read-only, no side effects, safe for all agent versions.
 */

const missionsService = require('../../../services/missions.service');
const { TOOL_CATEGORIES } = require('../tool.registry');

const inputSchema = {
  type: 'object',
  properties: {
    query: {
      type: ['string', 'null'],
      description: 'Optional text search on mission reference or title',
    },
    status: {
      type: ['string', 'null'],
      description: 'Filter by mission status',
    },
    priority: {
      type: ['string', 'null'],
      description: 'Filter by mission priority',
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
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 200,
      default: 50,
      description: 'Maximum number of missions to return',
    },
  },
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    missions: {
      type: 'array',
      items: { type: 'object' },
      description: 'Array of mission records',
    },
    count: {
      type: 'integer',
      description: 'Number of missions returned',
    },
  },
  required: ['missions', 'count'],
  additionalProperties: false,
};

async function handler({
  query = null,
  status = null,
  priority = null,
  dossierId = null,
  lawsuitId = null,
  limit = 50,
} = {}) {
  let missions = missionsService.list();

  if (dossierId !== null) {
    missions = missions.filter(mission => mission.dossier_id === dossierId);
  }

  if (lawsuitId !== null) {
    missions = missions.filter(mission => mission.lawsuit_id === lawsuitId);
  }

  if (status) {
    const normalized = String(status).toLowerCase();
    missions = missions.filter(mission => String(mission.status || '').toLowerCase() === normalized);
  }

  if (priority) {
    const normalized = String(priority).toLowerCase();
    missions = missions.filter(mission => String(mission.priority || '').toLowerCase() === normalized);
  }

  if (query) {
    const q = String(query).toLowerCase();
    missions = missions.filter(mission => {
      const haystack = [mission.reference, mission.title].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }

  missions = missions.sort((a, b) => {
    const aDate = new Date(a.due_date || a.assign_date || a.created_at || 0).getTime();
    const bDate = new Date(b.due_date || b.assign_date || b.created_at || 0).getTime();
    return bDate - aDate;
  });

  const limited = missions.slice(0, limit);

  return {
    missions: limited,
    count: limited.length,
  };
}

module.exports = {
  name: 'listMissions',
  category: TOOL_CATEGORIES.READ,
  description: 'List missions with optional filters',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
