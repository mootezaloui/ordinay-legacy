'use strict';

/**
 * PLAN TOOL: analyzeEntityState
 *
 * Comprehensive entity state analysis.
 * Uses detectPrioritySignals + read tools to build complete picture.
 * Read-only, deterministic-first approach.
 */

const db = require('../../../db/connection');
const { TOOL_CATEGORIES } = require('../tool.registry');

const inputSchema = {
  type: 'object',
  properties: {
    entityType: {
      type: 'string',
      enum: ['dossier', 'client', 'session'],
      description: 'Type of entity to analyze',
    },
    entityId: {
      type: 'integer',
      minimum: 1,
      description: 'ID of the entity',
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
    state: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        health: { type: 'string', enum: ['critical', 'at_risk', 'healthy', 'unknown'] },
        metrics: { type: 'object' },
      },
      required: ['status', 'health', 'metrics'],
    },
    signals: { type: 'array' },
    summary: { type: 'string' },
    analyzedAt: { type: 'string' },
  },
  required: ['entityType', 'entityId', 'state', 'signals', 'summary', 'analyzedAt'],
  additionalProperties: false,
};

function computeHealth(signals) {
  if (!signals || signals.length === 0) return 'healthy';

  const hasCritical = signals.some(s => s.severity === 'critical');
  const hasHigh = signals.some(s => s.severity === 'high');

  if (hasCritical) return 'critical';
  if (hasHigh) return 'at_risk';
  if (signals.length > 0) return 'at_risk';
  return 'healthy';
}

function buildSummary(entityType, state, signals) {
  if (signals.length === 0) {
    return `${entityType} is in good standing with no urgent issues.`;
  }

  const criticalCount = signals.filter(s => s.severity === 'critical').length;
  const highCount = signals.filter(s => s.severity === 'high').length;

  const parts = [];
  if (criticalCount > 0) {
    parts.push(`${criticalCount} critical issue${criticalCount === 1 ? '' : 's'}`);
  }
  if (highCount > 0) {
    parts.push(`${highCount} high-priority issue${highCount === 1 ? '' : 's'}`);
  }

  return `${entityType} has ${parts.join(' and ')}.`;
}

async function handler({ entityType, entityId }) {
  const now = new Date().toISOString();

  // Use detectPrioritySignals internally
  const detectPrioritySignals = require('./detectPrioritySignals.tool');
  const priorityResult = await detectPrioritySignals.handler({ entityType, entityId });

  let state;

  if (entityType === 'dossier') {
    const dossier = db.prepare(
      'SELECT * FROM dossiers WHERE id = ? AND deleted_at IS NULL AND validated = 1'
    ).get(entityId);

    if (!dossier) {
      throw new Error(`Dossier ${entityId} not found`);
    }

    const taskStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN LOWER(COALESCE(status, '')) NOT IN ('done', 'completed', 'cancelled', 'closed') THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN LOWER(COALESCE(status, '')) IN ('done', 'completed') THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN due_date IS NOT NULL AND LOWER(COALESCE(status, '')) NOT IN ('done', 'completed', 'cancelled', 'closed') AND due_date < ? THEN 1 ELSE 0 END) as overdue
      FROM tasks
      WHERE deleted_at IS NULL AND validated = 1 AND dossier_id = ?
    `).get(now, entityId);

    const completionRate = taskStats.total > 0
      ? Math.round((taskStats.completed / taskStats.total) * 100)
      : 0;

    state = {
      status: dossier.status || 'unknown',
      health: computeHealth(priorityResult.signals),
      metrics: {
        totalTasks: taskStats.total,
        activeTasks: taskStats.active,
        completedTasks: taskStats.completed,
        overdueTasks: taskStats.overdue,
        completionRate,
      },
    };
  } else if (entityType === 'client') {
    const client = db.prepare(
      'SELECT * FROM clients WHERE id = ? AND deleted_at IS NULL'
    ).get(entityId);

    if (!client) {
      throw new Error(`Client ${entityId} not found`);
    }

    const dossierStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status != 'closed' THEN 1 ELSE 0 END) as active
      FROM dossiers
      WHERE client_id = ? AND deleted_at IS NULL AND validated = 1
    `).get(entityId);

    const taskStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN LOWER(COALESCE(t.status, '')) NOT IN ('done', 'completed', 'cancelled', 'closed') THEN 1 ELSE 0 END) as active
      FROM tasks t
      JOIN dossiers d ON d.id = t.dossier_id
      WHERE d.client_id = ? AND t.deleted_at IS NULL AND t.validated = 1
    `).get(entityId);

    state = {
      status: client.status || 'active',
      health: computeHealth(priorityResult.signals),
      metrics: {
        totalDossiers: dossierStats.total,
        activeDossiers: dossierStats.active,
        totalTasks: taskStats.total,
        activeTasks: taskStats.active,
      },
    };
  } else if (entityType === 'session') {
    const session = db.prepare(
      'SELECT * FROM sessions WHERE id = ? AND deleted_at IS NULL'
    ).get(entityId);

    if (!session) {
      throw new Error(`Session ${entityId} not found`);
    }

    state = {
      status: session.status || 'unknown',
      health: computeHealth(priorityResult.signals),
      metrics: {
        sessionType: session.session_type,
        scheduledAt: session.scheduled_at,
        location: session.location || null,
      },
    };
  }

  const summary = buildSummary(entityType, state, priorityResult.signals);

  return {
    entityType,
    entityId,
    state,
    signals: priorityResult.signals,
    summary,
    analyzedAt: now,
  };
}

module.exports = {
  name: 'analyzeEntityState',
  category: TOOL_CATEGORIES.PLAN,
  description: 'Comprehensive entity state analysis with health assessment',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v2', 'v3'],
  handler,
  plannerHint: {
    requiredContext: ['entityType', 'entityId'],
    outputSummaryFields: ['state', 'signals', 'summary'],
  },
};
