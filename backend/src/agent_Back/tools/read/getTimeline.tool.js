'use strict';

/**
 * READ TOOL: getTimeline
 *
 * Retrieve activity timeline for a dossier or lawsuit.
 * Aggregates tasks, sessions, and missions chronologically.
 * Read-only, no side effects, safe for all agent versions.
 */

const tasksService = require('../../../services/tasks.service');
const sessionsService = require('../../../services/sessions.service');
const missionsService = require('../../../services/missions.service');
const { TOOL_CATEGORIES } = require('../tool.registry');

const inputSchema = {
  type: 'object',
  properties: {
    entityType: {
      type: 'string',
      enum: ['dossier', 'lawsuit'],
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
  const tasks = tasksService.list().filter(task =>
    entityType === 'dossier' ? task.dossier_id === entityId : task.lawsuit_id === entityId
  );
  timeline.push(
    ...tasks.map(task => ({
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      due_date: task.due_date,
      created_at: task.created_at,
      type: 'task',
      date: task.due_date || task.created_at,
    }))
  );

  // Get sessions
  const sessions = sessionsService.list().filter(session =>
    entityType === 'dossier' ? session.dossier_id === entityId : session.lawsuit_id === entityId
  );
  timeline.push(
    ...sessions.map(session => ({
      id: session.id,
      title: session.title,
      session_type: session.session_type,
      status: session.status,
      scheduled_at: session.scheduled_at,
      created_at: session.created_at,
      type: 'session',
      date: session.scheduled_at || session.created_at,
    }))
  );

  // Get missions
  const missions = missionsService.list().filter(mission =>
    entityType === 'dossier' ? mission.dossier_id === entityId : mission.lawsuit_id === entityId
  );
  timeline.push(
    ...missions.map(mission => ({
      id: mission.id,
      title: mission.title,
      mission_type: mission.mission_type,
      status: mission.status,
      priority: mission.priority,
      due_date: mission.due_date,
      created_at: mission.created_at,
      type: 'mission',
      date: mission.due_date || mission.created_at,
    }))
  );

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
  description: 'Retrieve activity timeline for a dossier or lawsuit',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};

