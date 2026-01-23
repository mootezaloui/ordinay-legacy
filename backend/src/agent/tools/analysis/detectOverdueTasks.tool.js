'use strict';

/**
 * ANALYSIS TOOL: detectOverdueTasks
 *
 * Detect tasks that are overdue based on filters.
 * Pure computation, deterministic, no side effects.
 * Safe for all agent versions.
 */

const db = require('../../../db/connection');
const { TOOL_CATEGORIES } = require('../tool.registry');

const inputSchema = {
  type: 'object',
  properties: {
    dossierId: {
      type: ['integer', 'null'],
      minimum: 1,
      description: 'Optional: filter by dossier ID',
    },
    lawsuitId: {
      type: ['integer', 'null'],
      minimum: 1,
      description: 'Optional: filter by lawsuit ID',
    },
    priority: {
      type: ['string', 'null'],
      enum: ['urgent', 'high', 'medium', 'low', null],
      description: 'Optional: filter by priority',
    },
  },
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    overdueTasks: {
      type: 'array',
      items: { type: 'object' },
      description: 'Array of overdue tasks',
    },
    count: {
      type: 'integer',
      description: 'Number of overdue tasks',
    },
    analysis: {
      type: 'object',
      properties: {
        byPriority: { type: 'object' },
        oldestOverdue: { type: ['object', 'null'] },
        averageDaysOverdue: { type: 'number' },
      },
    },
  },
  required: ['overdueTasks', 'count', 'analysis'],
  additionalProperties: false,
};

async function handler({ dossierId = null, lawsuitId = null, priority = null }) {
  const now = new Date().toISOString();
  let query = `
    SELECT
      t.id, t.dossier_id, t.lawsuit_id, t.title, t.description,
      t.assigned_to, t.status, t.priority, t.due_date,
      t.created_at, t.updated_at,
      d.reference as dossier_reference, d.title as dossier_title,
      c.reference as lawsuit_reference, c.title as lawsuit_title,
      julianday(?) - julianday(t.due_date) as days_overdue
    FROM tasks t
    LEFT JOIN dossiers d ON d.id = t.dossier_id
    LEFT JOIN lawsuits c ON c.id = t.lawsuit_id
    WHERE t.deleted_at IS NULL
      AND t.validated = 1
      AND t.status NOT IN ('done', 'cancelled')
      AND t.due_date IS NOT NULL
      AND t.due_date < ?
  `;

  const params = [now, now];

  if (dossierId !== null) {
    query += ' AND t.dossier_id = ?';
    params.push(dossierId);
  }

  if (lawsuitId !== null) {
    query += ' AND t.lawsuit_id = ?';
    params.push(lawsuitId);
  }

  if (priority !== null) {
    query += ' AND t.priority = ?';
    params.push(priority);
  }

  query += ' ORDER BY t.due_date ASC';

  const overdueTasks = db.prepare(query).all(...params);

  // Compute analysis
  const byPriority = {
    urgent: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  let totalDaysOverdue = 0;

  overdueTasks.forEach(task => {
    byPriority[task.priority] = (byPriority[task.priority] || 0) + 1;
    totalDaysOverdue += task.days_overdue;
  });

  const oldestOverdue = overdueTasks.length > 0 ? overdueTasks[0] : null;
  const averageDaysOverdue =
    overdueTasks.length > 0
      ? Math.round((totalDaysOverdue / overdueTasks.length) * 100) / 100
      : 0;

  return {
    overdueTasks,
    count: overdueTasks.length,
    analysis: {
      byPriority,
      oldestOverdue,
      averageDaysOverdue,
    },
  };
}

module.exports = {
  name: 'detectOverdueTasks',
  category: TOOL_CATEGORIES.ANALYSIS,
  description: 'Detect tasks that are overdue',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};



