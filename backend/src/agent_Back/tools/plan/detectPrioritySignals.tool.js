'use strict';

/**
 * PLAN TOOL: detectPrioritySignals
 *
 * Detects urgency and priority signals for an entity.
 * Deterministic signal detection (no LLM).
 *
 * Signals detected:
 * - deadline_proximity: upcoming deadlines within threshold
 * - overdue_tasks: tasks past due date
 * - workload_pressure: high number of active tasks
 * - missing_assignments: unassigned tasks
 * - blocking_signals: blocked tasks preventing progress
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
    signals: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          message: { type: 'string' },
          dataPoints: { type: 'object' },
        },
        required: ['type', 'severity', 'message', 'dataPoints'],
      },
    },
    analyzedAt: { type: 'string' },
  },
  required: ['entityType', 'entityId', 'signals', 'analyzedAt'],
  additionalProperties: false,
};

async function handler({ entityType, entityId }) {
  const now = new Date().toISOString();
  const signals = [];

  if (entityType === 'dossier') {
    // Get dossier data
    const dossier = db.prepare(
      'SELECT * FROM dossiers WHERE id = ? AND deleted_at IS NULL AND validated = 1'
    ).get(entityId);

    if (!dossier) {
      throw new Error(`Dossier ${entityId} not found`);
    }

    // Get task statistics
    const taskStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN LOWER(COALESCE(status, '')) NOT IN ('done', 'completed', 'cancelled', 'closed') THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN due_date IS NOT NULL AND LOWER(COALESCE(status, '')) NOT IN ('done', 'completed', 'cancelled', 'closed') AND due_date < ? THEN 1 ELSE 0 END) as overdue,
        SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) as blocked,
        SUM(CASE WHEN LOWER(COALESCE(status, '')) NOT IN ('done', 'completed', 'cancelled', 'closed') AND (assigned_to IS NULL OR assigned_to = '') THEN 1 ELSE 0 END) as unassigned
      FROM tasks
      WHERE deleted_at IS NULL AND validated = 1 AND dossier_id = ?
    `).get(now, entityId);

    // Signal: Overdue tasks
    if (taskStats.overdue > 0) {
      const severity = taskStats.overdue >= 5 ? 'critical' : taskStats.overdue >= 3 ? 'high' : 'medium';
      signals.push({
        type: 'overdue_tasks',
        severity,
        message: `${taskStats.overdue} task${taskStats.overdue === 1 ? '' : 's'} overdue`,
        dataPoints: {
          count: taskStats.overdue,
          total: taskStats.total,
        },
      });
    }

    // Signal: Workload pressure
    if (taskStats.active >= 10) {
      const severity = taskStats.active >= 20 ? 'high' : 'medium';
      signals.push({
        type: 'workload_pressure',
        severity,
        message: `${taskStats.active} active tasks`,
        dataPoints: {
          activeCount: taskStats.active,
          total: taskStats.total,
        },
      });
    }

    // Signal: Blocking tasks
    if (taskStats.blocked > 0) {
      const severity = taskStats.blocked >= 3 ? 'high' : 'medium';
      signals.push({
        type: 'blocking_signals',
        severity,
        message: `${taskStats.blocked} blocked task${taskStats.blocked === 1 ? '' : 's'}`,
        dataPoints: {
          blockedCount: taskStats.blocked,
          activeCount: taskStats.active,
        },
      });
    }

    // Signal: Missing assignments
    if (taskStats.unassigned >= 5) {
      const severity = taskStats.unassigned >= 10 ? 'high' : 'medium';
      signals.push({
        type: 'missing_assignments',
        severity,
        message: `${taskStats.unassigned} unassigned task${taskStats.unassigned === 1 ? '' : 's'}`,
        dataPoints: {
          unassignedCount: taskStats.unassigned,
          activeCount: taskStats.active,
        },
      });
    }

    // Signal: Deadline proximity (dossier-level deadline)
    if (dossier.next_deadline) {
      const deadlineDate = new Date(dossier.next_deadline);
      const nowDate = new Date();
      const daysUntil = Math.ceil((deadlineDate - nowDate) / (1000 * 60 * 60 * 24));

      if (daysUntil >= 0 && daysUntil <= 7) {
        const severity = daysUntil <= 2 ? 'critical' : daysUntil <= 5 ? 'high' : 'medium';
        signals.push({
          type: 'deadline_proximity',
          severity,
          message: `Deadline in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`,
          dataPoints: {
            daysUntil,
            deadline: dossier.next_deadline,
          },
        });
      }
    }

    // Check for upcoming task deadlines (next 7 days)
    const upcomingDeadlines = db.prepare(`
      SELECT COUNT(*) as count
      FROM tasks
      WHERE dossier_id = ?
        AND deleted_at IS NULL
        AND validated = 1
        AND LOWER(COALESCE(status, '')) NOT IN ('done', 'completed', 'cancelled', 'closed')
        AND due_date IS NOT NULL
        AND due_date >= ?
        AND due_date <= datetime(?, '+7 days')
    `).get(entityId, now, now);

    if (upcomingDeadlines.count >= 3) {
      signals.push({
        type: 'deadline_proximity',
        severity: 'medium',
        message: `${upcomingDeadlines.count} task${upcomingDeadlines.count === 1 ? '' : 's'} due within 7 days`,
        dataPoints: {
          count: upcomingDeadlines.count,
          timeframe: '7_days',
        },
      });
    }
  } else if (entityType === 'client') {
    // Get client data
    const client = db.prepare(
      'SELECT * FROM clients WHERE id = ? AND deleted_at IS NULL'
    ).get(entityId);

    if (!client) {
      throw new Error(`Client ${entityId} not found`);
    }

    // Get active dossiers for client
    const dossierStats = db.prepare(`
      SELECT COUNT(*) as count
      FROM dossiers
      WHERE client_id = ? AND deleted_at IS NULL AND validated = 1 AND status != 'closed'
    `).get(entityId);

    // Get all tasks across client's dossiers
    const taskStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN LOWER(COALESCE(t.status, '')) NOT IN ('done', 'completed', 'cancelled', 'closed') THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN t.due_date IS NOT NULL AND LOWER(COALESCE(t.status, '')) NOT IN ('done', 'completed', 'cancelled', 'closed') AND t.due_date < ? THEN 1 ELSE 0 END) as overdue
      FROM tasks t
      JOIN dossiers d ON d.id = t.dossier_id
      WHERE d.client_id = ? AND t.deleted_at IS NULL AND t.validated = 1
    `).get(now, entityId);

    // Signal: Overdue tasks across client dossiers
    if (taskStats.overdue > 0) {
      const severity = taskStats.overdue >= 10 ? 'critical' : taskStats.overdue >= 5 ? 'high' : 'medium';
      signals.push({
        type: 'overdue_tasks',
        severity,
        message: `${taskStats.overdue} overdue task${taskStats.overdue === 1 ? '' : 's'} across ${dossierStats.count} dossier${dossierStats.count === 1 ? '' : 's'}`,
        dataPoints: {
          overdueCount: taskStats.overdue,
          dossierCount: dossierStats.count,
        },
      });
    }

    // Signal: High workload for client
    if (taskStats.active >= 20) {
      signals.push({
        type: 'workload_pressure',
        severity: 'high',
        message: `${taskStats.active} active tasks across client dossiers`,
        dataPoints: {
          activeCount: taskStats.active,
          dossierCount: dossierStats.count,
        },
      });
    }
  } else if (entityType === 'session') {
    // Get session data
    const session = db.prepare(
      'SELECT * FROM sessions WHERE id = ? AND deleted_at IS NULL'
    ).get(entityId);

    if (!session) {
      throw new Error(`Session ${entityId} not found`);
    }

    // Check if session is upcoming
    if (session.scheduled_at && session.status === 'scheduled') {
      const sessionDate = new Date(session.scheduled_at);
      const nowDate = new Date();
      const hoursUntil = Math.ceil((sessionDate - nowDate) / (1000 * 60 * 60));

      if (hoursUntil >= 0 && hoursUntil <= 48) {
        const severity = hoursUntil <= 4 ? 'critical' : hoursUntil <= 24 ? 'high' : 'medium';
        signals.push({
          type: 'deadline_proximity',
          severity,
          message: `Session in ${hoursUntil} hour${hoursUntil === 1 ? '' : 's'}`,
          dataPoints: {
            hoursUntil,
            scheduledAt: session.scheduled_at,
          },
        });
      }
    }
  }

  return {
    entityType,
    entityId,
    signals,
    analyzedAt: now,
  };
}

module.exports = {
  name: 'detectPrioritySignals',
  category: TOOL_CATEGORIES.PLAN,
  description: 'Detect urgency and priority signals for an entity (deterministic)',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v2', 'v3'],
  handler,
  plannerHint: {
    requiredContext: ['entityType', 'entityId'],
    outputSummaryFields: ['signals'],
  },
};
