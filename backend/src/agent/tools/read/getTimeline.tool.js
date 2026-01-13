'use strict';

/**
 * READ TOOL: getTimeline
 *
 * Retrieve activity timeline for a dossier or case.
 * Aggregates tasks, sessions, and missions chronologically.
 * Read-only, no side effects, safe for all agent versions.
 */

const db = require('../../../db/connection');
const { TOOL_CATEGORIES } = require('../tool.registry');

const inputSchema = {
  type: 'object',
  properties: {
    entityType: {
      type: 'string',
      enum: ['dossier', 'case'],
      description: 'Type of entity to get timeline for',
    },
    entityId: {
      type: 'integer',
      minimum: 1,
      description: 'ID of the entity',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 200,
      default: 100,
      description: 'Maximum number of timeline items',
    },
  },
  required: ['entityType', 'entityId'],
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    timeline: {
      type: 'array',
      items: { type: 'object' },
      description: 'Array of timeline events, sorted by date descending',
    },
    count: {
      type: 'integer',
      description: 'Number of timeline items',
    },
  },
  required: ['timeline', 'count'],
  additionalProperties: false,
};

async function handler({ entityType, entityId, limit = 100 }) {
  const timeline = [];

  // Get tasks
  const taskQuery = entityType === 'dossier'
    ? 'SELECT id, title, status, priority, due_date, created_at, "task" as type FROM tasks WHERE dossier_id = ? AND deleted_at IS NULL'
    : 'SELECT id, title, status, priority, due_date, created_at, "task" as type FROM tasks WHERE case_id = ? AND deleted_at IS NULL';

  const tasks = db.prepare(taskQuery).all(entityId);
  timeline.push(...tasks.map(t => ({
    ...t,
    date: t.due_date || t.created_at,
  })));

  // Get sessions
  const sessionQuery = entityType === 'dossier'
    ? 'SELECT id, title, session_type, status, scheduled_at, created_at, "session" as type FROM sessions WHERE dossier_id = ? AND deleted_at IS NULL'
    : 'SELECT id, title, session_type, status, scheduled_at, created_at, "session" as type FROM sessions WHERE case_id = ? AND deleted_at IS NULL';

  const sessions = db.prepare(sessionQuery).all(entityId);
  timeline.push(...sessions.map(s => ({
    ...s,
    date: s.scheduled_at,
  })));

  // Get missions
  const missionQuery = entityType === 'dossier'
    ? 'SELECT id, title, mission_type, status, priority, due_date, created_at, "mission" as type FROM missions WHERE dossier_id = ? AND deleted_at IS NULL'
    : 'SELECT id, title, mission_type, status, priority, due_date, created_at, "mission" as type FROM missions WHERE case_id = ? AND deleted_at IS NULL';

  const missions = db.prepare(missionQuery).all(entityId);
  timeline.push(...missions.map(m => ({
    ...m,
    date: m.due_date || m.created_at,
  })));

  // Sort by date descending
  timeline.sort((a, b) => {
    const dateA = new Date(a.date || 0);
    const dateB = new Date(b.date || 0);
    return dateB - dateA;
  });

  // Apply limit
  const limitedTimeline = timeline.slice(0, limit);

  return {
    timeline: limitedTimeline,
    count: limitedTimeline.length,
  };
}

module.exports = {
  name: 'getTimeline',
  category: TOOL_CATEGORIES.READ,
  description: 'Retrieve activity timeline for a dossier or case',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
