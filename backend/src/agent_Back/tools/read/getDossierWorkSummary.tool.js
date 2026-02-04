'use strict';

/**
 * READ TOOL: getDossierWorkSummary
 *
 * Lightweight task/session summary counts for a dossier.
 * Read-only, no side effects, safe for all agent versions.
 */

const db = require('../../../db/connection');
const { TOOL_CATEGORIES } = require('../tool.registry');

const inputSchema = {
  type: 'object',
  properties: {
    dossierId: {
      type: 'integer',
      minimum: 1,
      description: 'Dossier ID to summarize work for',
    },
  },
  required: ['dossierId'],
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    dossierId: { type: 'integer' },
    tasks: {
      type: 'object',
      additionalProperties: false,
      properties: {
        total: { type: 'integer' },
        active: { type: 'integer' },
        overdue: { type: 'integer' },
      },
      required: ['total', 'active', 'overdue'],
    },
    sessions: {
      type: 'object',
      additionalProperties: false,
      properties: {
        total: { type: 'integer' },
      },
      required: ['total'],
    },
  },
  required: ['dossierId', 'tasks', 'sessions'],
  additionalProperties: false,
};

async function handler({ dossierId }) {
  const now = new Date().toISOString();

  const taskStats = db
    .prepare(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN LOWER(COALESCE(status, '')) NOT IN ('done', 'completed', 'cancelled', 'closed') THEN 1 ELSE 0 END) as active,
         SUM(
           CASE
             WHEN due_date IS NOT NULL
              AND LOWER(COALESCE(status, '')) NOT IN ('done', 'completed', 'cancelled', 'closed')
              AND due_date < ?
             THEN 1 ELSE 0
           END
         ) as overdue
       FROM tasks
       WHERE deleted_at IS NULL
         AND (
           dossier_id = ?
           OR lawsuit_id IN (
             SELECT id FROM lawsuits WHERE dossier_id = ? AND deleted_at IS NULL
           )
         )`,
    )
    .get(now, dossierId, dossierId);

  const sessionStats = db
    .prepare(
      `SELECT COUNT(*) as total
       FROM sessions
       WHERE deleted_at IS NULL
         AND (
           dossier_id = ?
           OR lawsuit_id IN (
             SELECT id FROM lawsuits WHERE dossier_id = ? AND deleted_at IS NULL
           )
         )`,
    )
    .get(dossierId, dossierId);

  return {
    dossierId,
    tasks: {
      total: taskStats?.total || 0,
      active: taskStats?.active || 0,
      overdue: taskStats?.overdue || 0,
    },
    sessions: {
      total: sessionStats?.total || 0,
    },
  };
}

module.exports = {
  name: 'getDossierWorkSummary',
  category: TOOL_CATEGORIES.READ,
  description: 'Get task/session summary counts for a dossier',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
