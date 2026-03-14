'use strict';

/**
 * READ TOOL: getTask
 *
 * Retrieve a single task by ID.
 * Read-only, no side effects, safe for all agent versions.
 */

const tasksService = require('../../../services/tasks.service');
const TOOL_CATEGORIES = { READ: 'READ' };

const inputSchema = {
  type: 'object',
  properties: {
    taskId: {
      type: 'integer',
      minimum: 1,
      description: 'The unique ID of the task',
    },
  },
  required: ['taskId'],
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    task: {
      type: ['object', 'null'],
      description: 'Task record or null if not found',
    },
  },
  required: ['task'],
  additionalProperties: false,
};

async function handler({ taskId }) {
  const task = tasksService.get(taskId);
  return { task: task || null };
}

module.exports = {
  name: 'getTask',
  category: TOOL_CATEGORIES.READ,
  description: 'Retrieve a single task by ID',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
