'use strict';

/**
 * READ TOOL: listNotifications
 *
 * List notifications with optional filters.
 * Read-only, no side effects, safe for all agent versions.
 */

const notificationsService = require('../../../services/notifications.service');
const TOOL_CATEGORIES = { READ: 'READ' };
const ALLOWED_STATUS_VALUES = new Set(['unread', 'read', 'archived', 'pending', 'open', 'closed', 'active']);

const inputSchema = {
  type: 'object',
  properties: {
    status: {
      type: ['string', 'null'],
      description: 'Filter by notification status',
    },
    severity: {
      type: ['string', 'null'],
      description: 'Filter by notification severity',
    },
    entityType: {
      type: ['string', 'null'],
      description: 'Filter by related entity type',
    },
    entityId: {
      type: ['integer', 'null'],
      minimum: 1,
      description: 'Filter by related entity ID',
    },
    query: {
      type: ['string', 'null'],
      description: 'Optional text search on type or template key',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 200,
      default: 50,
      description: 'Maximum number of notifications to return',
    },
  },
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    notifications: {
      type: 'array',
      items: { type: 'object' },
      description: 'Array of notification records',
    },
    count: {
      type: 'integer',
      description: 'Number of notifications returned',
    },
  },
  required: ['notifications', 'count'],
  additionalProperties: false,
};

async function handler({
  status = null,
  severity = null,
  entityType = null,
  entityId = null,
  query = null,
  limit = 50,
} = {}) {
  logStatusWarningIfNeeded(status);
  const limited = notificationsService.listFiltered({
    status,
    severity,
    entityType,
    entityId,
    query,
    limit,
  });

  return {
    notifications: limited,
    count: limited.length,
  };
}

function logStatusWarningIfNeeded(status) {
  if (typeof status !== 'string' || !status.trim()) {
    return;
  }

  const normalized = status.trim().toLowerCase();
  if (ALLOWED_STATUS_VALUES.has(normalized)) {
    return;
  }

  console.warn('[STATUS_WARNING]', `tool: listNotifications`, `received_status: "${status}"`);
}

module.exports = {
  name: 'listNotifications',
  category: TOOL_CATEGORIES.READ,
  description:
    'List notification records with optional filters by status, severity, entity scope, and template/type query.',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
