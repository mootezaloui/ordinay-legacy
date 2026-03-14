'use strict';

/**
 * READ TOOL: getMission
 *
 * Retrieve a single mission by ID.
 * Read-only, no side effects, safe for all agent versions.
 */

const missionsService = require('../../../services/missions.service');
const TOOL_CATEGORIES = { READ: 'READ' };

const inputSchema = {
  type: 'object',
  properties: {
    missionId: {
      type: 'integer',
      minimum: 1,
      description: 'The unique ID of the mission',
    },
  },
  required: ['missionId'],
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    mission: {
      type: ['object', 'null'],
      description: 'Mission record or null if not found',
    },
  },
  required: ['mission'],
  additionalProperties: false,
};

async function handler({ missionId }) {
  const mission = missionsService.get(missionId);
  return { mission: mission || null };
}

module.exports = {
  name: 'getMission',
  category: TOOL_CATEGORIES.READ,
  description: 'Retrieve a single mission by ID',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
