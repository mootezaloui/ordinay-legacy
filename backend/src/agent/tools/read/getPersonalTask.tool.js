'use strict';

/**
 * READ TOOL: getPersonalTask
 *
 * Retrieve a single personal task by ID.
 * Read-only, no side effects, safe for all agent versions.
 */

const personalTasksService = require('../../../services/personalTasks.service');
const TOOL_CATEGORIES = { READ: 'READ' };

const inputSchema = {
  type: 'object',
  properties: {
    personalTaskId: {
      type: 'integer',
      minimum: 1,
      description: 'The unique ID of the personal task',
    },
  },
  required: ['personalTaskId'],
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    personalTask: {
      type: ['object', 'null'],
      description: 'Personal task record or null if not found',
    },
  },
  required: ['personalTask'],
  additionalProperties: false,
};

async function handler({ personalTaskId }) {
  const personalTask = personalTasksService.get(personalTaskId);
  return { personalTask: personalTask || null };
}

module.exports = {
  name: 'getPersonalTask',
  category: TOOL_CATEGORIES.READ,
  description: 'Retrieve a single personal task by ID',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
