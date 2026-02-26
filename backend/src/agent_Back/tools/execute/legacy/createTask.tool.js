'use strict';

/**
 * DEPRECATED: This tool is replaced by the universal CREATE_ENTITY operation.
 * Kept for backward compatibility. New code should use CREATE_ENTITY with entityType='task'.
 *
 * Example universal operation:
 * actionType: 'CREATE_ENTITY'
 * params: { entityType: 'task', payload: { title, dossierId, priority, ... } }
 */

/**
 * EXECUTE TOOL: createTask (V3 IMPLEMENTATION - DEPRECATED)
 *
 * CRITICAL: This is an execution tool.
 * - BLOCKED in v1 and v2
 * - Only available in v3 with explicit confirmation
 * - Requires two-phase commit (PROPOSE → CONFIRM → EXECUTE)
 *
 * This tool MUST NOT be executed in v1 or v2.
 */

const { TOOL_CATEGORIES } = require('../../tool.registry');
const tasksService = require('../../../../services/tasks.service');

const inputSchema = {
  type: 'object',
  properties: {
    dossierId: {
      type: ['integer', 'null'],
      minimum: 1,
      description: 'Dossier ID to attach task to',
    },
    lawsuitId: {
      type: ['integer', 'null'],
      minimum: 1,
      description: 'Lawsuit ID to attach task to',
    },
    title: {
      type: 'string',
      minLength: 1,
      maxLength: 255,
      description: 'Task title',
    },
    description: {
      type: ['string', 'null'],
      description: 'Task description',
    },
    priority: {
      type: 'string',
      enum: ['urgent', 'high', 'medium', 'low'],
      default: 'medium',
      description: 'Task priority',
    },
    dueDate: {
      type: ['string', 'null'],
      format: 'date-time',
      description: 'Due date in ISO 8601 format',
    },
  },
  required: ['title'],
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'integer',
      description: 'Created task ID',
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
    created_at: {
      type: 'string',
      description: 'Creation timestamp',
    },
  },
  required: ['id', 'title'],
  additionalProperties: true,
};

/**
 * Create a new task
 *
 * This function is ONLY callable in v3 after explicit user confirmation.
 * The firewall will block execution in v1/v2.
 *
 * @param {Object} params - Task parameters
 * @param {Object} executionContext - { userId, sessionId }
 * @returns {Promise<Object>} Created task
 */
async function handler(params, executionContext = {}) {
  // Map tool params to service params
  const payload = {
    dossier_id: params.dossierId || null,
    lawsuit_id: params.lawsuitId || null,
    title: params.title,
    description: params.description || null,
    priority: params.priority || 'medium',
    due_date: params.dueDate || null,
  };

  // Create task via service
  const task = tasksService.create(payload);

  // Return subset of fields for ExecutionResult
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    created_at: task.created_at,
    dossier_id: task.dossier_id,
    lawsuit_id: task.lawsuit_id,
  };
}

module.exports = {
  name: 'createTask',
  category: TOOL_CATEGORIES.EXECUTE,
  description: 'Create a new task under a dossier or lawsuit',
  inputSchema,
  outputSchema,
  reversibility: true, // Tasks can be deleted
  sideEffects: true, // Creates database record
  allowedAgentVersions: ['v3'], // ONLY v3
  confirmationRequired: true, // Requires explicit confirmation
  handler,
};

