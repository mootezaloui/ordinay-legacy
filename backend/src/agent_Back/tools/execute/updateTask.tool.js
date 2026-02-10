'use strict';

/**
 * DEPRECATED: This tool is replaced by the universal UPDATE_ENTITY operation.
 * Kept for backward compatibility. New code should use UPDATE_ENTITY with entityType='task'.
 *
 * Example universal operation:
 * actionType: 'UPDATE_ENTITY'
 * params: { entityType: 'task', entityId: 45, changes: { status: { from: 'todo', to: 'done' } } }
 */

/**
 * EXECUTE TOOL: updateTask (V3 IMPLEMENTATION - DEPRECATED)
 *
 * CRITICAL: This is an execution tool.
 * - BLOCKED in v1 and v2
 * - Only available in v3 with explicit confirmation
 * - Requires two-phase commit (PROPOSE → CONFIRM → EXECUTE)
 * - Field-scoped: only status, dueDate, priority, assignee can be updated
 *
 * This tool MUST NOT be executed in v1 or v2.
 */

const { TOOL_CATEGORIES } = require('../tool.registry');
const tasksService = require('../../../services/tasks.service');

const inputSchema = {
  type: 'object',
  properties: {
    taskId: {
      type: 'integer',
      minimum: 1,
      description: 'Task ID to update',
    },
    status: {
      type: 'string',
      enum: ['todo', 'in_progress', 'blocked', 'done', 'cancelled'],
      description: 'New task status',
    },
    priority: {
      type: 'string',
      enum: ['urgent', 'high', 'medium', 'low'],
      description: 'New task priority',
    },
    dueDate: {
      type: ['string', 'null'],
      format: 'date-time',
      description: 'New due date in ISO 8601 format',
    },
    assignee: {
      type: ['string', 'null'],
      description: 'New assignee (user ID or name)',
    },
  },
  required: ['taskId'],
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'integer',
      description: 'Updated task ID',
    },
    title: {
      type: 'string',
      description: 'Task title',
    },
    status: {
      type: 'string',
      description: 'Task status',
    },
    priority: {
      type: 'string',
      description: 'Task priority',
    },
    due_date: {
      type: ['string', 'null'],
      description: 'Due date',
    },
    assigned_to: {
      type: ['string', 'null'],
      description: 'Assignee',
    },
    updated_at: {
      type: 'string',
      description: 'Update timestamp',
    },
  },
  required: ['id', 'title'],
  additionalProperties: true,
};

/**
 * Update a task (field-scoped)
 *
 * This function is ONLY callable in v3 after explicit user confirmation.
 * The firewall will block execution in v1/v2.
 *
 * Only specific fields can be updated: status, priority, dueDate, assignee.
 * Destructive updates (title, description) are not allowed via this tool.
 *
 * @param {Object} params - Task update parameters
 * @param {Object} executionContext - { userId, sessionId }
 * @returns {Promise<Object>} Updated task
 */
async function handler(params, executionContext = {}) {
  const { taskId, status, priority, dueDate, assignee } = params;

  // Build update payload (only allowed fields)
  const payload = {};
  if (status !== undefined) payload.status = status;
  if (priority !== undefined) payload.priority = priority;
  if (dueDate !== undefined) payload.due_date = dueDate;
  if (assignee !== undefined) payload.assigned_to = assignee;

  // Ensure at least one field is being updated
  if (Object.keys(payload).length === 0) {
    throw new Error('At least one field must be provided for update');
  }

  // Update task via service
  const task = tasksService.update(taskId, payload);

  if (!task) {
    throw new Error(`Task ${taskId} not found or update failed`);
  }

  // Return subset of fields for ExecutionResult
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    due_date: task.due_date,
    assigned_to: task.assigned_to,
    updated_at: task.updated_at,
    dossier_id: task.dossier_id,
    lawsuit_id: task.lawsuit_id,
  };
}

module.exports = {
  name: 'updateTask',
  category: TOOL_CATEGORIES.EXECUTE,
  description: 'Update task status, priority, due date, or assignee',
  inputSchema,
  outputSchema,
  reversibility: true, // Can be undone by setting previous values
  sideEffects: true, // Modifies database record
  allowedAgentVersions: ['v3'], // ONLY v3
  confirmationRequired: true, // Requires explicit confirmation
  handler,
};
