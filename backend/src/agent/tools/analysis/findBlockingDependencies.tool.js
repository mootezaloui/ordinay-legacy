'use strict';

/**
 * ANALYSIS TOOL: findBlockingDependencies
 *
 * Identify tasks, sessions, or items that are blocking progress on a dossier.
 * Pure computation, deterministic, no side effects.
 * Safe for all agent versions.
 */

const db = require('../../../db/connection');
const { TOOL_CATEGORIES } = require('../tool.registry');

const inputSchema = {
  type: 'object',
  properties: {
    dossierId: {
      type: 'integer',
      minimum: 1,
      description: 'The unique ID of the dossier to analyze',
    },
  },
  required: ['dossierId'],
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    dossierId: { type: 'integer' },
    blockers: {
      type: 'array',
      items: { type: 'object' },
      description: 'Array of blocking items',
    },
    count: {
      type: 'integer',
      description: 'Number of blockers found',
    },
    summary: {
      type: 'object',
      properties: {
        blockedTasks: { type: 'integer' },
        overdueTasks: { type: 'integer' },
        pendingSessions: { type: 'integer' },
        urgentItems: { type: 'integer' },
      },
    },
  },
  required: ['dossierId', 'blockers', 'count', 'summary'],
  additionalProperties: false,
};

async function handler({ dossierId }) {
  const blockers = [];
  const now = new Date().toISOString();

  // Find explicitly blocked tasks
  const blockedTasks = db
    .prepare(
      `
      SELECT
        id, title, description, priority, due_date,
        'task' as type, 'blocked' as reason
      FROM tasks
      WHERE dossier_id = ?
        AND deleted_at IS NULL
        AND status = 'blocked'
      ORDER BY priority DESC
      `
    )
    .all(dossierId);

  blockers.push(...blockedTasks);

  // Find overdue high/urgent priority tasks
  const overdueTasks = db
    .prepare(
      `
      SELECT
        id, title, description, priority, due_date,
        'task' as type, 'overdue' as reason
      FROM tasks
      WHERE dossier_id = ?
        AND deleted_at IS NULL
        AND status NOT IN ('done', 'cancelled')
        AND priority IN ('urgent', 'high')
        AND due_date IS NOT NULL
        AND due_date < ?
      ORDER BY due_date ASC
      `
    )
    .all(dossierId, now);

  blockers.push(...overdueTasks);

  // Find pending critical sessions (within next 7 days)
  const pendingSessions = db
    .prepare(
      `
      SELECT
        id, title, session_type, scheduled_at,
        'session' as type, 'pending_critical' as reason
      FROM sessions
      WHERE dossier_id = ?
        AND deleted_at IS NULL
        AND status IN ('scheduled', 'pending')
        AND scheduled_at >= ?
        AND scheduled_at <= datetime(?, '+7 days')
      ORDER BY scheduled_at ASC
      `
    )
    .all(dossierId, now, now);

  blockers.push(...pendingSessions);

  // Compute summary
  const summary = {
    blockedTasks: blockedTasks.length,
    overdueTasks: overdueTasks.length,
    pendingSessions: pendingSessions.length,
    urgentItems: blockers.filter(b => b.priority === 'urgent').length,
  };

  return {
    dossierId,
    blockers,
    count: blockers.length,
    summary,
  };
}

module.exports = {
  name: 'findBlockingDependencies',
  category: TOOL_CATEGORIES.ANALYSIS,
  description: 'Identify tasks and items that are blocking progress on a dossier',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
