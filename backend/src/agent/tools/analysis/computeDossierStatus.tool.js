'use strict';

/**
 * ANALYSIS TOOL: computeDossierStatus
 *
 * Compute derived status information for a dossier.
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
      description: 'The unique ID of the dossier',
    },
  },
  required: ['dossierId'],
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    dossierId: { type: 'integer' },
    status: { type: 'string' },
    computed: {
      type: 'object',
      properties: {
        totalTasks: { type: 'integer' },
        completedTasks: { type: 'integer' },
        overdueTasks: { type: 'integer' },
        upcomingSessions: { type: 'integer' },
        activeCases: { type: 'integer' },
        hasOverdueDeadline: { type: 'boolean' },
        daysUntilNextDeadline: { type: ['integer', 'null'] },
        completionRate: { type: 'number' },
      },
      required: [
        'totalTasks',
        'completedTasks',
        'overdueTasks',
        'upcomingSessions',
        'activeCases',
        'hasOverdueDeadline',
        'daysUntilNextDeadline',
        'completionRate',
      ],
    },
  },
  required: ['dossierId', 'status', 'computed'],
  additionalProperties: false,
};

async function handler({ dossierId }) {
  const dossier = db
    .prepare('SELECT id, status, next_deadline FROM dossiers WHERE id = ? AND deleted_at IS NULL')
    .get(dossierId);

  if (!dossier) {
    throw new Error(`Dossier ${dossierId} not found`);
  }

  const now = new Date().toISOString();

  // Count tasks
  const taskStats = db
    .prepare(
      `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status NOT IN ('done', 'cancelled') AND due_date < ? THEN 1 ELSE 0 END) as overdue
      FROM tasks
      WHERE dossier_id = ? AND deleted_at IS NULL
      `
    )
    .get(now, dossierId);

  // Count upcoming sessions (next 30 days)
  const upcomingSessions = db
    .prepare(
      `
      SELECT COUNT(*) as count
      FROM sessions
      WHERE dossier_id = ?
        AND deleted_at IS NULL
        AND status IN ('scheduled', 'confirmed')
        AND scheduled_at >= ?
        AND scheduled_at <= datetime(?, '+30 days')
      `
    )
    .get(dossierId, now, now);

  // Count active cases
  const activeCases = db
    .prepare(
      `
      SELECT COUNT(*) as count
      FROM cases
      WHERE dossier_id = ?
        AND deleted_at IS NULL
        AND status IN ('open', 'in_progress')
      `
    )
    .get(dossierId);

  // Check if next deadline is overdue
  const hasOverdueDeadline = dossier.next_deadline
    ? new Date(dossier.next_deadline) < new Date()
    : false;

  // Calculate days until next deadline
  let daysUntilNextDeadline = null;
  if (dossier.next_deadline) {
    const deadline = new Date(dossier.next_deadline);
    const today = new Date();
    const diffTime = deadline - today;
    daysUntilNextDeadline = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  // Calculate completion rate
  const completionRate =
    taskStats.total > 0 ? (taskStats.completed / taskStats.total) * 100 : 0;

  return {
    dossierId,
    status: dossier.status,
    computed: {
      totalTasks: taskStats.total,
      completedTasks: taskStats.completed,
      overdueTasks: taskStats.overdue,
      upcomingSessions: upcomingSessions.count,
      activeCases: activeCases.count,
      hasOverdueDeadline,
      daysUntilNextDeadline,
      completionRate: Math.round(completionRate * 100) / 100, // round to 2 decimals
    },
  };
}

module.exports = {
  name: 'computeDossierStatus',
  category: TOOL_CATEGORIES.ANALYSIS,
  description: 'Compute derived status information for a dossier',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
