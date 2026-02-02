'use strict';

/**
 * READ TOOL: listTasks
 *
 * List tasks with optional filters.
 * Read-only, no side effects, safe for all agent versions.
 */

const tasksService = require('../../../services/tasks.service');
const { TOOL_CATEGORIES } = require('../tool.registry');

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
  let tasks = tasksService.list();

  if (dossierId !== null) {
    tasks = tasks.filter(task => task.dossier_id === dossierId);
  }

  if (lawsuitId !== null) {
    tasks = tasks.filter(task => task.lawsuit_id === lawsuitId);
  }

  if (status !== null) {
    tasks = tasks.filter(task => task.status === status);
  }

  if (priority !== null) {
    tasks = tasks.filter(task => task.priority === priority);
  }

  if (query) {
    const q = String(query).toLowerCase();
    tasks = tasks.filter(task => String(task.title || '').toLowerCase().includes(q));
  }

  tasks = tasks.sort((a, b) => {
    const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
    const priorityA = priorityOrder[String(a.priority || '').toLowerCase()] || 0;
    const priorityB = priorityOrder[String(b.priority || '').toLowerCase()] || 0;
    if (priorityA !== priorityB) return priorityB - priorityA;
    const dueA = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER;
    const dueB = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER;
    return dueA - dueB;
  });

  const limited = tasks.slice(0, limit);

  return {
    tasks: limited,
    count: limited.length,
  };
}

module.exports = {
  name: 'listTasks',
  category: TOOL_CATEGORIES.READ,
  description: 'List tasks with optional filters',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};



