'use strict';

/**
 * RESEARCH TOOL: compileDossierResearch
 *
 * Compile comprehensive research data for a dossier.
 * Combines: dossier data, client info, task summary, session summary, risk indicators.
 * Read-only, no side effects, safe for v2/v3.
 */

const db = require('../../../db/connection');
const { TOOL_CATEGORIES } = require('../tool.registry');

const inputSchema = {
  type: 'object',
  properties: {
    dossierId: {
      type: 'integer',
      minimum: 1,
      description: 'The unique ID of the dossier to research',
    },
  },
  required: ['dossierId'],
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    dossierId: { type: 'integer' },
    dossier: { type: 'object' },
    client: { type: ['object', 'null'] },
    taskSummary: { type: 'object' },
    sessionSummary: { type: 'object' },
    riskIndicators: { type: 'object' },
    compiledAt: { type: 'string' },
  },
  required: ['dossierId', 'dossier', 'client', 'taskSummary', 'sessionSummary', 'riskIndicators', 'compiledAt'],
  additionalProperties: false,
};

async function handler({ dossierId }) {
  const now = new Date().toISOString();

  const dossier = db.prepare(
    'SELECT * FROM dossiers WHERE id = ? AND deleted_at IS NULL AND validated = 1'
  ).get(dossierId);

  if (!dossier) {
    throw new Error(`Dossier ${dossierId} not found`);
  }

  const client = dossier.client_id
    ? db.prepare(
        'SELECT id, name, email, phone, status FROM clients WHERE id = ? AND deleted_at IS NULL'
      ).get(dossier.client_id)
    : null;

  const taskStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN LOWER(COALESCE(status, '')) NOT IN ('done', 'completed', 'cancelled', 'closed') THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN due_date IS NOT NULL AND LOWER(COALESCE(status, '')) NOT IN ('done', 'completed', 'cancelled', 'closed') AND due_date < ? THEN 1 ELSE 0 END) as overdue
    FROM tasks
    WHERE deleted_at IS NULL AND validated = 1 AND dossier_id = ?
  `).get(now, dossierId);

  const sessionStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status IN ('scheduled', 'confirmed') AND scheduled_at >= ? THEN 1 ELSE 0 END) as upcoming
    FROM sessions
    WHERE deleted_at IS NULL AND validated = 1 AND dossier_id = ?
  `).get(now, dossierId);

  const blockedCount = db.prepare(
    `SELECT COUNT(*) as count FROM tasks WHERE dossier_id = ? AND deleted_at IS NULL AND validated = 1 AND status = 'blocked'`
  ).get(dossierId);

  return {
    dossierId,
    dossier,
    client: client || null,
    taskSummary: {
      total: taskStats?.total || 0,
      active: taskStats?.active || 0,
      overdue: taskStats?.overdue || 0,
    },
    sessionSummary: {
      total: sessionStats?.total || 0,
      upcoming: sessionStats?.upcoming || 0,
    },
    riskIndicators: {
      hasOverdueTasks: (taskStats?.overdue || 0) > 0,
      blockedTaskCount: blockedCount?.count || 0,
      daysUntilNextDeadline: dossier.next_deadline
        ? Math.ceil((new Date(dossier.next_deadline) - new Date()) / (1000 * 60 * 60 * 24))
        : null,
    },
    compiledAt: now,
  };
}

module.exports = {
  name: 'compileDossierResearch',
  category: TOOL_CATEGORIES.RESEARCH,
  description: 'Compile comprehensive research data for a dossier',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v2', 'v3'],
  handler,
  plannerHint: {
    requiredContext: ['dossierId'],
    outputSummaryFields: ['taskSummary', 'riskIndicators'],
  },
};
