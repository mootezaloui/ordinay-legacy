'use strict';

/**
 * READ TOOL: listTasks
 *
 * List tasks with optional filters.
 * Read-only, no side effects, safe for all agent versions.
 */

const db = require('../../../db/connection');
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

async function handler({ dossierId = null, lawsuitId = null, status = null, priority = null, limit = 50 }) {
  let query = `
    SELECT
      t.id, t.dossier_id, t.lawsuit_id, t.title, t.description,
      t.assigned_to, t.status, t.priority, t.due_date,
      t.estimated_time, t.completed_at, t.created_at, t.updated_at,
      d.reference as dossier_reference, d.title as dossier_title,
      c.reference as lawsuit_reference, c.title as lawsuit_title
    FROM tasks t
    LEFT JOIN dossiers d ON d.id = t.dossier_id
    LEFT JOIN lawsuits c ON c.id = t.lawsuit_id
    WHERE t.deleted_at IS NULL
  `;

  const params = [];

  if (dossierId !== null) {
    query += ' AND t.dossier_id = ?';
    params.push(dossierId);
  }

  if (lawsuitId !== null) {
    query += ' AND t.lawsuit_id = ?';
    params.push(lawsuitId);
  }

  if (status !== null) {
    query += ' AND t.status = ?';
    params.push(status);
  }

  if (priority !== null) {
    query += ' AND t.priority = ?';
    params.push(priority);
  }

  query += ' ORDER BY t.priority DESC, t.due_date ASC LIMIT ?';
  params.push(limit);

  const tasks = db.prepare(query).all(...params);

  return {
    tasks,
    count: tasks.length,
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



