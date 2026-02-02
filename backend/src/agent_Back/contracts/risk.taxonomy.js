'use strict';

/**
 * Operational Risk Taxonomy
 *
 * CRITICAL: This file defines what "risk" means in Organia.
 *
 * All risks MUST use these categories. No free-text categories allowed.
 * This is operational risk ONLY — no legal predictions, no probability estimates.
 *
 * If a category is missing, it MUST be added here explicitly.
 * No runtime category creation is permitted.
 */

/**
 * Operational Risk Categories (ENUM)
 *
 * These are the ONLY permitted risk categories.
 * Any tool emitting a different category MUST throw an error.
 */
const RISK_CATEGORY = Object.freeze({
  /**
   * DEADLINE
   * A deadline has passed or will pass soon without completion.
   * Factual observation only, no speculation about consequences.
   */
  DEADLINE: 'DEADLINE',

  /**
   * DEPENDENCY
   * A task, session, or action is blocked by another incomplete item.
   * Identifies dependency relationships that prevent progress.
   */
  DEPENDENCY: 'DEPENDENCY',

  /**
   * STATE_INCONSISTENCY
   * Entity state does not match expected state or business rules.
   * Example: Lawsuit status is "closed" but has open tasks.
   */
  STATE_INCONSISTENCY: 'STATE_INCONSISTENCY',

  /**
   * ACCOUNTING_GAP
   * Financial tracking is incomplete or inconsistent.
   * Example: Session has no associated time entry, missing expense record.
   */
  ACCOUNTING_GAP: 'ACCOUNTING_GAP',

  /**
   * MISSING_DOCUMENT
   * Required document is not present or not linked.
   * Purely structural check, no content validation.
   */
  MISSING_DOCUMENT: 'MISSING_DOCUMENT',

  /**
   * UNASSIGNED_RESPONSIBILITY
   * Task, mission, or action has no assigned operator.
   * Work cannot proceed without assignment.
   */
  UNASSIGNED_RESPONSIBILITY: 'UNASSIGNED_RESPONSIBILITY',

  /**
   * NO_RECENT_ACTIVITY
   * Entity has no recorded activity within expected timeframe.
   * Potential stagnation indicator.
   */
  NO_RECENT_ACTIVITY: 'NO_RECENT_ACTIVITY',

  /**
   * SESSION_PREPARATION_GAP
   * Session is scheduled soon but preparation tasks are incomplete.
   * Time-sensitive operational readiness check.
   */
  SESSION_PREPARATION_GAP: 'SESSION_PREPARATION_GAP',
});

/**
 * Risk Severity Levels (ENUM)
 *
 * Severity is based on operational impact ONLY.
 * NOT based on legal consequences or client impact.
 */
const RISK_SEVERITY = Object.freeze({
  /**
   * LOW
   * Minor operational inefficiency.
   * Does not block immediate work.
   */
  LOW: 'LOW',

  /**
   * MEDIUM
   * Moderate operational issue.
   * May cause delays or require attention soon.
   */
  MEDIUM: 'MEDIUM',

  /**
   * HIGH
   * Significant operational problem.
   * Requires immediate attention to prevent impact.
   */
  HIGH: 'HIGH',
});

/**
 * Validate that a risk category is valid
 * @param {string} category - Risk category to validate
 * @throws {Error} If category is not in enum
 */
function validateRiskCategory(category) {
  const validCategories = Object.values(RISK_CATEGORY);
  if (!validCategories.includes(category)) {
    throw new Error(
      `Invalid risk category: "${category}". Must be one of: ${validCategories.join(', ')}`
    );
  }
}

/**
 * Validate that a risk severity is valid
 * @param {string} severity - Risk severity to validate
 * @throws {Error} If severity is not in enum
 */
function validateRiskSeverity(severity) {
  const validSeverities = Object.values(RISK_SEVERITY);
  if (!validSeverities.includes(severity)) {
    throw new Error(
      `Invalid risk severity: "${severity}". Must be one of: ${validSeverities.join(', ')}`
    );
  }
}

/**
 * Create a risk object with validation
 * @param {Object} risk - Risk data
 * @param {string} risk.id - Unique risk identifier
 * @param {string} risk.category - Risk category (must be from RISK_CATEGORY enum)
 * @param {string} risk.severity - Risk severity (must be from RISK_SEVERITY enum)
 * @param {string} risk.description - Factual description of the risk
 * @param {Object} risk.affectedEntityRef - Reference to affected entity
 * @param {string} risk.affectedEntityRef.type - Entity type (dossier, lawsuit, task, etc.)
 * @param {number} risk.affectedEntityRef.id - Entity ID
 * @param {Array} [risk.affectedItems] - Optional array of specific affected items
 * @returns {Object} Validated risk object
 * @throws {Error} If validation fails
 */
function createRisk({ id, category, severity, description, affectedEntityRef, affectedItems = [] }) {
  // Validate category
  validateRiskCategory(category);

  // Validate severity
  validateRiskSeverity(severity);

  // Validate required fields
  if (!id || typeof id !== 'string') {
    throw new Error('Risk id is required and must be a string');
  }

  if (!description || typeof description !== 'string') {
    throw new Error('Risk description is required and must be a string');
  }

  if (!affectedEntityRef || typeof affectedEntityRef !== 'object') {
    throw new Error('Risk affectedEntityRef is required and must be an object');
  }

  if (!affectedEntityRef.type || !affectedEntityRef.id) {
    throw new Error('affectedEntityRef must have type and id');
  }

  // No probability estimates allowed
  // No legal predictions allowed
  // No outcome speculation allowed
  const forbiddenFields = ['probability', 'legalImpact', 'likelihood', 'prediction', 'outcome'];
  forbiddenFields.forEach(field => {
    if (field in arguments[0]) {
      throw new Error(
        `Risk object must not contain "${field}". Operational risks are factual observations only.`
      );
    }
  });

  return Object.freeze({
    id,
    category,
    severity,
    description,
    affectedEntityRef: Object.freeze(affectedEntityRef),
    affectedItems: Object.freeze([...affectedItems]),
    detectedAt: new Date().toISOString(),
  });
}

/**
 * Get category metadata
 * @param {string} category - Risk category
 * @returns {Object} Category metadata
 */
function getCategoryMetadata(category) {
  validateRiskCategory(category);

  const metadata = {
    [RISK_CATEGORY.DEADLINE]: {
      name: 'Deadline Risk',
      type: 'temporal',
      requiresTimestamp: true,
    },
    [RISK_CATEGORY.DEPENDENCY]: {
      name: 'Dependency Risk',
      type: 'relational',
      requiresTimestamp: false,
    },
    [RISK_CATEGORY.STATE_INCONSISTENCY]: {
      name: 'State Inconsistency',
      type: 'structural',
      requiresTimestamp: false,
    },
    [RISK_CATEGORY.ACCOUNTING_GAP]: {
      name: 'Accounting Gap',
      type: 'financial',
      requiresTimestamp: false,
    },
    [RISK_CATEGORY.MISSING_DOCUMENT]: {
      name: 'Missing Document',
      type: 'structural',
      requiresTimestamp: false,
    },
    [RISK_CATEGORY.UNASSIGNED_RESPONSIBILITY]: {
      name: 'Unassigned Responsibility',
      type: 'organizational',
      requiresTimestamp: false,
    },
    [RISK_CATEGORY.NO_RECENT_ACTIVITY]: {
      name: 'No Recent Activity',
      type: 'temporal',
      requiresTimestamp: true,
    },
    [RISK_CATEGORY.SESSION_PREPARATION_GAP]: {
      name: 'Session Preparation Gap',
      type: 'temporal',
      requiresTimestamp: true,
    },
  };

  return metadata[category];
}

module.exports = {
  RISK_CATEGORY,
  RISK_SEVERITY,
  validateRiskCategory,
  validateRiskSeverity,
  createRisk,
  getCategoryMetadata,
};
