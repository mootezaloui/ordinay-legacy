'use strict';

/**
 * PLAN TOOL: buildActionPlan
 *
 * Builds a structured action plan based on entity state and signals.
 * Deterministic rule-based planning.
 * Returns prioritized, actionable steps.
 */

const db = require('../../../db/connection');
const { TOOL_CATEGORIES } = require('../tool.registry');

const inputSchema = {
  type: 'object',
  properties: {
    entityType: {
      type: 'string',
      enum: ['dossier', 'client', 'session'],
      description: 'Type of entity to plan for',
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
    plan: {
      type: 'object',
      properties: {
        priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
        actions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
              action: { type: 'string' },
              reason: { type: 'string' },
              targetType: { type: 'string' },
              targetId: { type: ['integer', 'null'] },
            },
            required: ['priority', 'action', 'reason'],
          },
        },
        summary: { type: 'string' },
      },
      required: ['priority', 'actions', 'summary'],
    },
    generatedAt: { type: 'string' },
  },
  required: ['entityType', 'entityId', 'plan', 'generatedAt'],
  additionalProperties: false,
};

function prioritizeActions(actions) {
  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  return actions.sort((a, b) => order[a.priority] - order[b.priority]);
}

function computeOverallPriority(actions) {
  if (actions.length === 0) return 'low';
  if (actions.some(a => a.priority === 'critical')) return 'critical';
  if (actions.some(a => a.priority === 'high')) return 'high';
  if (actions.some(a => a.priority === 'medium')) return 'medium';
  return 'low';
}

async function handler({ entityType, entityId }) {
  const now = new Date().toISOString();

  // Use analyzeEntityState to get signals
  const analyzeEntityState = require('./analyzeEntityState.tool');
  const stateResult = await analyzeEntityState.handler({ entityType, entityId });

  const actions = [];

  // Generate actions based on signals
  for (const signal of stateResult.signals) {
    if (signal.type === 'overdue_tasks') {
      actions.push({
        priority: signal.severity,
        action: 'Review and reschedule overdue tasks',
        reason: signal.message,
        targetType: 'task',
        targetId: null,
      });
    } else if (signal.type === 'deadline_proximity') {
      actions.push({
        priority: signal.severity,
        action: 'Prepare for upcoming deadline',
        reason: signal.message,
        targetType: entityType,
        targetId: entityId,
      });
    } else if (signal.type === 'workload_pressure') {
      actions.push({
        priority: signal.severity,
        action: 'Assess workload distribution and delegate tasks',
        reason: signal.message,
        targetType: entityType,
        targetId: entityId,
      });
    } else if (signal.type === 'missing_assignments') {
      actions.push({
        priority: signal.severity,
        action: 'Assign unassigned tasks to team members',
        reason: signal.message,
        targetType: 'task',
        targetId: null,
      });
    } else if (signal.type === 'blocking_signals') {
      actions.push({
        priority: signal.severity,
        action: 'Resolve blocked tasks to unblock progress',
        reason: signal.message,
        targetType: 'task',
        targetId: null,
      });
    }
  }

  // Add health-based recommendations
  if (stateResult.state.health === 'critical') {
    actions.push({
      priority: 'critical',
      action: 'Urgent review required',
      reason: `${entityType} health is critical`,
      targetType: entityType,
      targetId: entityId,
    });
  }

  // If dossier, check for stagnation (no recent updates)
  if (entityType === 'dossier') {
    const dossier = db.prepare(
      'SELECT updated_at FROM dossiers WHERE id = ? AND deleted_at IS NULL AND validated = 1'
    ).get(entityId);

    if (dossier && dossier.updated_at) {
      const updatedDate = new Date(dossier.updated_at);
      const nowDate = new Date();
      const daysSinceUpdate = Math.ceil((nowDate - updatedDate) / (1000 * 60 * 60 * 24));

      if (daysSinceUpdate > 30) {
        actions.push({
          priority: 'medium',
          action: 'Review dossier progress',
          reason: `No updates in ${daysSinceUpdate} days`,
          targetType: 'dossier',
          targetId: entityId,
        });
      }
    }
  }

  // If no actions, add a low-priority general review
  if (actions.length === 0) {
    actions.push({
      priority: 'low',
      action: 'Continue monitoring',
      reason: 'No urgent issues detected',
      targetType: entityType,
      targetId: entityId,
    });
  }

  const prioritizedActions = prioritizeActions(actions);
  const overallPriority = computeOverallPriority(prioritizedActions);

  const summary = prioritizedActions.length === 1 && prioritizedActions[0].priority === 'low'
    ? 'No immediate actions required. Continue normal operations.'
    : `${prioritizedActions.length} action${prioritizedActions.length === 1 ? '' : 's'} recommended (${overallPriority} priority).`;

  return {
    entityType,
    entityId,
    plan: {
      priority: overallPriority,
      actions: prioritizedActions,
      summary,
    },
    generatedAt: now,
  };
}

module.exports = {
  name: 'buildActionPlan',
  category: TOOL_CATEGORIES.PLAN,
  description: 'Build a structured action plan based on entity state and signals',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v2', 'v3'],
  handler,
  plannerHint: {
    requiredContext: ['entityType', 'entityId'],
    outputSummaryFields: ['plan'],
  },
};
