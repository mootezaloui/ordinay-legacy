"use strict";

/**
 * ANALYSIS TOOL: scanOperationalRisks
 *
 * Scan for operational risks in a dossier or lawsuit.
 * Uses STRICT operational risk taxonomy - no free-text categories.
 * NO legal predictions, NO probability estimates, NO outcome speculation.
 * Factual observations only.
 * Pure computation, deterministic, no side effects.
 * Safe for all agent versions.
 */

const db = require("../../../db/connection");
const { TOOL_CATEGORIES } = require("../tool.registry");
const {
  RISK_CATEGORY,
  RISK_SEVERITY,
  createRisk,
} = require("../../contracts/risk.taxonomy");

const inputSchema = {
  type: "object",
  properties: {
    entityType: {
      type: "string",
      enum: ["dossier", "lawsuit"],
      description: "Type of entity to scan",
    },
    entityId: {
      type: "integer",
      minimum: 1,
      description: "ID of the entity",
    },
  },
  required: ["entityType", "entityId"],
  additionalProperties: false,
};

// Output schema references the risk.schema.json contract
const outputSchema = {
  type: "object",
  properties: {
    type: { const: "operational_risk_analysis" },
    entityRef: { type: "object" },
    riskScore: { type: "integer", minimum: 0, maximum: 100 },
    risks: { type: "array" },
    summary: { type: "object" },
    metadata: { type: "object" },
  },
  required: ["type", "entityRef", "riskScore", "risks", "summary", "metadata"],
  additionalProperties: false,
};

async function handler({ entityType, entityId }) {
  const risks = [];
  const now = new Date().toISOString();
  let riskScore = 0;

  // Build queries based on entity type
  const taskCondition =
    entityType === "dossier" ? "dossier_id = ?" : "lawsuit_id = ?";
  const sessionCondition =
    entityType === "dossier" ? "dossier_id = ?" : "lawsuit_id = ?";

  // Get entity name for context
  const entityTable = entityType === "dossier" ? "dossiers" : "lawsuits";
  const entity = db
    .prepare(
      `SELECT id, title, reference FROM ${entityTable} WHERE id = ? AND validated = 1`
    )
    .get(entityId);

  if (!entity) {
    throw new Error(`${entityType} ${entityId} not found`);
  }

  // RISK 1: Overdue urgent tasks (DEADLINE + HIGH severity)
  const overdueUrgent = db
    .prepare(
      `
      SELECT id, title, due_date, priority
      FROM tasks
      WHERE ${taskCondition}
        AND deleted_at IS NULL
        AND validated = 1
        AND status NOT IN ('done', 'cancelled')
        AND priority = 'urgent'
        AND due_date < ?
      `
    )
    .all(entityId, now);

  if (overdueUrgent.length > 0) {
    const risk = createRisk({
      id: `${entityType}-${entityId}-deadline-urgent`,
      category: RISK_CATEGORY.DEADLINE,
      severity: RISK_SEVERITY.HIGH,
      description: `${overdueUrgent.length} urgent task(s) have passed their deadline`,
      affectedEntityRef: {
        type: entityType,
        id: entityId,
        name: entity.title || entity.reference,
      },
      affectedItems: overdueUrgent.map((t) => ({
        id: t.id,
        title: t.title,
        type: "task",
        due_date: t.due_date,
      })),
    });
    risks.push(risk);
    riskScore += 30;
  }

  // RISK 2: Upcoming sessions without preparation (SESSION_PREPARATION_GAP)
  const upcomingSessions = db
    .prepare(
      `
      SELECT id, title, session_type, scheduled_at
      FROM sessions
      WHERE ${sessionCondition}
        AND deleted_at IS NULL
        AND validated = 1
        AND status IN ('scheduled', 'pending')
        AND scheduled_at >= ?
        AND scheduled_at <= datetime(?, '+3 days')
      `
    )
    .all(entityId, now, now);

  if (upcomingSessions.length > 0) {
    const risk = createRisk({
      id: `${entityType}-${entityId}-session-prep`,
      category: RISK_CATEGORY.SESSION_PREPARATION_GAP,
      severity: RISK_SEVERITY.HIGH,
      description: `${upcomingSessions.length} session(s) scheduled within 3 days without completion of preparation tasks`,
      affectedEntityRef: {
        type: entityType,
        id: entityId,
        name: entity.title || entity.reference,
      },
      affectedItems: upcomingSessions.map((s) => ({
        id: s.id,
        title: s.title,
        type: "session",
        scheduled_at: s.scheduled_at,
      })),
    });
    risks.push(risk);
    riskScore += 20;
  }

  // RISK 3: Blocked tasks (DEPENDENCY)
  const blockedTasks = db
    .prepare(
      `
      SELECT id, title, priority
      FROM tasks
      WHERE ${taskCondition}
        AND deleted_at IS NULL
        AND validated = 1
        AND status = 'blocked'
      `
    )
    .all(entityId);

  if (blockedTasks.length >= 3) {
    const risk = createRisk({
      id: `${entityType}-${entityId}-dependency-blocked`,
      category: RISK_CATEGORY.DEPENDENCY,
      severity: RISK_SEVERITY.MEDIUM,
      description: `${blockedTasks.length} task(s) are blocked by dependencies and cannot proceed`,
      affectedEntityRef: {
        type: entityType,
        id: entityId,
        name: entity.title || entity.reference,
      },
      affectedItems: blockedTasks.map((t) => ({
        id: t.id,
        title: t.title,
        type: "task",
        priority: t.priority,
      })),
    });
    risks.push(risk);
    riskScore += 15;
  }

  // RISK 4: No activity in last 30 days (NO_RECENT_ACTIVITY)
  if (entityType === "dossier") {
    const recentActivity = db
      .prepare(
        `
        SELECT COUNT(*) as count
        FROM (
          SELECT created_at FROM tasks WHERE dossier_id = ? AND created_at >= datetime(?, '-30 days') AND validated = 1
          UNION ALL
          SELECT created_at FROM sessions WHERE dossier_id = ? AND created_at >= datetime(?, '-30 days') AND validated = 1
        )
        `
      )
      .get(entityId, now, entityId, now);

    if (recentActivity.count === 0) {
      const risk = createRisk({
        id: `${entityType}-${entityId}-no-activity`,
        category: RISK_CATEGORY.NO_RECENT_ACTIVITY,
        severity: RISK_SEVERITY.MEDIUM,
        description:
          "No tasks or sessions have been created in the last 30 days",
        affectedEntityRef: {
          type: entityType,
          id: entityId,
          name: entity.title || entity.reference,
        },
        affectedItems: [],
      });
      risks.push(risk);
      riskScore += 10;
    }
  }

  // RISK 5: Tasks with no assignee (UNASSIGNED_RESPONSIBILITY)
  const unassignedTasks = db
    .prepare(
      `
      SELECT id, title, priority, due_date
      FROM tasks
      WHERE ${taskCondition}
        AND deleted_at IS NULL
        AND validated = 1
        AND status NOT IN ('done', 'cancelled')
        AND (assigned_to IS NULL OR assigned_to = '')
      `
    )
    .all(entityId);

  if (unassignedTasks.length >= 5) {
    const risk = createRisk({
      id: `${entityType}-${entityId}-unassigned`,
      category: RISK_CATEGORY.UNASSIGNED_RESPONSIBILITY,
      severity: RISK_SEVERITY.LOW,
      description: `${unassignedTasks.length} task(s) have no assigned operator`,
      affectedEntityRef: {
        type: entityType,
        id: entityId,
        name: entity.title || entity.reference,
      },
      affectedItems: unassignedTasks.map((t) => ({
        id: t.id,
        title: t.title,
        type: "task",
      })),
    });
    risks.push(risk);
    riskScore += 5;
  }

  // Cap risk score at 100
  riskScore = Math.min(riskScore, 100);

  // Compute summary statistics
  const bySeverity = {
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
  };

  const byCategory = {};

  risks.forEach((risk) => {
    bySeverity[risk.severity]++;
    byCategory[risk.category] = (byCategory[risk.category] || 0) + 1;
  });

  // Return in strict contract format
  return {
    type: "operational_risk_analysis",
    entityRef: {
      type: entityType,
      id: entityId,
    },
    riskScore,
    risks,
    summary: {
      total: risks.length,
      bySeverity,
      byCategory,
    },
    metadata: {
      source: "rule-based",
      status: "analysis_complete",
      requiresValidation: true,
      analyzedAt: now,
    },
  };
}

module.exports = {
  name: "scanOperationalRisks",
  category: TOOL_CATEGORIES.ANALYSIS,
  description:
    "Scan for operational risks using strict taxonomy (NO legal predictions)",
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ["v1", "v2", "v3"],
  handler,
};

