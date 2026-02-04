'use strict';

/**
 * READ TOOL: getClientDossierSummary
 *
 * Lightweight dossier summary counts for a single client.
 * Read-only, no side effects, safe for all agent versions.
 */

const db = require('../../../db/connection');
const { TOOL_CATEGORIES } = require('../tool.registry');

const inputSchema = {
  type: 'object',
  properties: {
    clientId: {
      type: 'integer',
      minimum: 1,
      description: 'Client ID to summarize dossiers for',
    },
  },
  required: ['clientId'],
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    clientId: { type: 'integer' },
    total: { type: 'integer' },
    active: { type: 'integer' },
    blocked: { type: 'integer' },
    priorities: {
      type: 'object',
      additionalProperties: false,
      properties: {
        urgent: { type: 'integer' },
        high: { type: 'integer' },
        medium: { type: 'integer' },
        low: { type: 'integer' },
      },
      required: ['urgent', 'high', 'medium', 'low'],
    },
  },
  required: ['clientId', 'total', 'active', 'blocked', 'priorities'],
  additionalProperties: false,
};

async function handler({ clientId }) {
  const totalRow = db
    .prepare(
      `SELECT COUNT(*) as count
       FROM dossiers
       WHERE client_id = ? AND deleted_at IS NULL`,
    )
    .get(clientId);

  const activeRow = db
    .prepare(
      `SELECT COUNT(*) as count
       FROM dossiers
       WHERE client_id = ?
         AND deleted_at IS NULL
         AND LOWER(COALESCE(status, '')) NOT IN ('closed', 'archived')`,
    )
    .get(clientId);

  const blockedRow = db
    .prepare(
      `SELECT COUNT(*) as count
       FROM dossiers
       WHERE client_id = ?
         AND deleted_at IS NULL
         AND LOWER(COALESCE(status, '')) = 'blocked'`,
    )
    .get(clientId);

  const priorityRows = db
    .prepare(
      `SELECT LOWER(priority) as priority, COUNT(*) as count
       FROM dossiers
       WHERE client_id = ? AND deleted_at IS NULL
       GROUP BY LOWER(priority)`,
    )
    .all(clientId);

  const priorities = { urgent: 0, high: 0, medium: 0, low: 0 };
  priorityRows.forEach((row) => {
    const key = String(row.priority || '').toLowerCase();
    if (Object.prototype.hasOwnProperty.call(priorities, key)) {
      priorities[key] = row.count || 0;
    }
  });

  return {
    clientId,
    total: totalRow?.count || 0,
    active: activeRow?.count || 0,
    blocked: blockedRow?.count || 0,
    priorities,
  };
}

module.exports = {
  name: 'getClientDossierSummary',
  category: TOOL_CATEGORIES.READ,
  description: 'Get dossier summary counts for a client',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
