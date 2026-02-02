'use strict';

/**
 * READ TOOL: listNotifications
 *
 * List notifications with optional filters.
 * Read-only, no side effects, safe for all agent versions.
 */

const notificationsService = require('../../../services/notifications.service');
const { TOOL_CATEGORIES } = require('../tool.registry');

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
  let notifications = notificationsService.list();

  if (entityType) {
    const normalized = String(entityType).toLowerCase();
    notifications = notifications.filter(notification => String(notification.entity_type || '').toLowerCase() === normalized);
  }

  if (entityId !== null) {
    notifications = notifications.filter(notification => notification.entity_id === entityId);
  }

  if (status) {
    const normalized = String(status).toLowerCase();
    notifications = notifications.filter(notification => String(notification.status || '').toLowerCase() === normalized);
  }

  if (severity) {
    const normalized = String(severity).toLowerCase();
    notifications = notifications.filter(notification => String(notification.severity || '').toLowerCase() === normalized);
  }

  if (query) {
    const q = String(query).toLowerCase();
    notifications = notifications.filter(notification => {
      const haystack = [notification.type, notification.sub_type, notification.template_key]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }

  notifications = notifications.sort((a, b) => {
    const aDate = new Date(a.created_at || a.updated_at || 0).getTime();
    const bDate = new Date(b.created_at || b.updated_at || 0).getTime();
    return bDate - aDate;
  });

  const limited = notifications.slice(0, limit);

  return {
    notifications: limited,
    count: limited.length,
  };
}

module.exports = {
  name: 'listNotifications',
  category: TOOL_CATEGORIES.READ,
  description: 'List notifications with optional filters',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
