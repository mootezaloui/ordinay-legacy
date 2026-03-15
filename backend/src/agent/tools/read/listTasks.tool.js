'use strict';

/**
 * READ TOOL: listTasks
 *
 * List tasks with optional filters.
 * Read-only, no side effects, safe for all agent versions.
 */

const tasksService = require('../../../services/tasks.service');
const TOOL_CATEGORIES = { READ: 'READ' };
const ALLOWED_STATUS_VALUES = new Set([
  'todo',
  'in_progress',
  'blocked',
  'done',
  'cancelled',
  'open',
  'closed',
  'active',
  'archived',
  'pending',
]);

const inputSchema = {
  type: 'object',
  properties: {
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
    status: {
      type: ['string', 'null'],
      enum: ['todo', 'in_progress', 'blocked', 'done', 'cancelled', null],
      description: 'Filter by task status',
    },
    priority: {
      type: ['string', 'null'],
      enum: ['urgent', 'high', 'medium', 'low', null],
      description: 'Filter by priority',
    },
    query: {
      type: ['string', 'null'],
      description: 'Optional text search on task title',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 100,
      default: 50,
      description: 'Maximum number of tasks to return',
    },
  },
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    tasks: {
      type: 'array',
      items: { type: 'object' },
      description: 'Array of task records',
    },
    count: {
      type: 'integer',
      description: 'Number of tasks returned',
    },
  },
  required: ['tasks', 'count'],
  additionalProperties: false,
};

async function handler({
  dossierId = null,
  lawsuitId = null,
  status = null,
  priority = null,
  query = null,
  limit = 50,
}) {
  logStatusWarningIfNeeded(status);
  const tasks = tasksService.listFiltered({
    dossierId,
    lawsuitId,
    status,
    priority,
    query,
    limit,
  });

  return {
    tasks,
    count: tasks.length,
  };
}

function logStatusWarningIfNeeded(status) {
  if (typeof status !== 'string' || !status.trim()) {
    return;
  }

  const normalized = status.trim().toLowerCase();
  if (ALLOWED_STATUS_VALUES.has(normalized)) {
    return;
  }

  console.warn('[STATUS_WARNING]', `tool: listTasks`, `received_status: "${status}"`);
}

module.exports = {
  name: 'listTasks',
  category: TOOL_CATEGORIES.READ,
  description:
    'List task records with optional filters by dossier, lawsuit, status, priority, or title query. Returns task rows only; use graph/GET tools for related entities.',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};



