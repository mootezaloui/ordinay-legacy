'use strict';

/**
 * PLAN TOOL: summarizeEntityProgress
 *
 * Summarizes progress and completion metrics for an entity.
 * Deterministic, metrics-based summary.
 */

const db = require('../../../db/connection');
const { TOOL_CATEGORIES } = require('../tool.registry');

const inputSchema = {
  type: 'object',
  properties: {
    entityType: {
      type: 'string',
      enum: ['dossier', 'client', 'session'],
      description: 'Type of entity',
    },
    entityId: {
      type: 'integer',
      minimum: 1,
      description: 'ID of the entity',
    },
    timeframe: {
      type: 'string',
      enum: ['7_days', '30_days', '90_days', 'all_time'],
      default: '30_days',
      description: 'Timeframe for progress summary',
    },
  },
  required: ['entityType', 'entityId'],
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    entityType: { type: 'string' },
    entityId: { type: 'integer' },
    timeframe: { type: 'string' },
    progress: {
      type: 'object',
      properties: {
        completedTasks: { type: 'integer' },
        activeTasks: { type: 'integer' },
        completionRate: { type: 'number' },
        velocity: { type: 'number' },
        trend: { type: 'string', enum: ['improving', 'stable', 'declining', 'unknown'] },
      },
      required: ['completedTasks', 'activeTasks', 'completionRate', 'trend'],
    },
    summary: { type: 'string' },
    analyzedAt: { type: 'string' },
  },
  required: ['entityType', 'entityId', 'timeframe', 'progress', 'summary', 'analyzedAt'],
  additionalProperties: false,
};

function getTimeframeDate(timeframe) {
  const now = new Date();
  if (timeframe === '7_days') {
    now.setDate(now.getDate() - 7);
  } else if (timeframe === '30_days') {
    now.setDate(now.getDate() - 30);
  } else if (timeframe === '90_days') {
    now.setDate(now.getDate() - 90);
  } else {
    return null;
  }
  return now.toISOString();
}

function computeTrend(completionRate, velocity) {
  if (completionRate >= 80 && velocity >= 0.5) return 'improving';
  if (completionRate >= 50 && velocity >= 0.3) return 'stable';
  if (completionRate < 50 || velocity < 0.3) return 'declining';
  return 'unknown';
}

function buildSummary(progress, timeframe) {
  const timeframeLabel = timeframe === '7_days' ? '7 days'
    : timeframe === '30_days' ? '30 days'
    : timeframe === '90_days' ? '90 days'
    : 'all time';

  const parts = [];
  parts.push(`${progress.completedTasks} task${progress.completedTasks === 1 ? '' : 's'} completed`);
  parts.push(`${progress.activeTasks} active`);
  parts.push(`${Math.round(progress.completionRate)}% completion rate`);

  return `In the past ${timeframeLabel}: ${parts.join(', ')}. Trend: ${progress.trend}.`;
}

async function handler({ entityType, entityId, timeframe = '30_days' }) {
  const now = new Date().toISOString();
  const startDate = getTimeframeDate(timeframe);

  let progress;

  if (entityType === 'dossier') {
    const dossier = db.prepare(
      'SELECT * FROM dossiers WHERE id = ? AND deleted_at IS NULL AND validated = 1'
    ).get(entityId);

    if (!dossier) {
      throw new Error(`Dossier ${entityId} not found`);
    }

    const taskStats = startDate
      ? db.prepare(`
          SELECT
            COUNT(*) as total,
            SUM(CASE WHEN LOWER(COALESCE(status, '')) IN ('done', 'completed') THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN LOWER(COALESCE(status, '')) NOT IN ('done', 'completed', 'cancelled', 'closed') THEN 1 ELSE 0 END) as active
          FROM tasks
          WHERE dossier_id = ?
            AND deleted_at IS NULL
            AND validated = 1
            AND updated_at >= ?
        `).get(entityId, startDate)
      : db.prepare(`
          SELECT
            COUNT(*) as total,
            SUM(CASE WHEN LOWER(COALESCE(status, '')) IN ('done', 'completed') THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN LOWER(COALESCE(status, '')) NOT IN ('done', 'completed', 'cancelled', 'closed') THEN 1 ELSE 0 END) as active
          FROM tasks
          WHERE dossier_id = ? AND deleted_at IS NULL AND validated = 1
        `).get(entityId);

    const completionRate = taskStats.total > 0
      ? (taskStats.completed / taskStats.total) * 100
      : 0;

    // Velocity: completed tasks per week
    const daysInTimeframe = timeframe === '7_days' ? 7
      : timeframe === '30_days' ? 30
      : timeframe === '90_days' ? 90
      : 365;
    const weeksInTimeframe = daysInTimeframe / 7;
    const velocity = weeksInTimeframe > 0 ? taskStats.completed / weeksInTimeframe : 0;

    progress = {
      completedTasks: taskStats.completed || 0,
      activeTasks: taskStats.active || 0,
      completionRate,
      velocity: parseFloat(velocity.toFixed(2)),
      trend: computeTrend(completionRate, velocity),
    };
  } else if (entityType === 'client') {
    const client = db.prepare(
      'SELECT * FROM clients WHERE id = ? AND deleted_at IS NULL'
    ).get(entityId);

    if (!client) {
      throw new Error(`Client ${entityId} not found`);
    }

    const taskStats = startDate
      ? db.prepare(`
          SELECT
            COUNT(*) as total,
            SUM(CASE WHEN LOWER(COALESCE(t.status, '')) IN ('done', 'completed') THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN LOWER(COALESCE(t.status, '')) NOT IN ('done', 'completed', 'cancelled', 'closed') THEN 1 ELSE 0 END) as active
          FROM tasks t
          JOIN dossiers d ON d.id = t.dossier_id
          WHERE d.client_id = ?
            AND t.deleted_at IS NULL
            AND t.validated = 1
            AND t.updated_at >= ?
        `).get(entityId, startDate)
      : db.prepare(`
          SELECT
            COUNT(*) as total,
            SUM(CASE WHEN LOWER(COALESCE(t.status, '')) IN ('done', 'completed') THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN LOWER(COALESCE(t.status, '')) NOT IN ('done', 'completed', 'cancelled', 'closed') THEN 1 ELSE 0 END) as active
          FROM tasks t
          JOIN dossiers d ON d.id = t.dossier_id
          WHERE d.client_id = ? AND t.deleted_at IS NULL AND t.validated = 1
        `).get(entityId);

    const completionRate = taskStats.total > 0
      ? (taskStats.completed / taskStats.total) * 100
      : 0;

    const daysInTimeframe = timeframe === '7_days' ? 7
      : timeframe === '30_days' ? 30
      : timeframe === '90_days' ? 90
      : 365;
    const weeksInTimeframe = daysInTimeframe / 7;
    const velocity = weeksInTimeframe > 0 ? taskStats.completed / weeksInTimeframe : 0;

    progress = {
      completedTasks: taskStats.completed || 0,
      activeTasks: taskStats.active || 0,
      completionRate,
      velocity: parseFloat(velocity.toFixed(2)),
      trend: computeTrend(completionRate, velocity),
    };
  } else if (entityType === 'session') {
    const session = db.prepare(
      'SELECT * FROM sessions WHERE id = ? AND deleted_at IS NULL'
    ).get(entityId);

    if (!session) {
      throw new Error(`Session ${entityId} not found`);
    }

    // Sessions don't have tasks, so we return basic status
    const isCompleted = session.status === 'completed' || session.status === 'done';
    progress = {
      completedTasks: isCompleted ? 1 : 0,
      activeTasks: isCompleted ? 0 : 1,
      completionRate: isCompleted ? 100 : 0,
      trend: 'unknown',
    };
  }

  const summary = buildSummary(progress, timeframe);

  return {
    entityType,
    entityId,
    timeframe,
    progress,
    summary,
    analyzedAt: now,
  };
}

module.exports = {
  name: 'summarizeEntityProgress',
  category: TOOL_CATEGORIES.PLAN,
  description: 'Summarize progress and completion metrics for an entity',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v2', 'v3'],
  handler,
  plannerHint: {
    requiredContext: ['entityType', 'entityId'],
    outputSummaryFields: ['progress', 'summary'],
  },
};
