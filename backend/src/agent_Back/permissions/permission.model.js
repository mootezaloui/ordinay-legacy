'use strict';

/**
 * Permission Model
 *
 * Defines fine-grained permission scopes for the agent.
 * Ensures the agent never oversteps its bounds.
 *
 * DESIGN PRINCIPLES:
 * - Least privilege by default
 * - Explicit permission grants
 * - Granular scope control
 * - Audit trail for all permission checks
 */

/**
 * Permission Scopes
 *
 * Hierarchical permission system with clear boundaries.
 */
const PERMISSION_SCOPES = Object.freeze({
  // ═══════════════════════════════════════════════════════════════
  // DATA ACCESS SCOPES (Read operations)
  // ═══════════════════════════════════════════════════════════════
  DATA_READ: {
    CLIENTS: 'data:read:clients',
    DOSSIERS: 'data:read:dossiers',
    LAWSUITS: 'data:read:lawsuits',
    TASKS: 'data:read:tasks',
    SESSIONS: 'data:read:sessions',
    DOCUMENTS: 'data:read:documents',
    FINANCIAL: 'data:read:financial',
    HISTORY: 'data:read:history',
  },

  // ═══════════════════════════════════════════════════════════════
  // DATA MODIFICATION SCOPES (Write operations)
  // ═══════════════════════════════════════════════════════════════
  DATA_WRITE: {
    TASKS_CREATE: 'data:write:tasks:create',
    TASKS_UPDATE: 'data:write:tasks:update',
    TASKS_DELETE: 'data:write:tasks:delete',
    REMINDERS_CREATE: 'data:write:reminders:create',
    NOTES_CREATE: 'data:write:notes:create',
    NOTIFICATIONS_SEND: 'data:write:notifications:send',
  },

  // ═══════════════════════════════════════════════════════════════
  // ANALYSIS SCOPES
  // ═══════════════════════════════════════════════════════════════
  ANALYSIS: {
    BASIC: 'analysis:basic', // Status, summaries
    RISK: 'analysis:risk', // Risk analysis
    FINANCIAL: 'analysis:financial', // Financial analysis
    PREDICTIVE: 'analysis:predictive', // Predictions (future)
  },

  // ═══════════════════════════════════════════════════════════════
  // DRAFT SCOPES
  // ═══════════════════════════════════════════════════════════════
  DRAFT: {
    INTERNAL: 'draft:internal', // Internal notes, summaries
    EMAIL: 'draft:email', // Client emails
    LEGAL: 'draft:legal', // Legal documents
    FINANCIAL: 'draft:financial', // Invoices, quotes
  },

  // ═══════════════════════════════════════════════════════════════
  // EXTERNAL SCOPES
  // ═══════════════════════════════════════════════════════════════
  EXTERNAL: {
    WEB_SEARCH: 'external:web:search',
    LEGAL_RESEARCH: 'external:legal:research',
    API_CALL: 'external:api:call',
  },

  // ═══════════════════════════════════════════════════════════════
  // EXECUTION SCOPES (Actions with side effects)
  // ═══════════════════════════════════════════════════════════════
  EXECUTE: {
    TASK_CREATE: 'execute:task:create',
    REMINDER_SET: 'execute:reminder:set',
    NOTIFICATION_SEND: 'execute:notification:send',
    EMAIL_QUEUE: 'execute:email:queue',
    DOCUMENT_GENERATE: 'execute:document:generate',
  },

  // ═══════════════════════════════════════════════════════════════
  // SYSTEM SCOPES
  // ═══════════════════════════════════════════════════════════════
  SYSTEM: {
    CONTEXT_ACCESS: 'system:context:access',
    SESSION_MANAGE: 'system:session:manage',
    PREFERENCES_READ: 'system:preferences:read',
    AUDIT_LOG: 'system:audit:log',
  },
});

/**
 * Permission Categories
 */
const PERMISSION_CATEGORIES = Object.freeze({
  READ: 'read',
  WRITE: 'write',
  ANALYSIS: 'analysis',
  DRAFT: 'draft',
  EXTERNAL: 'external',
  EXECUTE: 'execute',
  SYSTEM: 'system',
});

/**
 * Extract category from scope
 */
function getCategoryFromScope(scope) {
  const parts = scope.split(':');
  if (parts[0] === 'data') {
    return parts[1] === 'read' ? PERMISSION_CATEGORIES.READ : PERMISSION_CATEGORIES.WRITE;
  }
  return parts[0];
}

/**
 * Check if scope requires confirmation
 */
function requiresConfirmation(scope) {
  const category = getCategoryFromScope(scope);
  return [
    PERMISSION_CATEGORIES.WRITE,
    PERMISSION_CATEGORIES.EXECUTE,
    PERMISSION_CATEGORIES.EXTERNAL,
  ].includes(category);
}

/**
 * Check if scope has side effects
 */
function hasSideEffects(scope) {
  const category = getCategoryFromScope(scope);
  return [
    PERMISSION_CATEGORIES.WRITE,
    PERMISSION_CATEGORIES.EXECUTE,
  ].includes(category);
}

/**
 * Get scope risk level
 */
function getScopeRiskLevel(scope) {
  const category = getCategoryFromScope(scope);

  const riskLevels = {
    [PERMISSION_CATEGORIES.READ]: 'low',
    [PERMISSION_CATEGORIES.ANALYSIS]: 'low',
    [PERMISSION_CATEGORIES.DRAFT]: 'low',
    [PERMISSION_CATEGORIES.EXTERNAL]: 'medium',
    [PERMISSION_CATEGORIES.WRITE]: 'high',
    [PERMISSION_CATEGORIES.EXECUTE]: 'high',
    [PERMISSION_CATEGORIES.SYSTEM]: 'medium',
  };

  return riskLevels[category] || 'unknown';
}

/**
 * Permission Grant
 */
class PermissionGrant {
  constructor({
    scope,
    grantedBy,
    grantedAt = new Date().toISOString(),
    expiresAt = null,
    conditions = {},
    reason = null,
  }) {
    this.scope = scope;
    this.grantedBy = grantedBy;
    this.grantedAt = grantedAt;
    this.expiresAt = expiresAt;
    this.conditions = conditions;
    this.reason = reason;
    this.revoked = false;
    this.revokedAt = null;
  }

  isValid() {
    if (this.revoked) return false;
    if (this.expiresAt && new Date(this.expiresAt) < new Date()) return false;
    return true;
  }

  revoke(reason) {
    this.revoked = true;
    this.revokedAt = new Date().toISOString();
    this.revokeReason = reason;
  }

  toJSON() {
    return {
      scope: this.scope,
      grantedBy: this.grantedBy,
      grantedAt: this.grantedAt,
      expiresAt: this.expiresAt,
      conditions: this.conditions,
      reason: this.reason,
      revoked: this.revoked,
      revokedAt: this.revokedAt,
    };
  }
}

/**
 * Permission Set
 *
 * Collection of permission grants for a session/user.
 */
class PermissionSet {
  constructor() {
    this._grants = new Map();
  }

  /**
   * Grant a permission
   */
  grant(scope, options = {}) {
    const grant = new PermissionGrant({
      scope,
      ...options,
    });
    this._grants.set(scope, grant);
    return grant;
  }

  /**
   * Revoke a permission
   */
  revoke(scope, reason) {
    const grant = this._grants.get(scope);
    if (grant) {
      grant.revoke(reason);
    }
  }

  /**
   * Check if scope is granted
   */
  has(scope) {
    const grant = this._grants.get(scope);
    return grant ? grant.isValid() : false;
  }

  /**
   * Check if any scope in array is granted
   */
  hasAny(scopes) {
    return scopes.some(scope => this.has(scope));
  }

  /**
   * Check if all scopes in array are granted
   */
  hasAll(scopes) {
    return scopes.every(scope => this.has(scope));
  }

  /**
   * List all valid grants
   */
  list() {
    return Array.from(this._grants.values())
      .filter(grant => grant.isValid())
      .map(grant => grant.toJSON());
  }

  /**
   * Get grant details
   */
  getGrant(scope) {
    return this._grants.get(scope) || null;
  }

  /**
   * Clear all grants
   */
  clear() {
    this._grants.clear();
  }

  /**
   * Serialize to JSON
   */
  toJSON() {
    return {
      grants: this.list(),
      grantCount: this._grants.size,
    };
  }
}

/**
 * Flatten all scopes into array
 */
function getAllScopes() {
  const scopes = [];

  function collectScopes(obj, prefix = '') {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        scopes.push(value);
      } else if (typeof value === 'object') {
        collectScopes(value, `${prefix}${key}.`);
      }
    }
  }

  collectScopes(PERMISSION_SCOPES);
  return scopes;
}

module.exports = {
  PERMISSION_SCOPES,
  PERMISSION_CATEGORIES,
  PermissionGrant,
  PermissionSet,
  getCategoryFromScope,
  requiresConfirmation,
  hasSideEffects,
  getScopeRiskLevel,
  getAllScopes,
};
