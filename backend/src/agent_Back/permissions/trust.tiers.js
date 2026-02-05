'use strict';

/**
 * Trust Tiers System
 *
 * Progressive trust model that allows the agent to earn capabilities over time.
 * Trust is earned through successful interactions and explicit user grants.
 *
 * DESIGN PRINCIPLES:
 * - Start with minimal trust (OBSERVER)
 * - Earn trust through demonstrated reliability
 * - Explicit user confirmation for tier upgrades
 * - Trust can be revoked
 * - Actions tracked for trust scoring
 */

const { PERMISSION_SCOPES } = require('./permission.model');

/**
 * Trust Tier Definitions
 *
 * Each tier grants progressively more capabilities.
 */
const TRUST_TIERS = Object.freeze({
  // ═══════════════════════════════════════════════════════════════
  // TIER 0: OBSERVER
  // Minimal trust - can only observe and explain
  // ═══════════════════════════════════════════════════════════════
  OBSERVER: {
    id: 'observer',
    level: 0,
    name: 'Observer',
    description: 'Can read data and provide explanations',
    color: '#6B7280', // gray
    icon: 'eye',

    // Permissions granted at this tier
    permissions: [
      PERMISSION_SCOPES.DATA_READ.CLIENTS,
      PERMISSION_SCOPES.DATA_READ.DOSSIERS,
      PERMISSION_SCOPES.DATA_READ.TASKS,
      PERMISSION_SCOPES.DATA_READ.SESSIONS,
      PERMISSION_SCOPES.ANALYSIS.BASIC,
      PERMISSION_SCOPES.SYSTEM.CONTEXT_ACCESS,
    ],

    // Requirements to maintain this tier
    requirements: {
      minSuccessRate: 0,
      minInteractions: 0,
    },

    // What triggers upgrade consideration
    upgradeAfter: {
      successfulInteractions: 5,
      userSatisfactionRate: 0.7,
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // TIER 1: ASSISTANT
  // Can analyze and draft content
  // ═══════════════════════════════════════════════════════════════
  ASSISTANT: {
    id: 'assistant',
    level: 1,
    name: 'Assistant',
    description: 'Can analyze data and draft documents',
    color: '#3B82F6', // blue
    icon: 'clipboard',

    permissions: [
      // Inherits OBSERVER permissions
      ...TRUST_TIERS?.OBSERVER?.permissions || [],
      // Plus additional
      PERMISSION_SCOPES.DATA_READ.DOCUMENTS,
      PERMISSION_SCOPES.DATA_READ.HISTORY,
      PERMISSION_SCOPES.DATA_READ.FINANCIAL,
      PERMISSION_SCOPES.ANALYSIS.RISK,
      PERMISSION_SCOPES.DRAFT.INTERNAL,
      PERMISSION_SCOPES.DRAFT.EMAIL,
    ],

    requirements: {
      minSuccessRate: 0.7,
      minInteractions: 5,
    },

    upgradeAfter: {
      successfulInteractions: 20,
      userSatisfactionRate: 0.8,
      daysAtTier: 3,
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // TIER 2: RESEARCHER
  // Can perform external research
  // ═══════════════════════════════════════════════════════════════
  RESEARCHER: {
    id: 'researcher',
    level: 2,
    name: 'Researcher',
    description: 'Can perform web and legal research',
    color: '#8B5CF6', // purple
    icon: 'search',

    permissions: [
      // Plus additional
      PERMISSION_SCOPES.EXTERNAL.WEB_SEARCH,
      PERMISSION_SCOPES.EXTERNAL.LEGAL_RESEARCH,
      PERMISSION_SCOPES.DRAFT.LEGAL,
      PERMISSION_SCOPES.ANALYSIS.FINANCIAL,
    ],

    requirements: {
      minSuccessRate: 0.8,
      minInteractions: 20,
      minDaysActive: 3,
    },

    upgradeAfter: {
      successfulInteractions: 50,
      userSatisfactionRate: 0.85,
      daysAtTier: 7,
      explicitUserApproval: true,
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // TIER 3: OPERATOR
  // Can propose and execute actions (with confirmation)
  // ═══════════════════════════════════════════════════════════════
  OPERATOR: {
    id: 'operator',
    level: 3,
    name: 'Operator',
    description: 'Can propose and execute actions with confirmation',
    color: '#F59E0B', // amber
    icon: 'zap',

    permissions: [
      // Plus execution (with confirmation)
      PERMISSION_SCOPES.EXECUTE.TASK_CREATE,
      PERMISSION_SCOPES.EXECUTE.REMINDER_SET,
      PERMISSION_SCOPES.DATA_WRITE.TASKS_CREATE,
      PERMISSION_SCOPES.DATA_WRITE.REMINDERS_CREATE,
      PERMISSION_SCOPES.DATA_WRITE.NOTES_CREATE,
    ],

    // Actions always require confirmation at this tier
    requiresConfirmation: true,

    requirements: {
      minSuccessRate: 0.85,
      minInteractions: 50,
      minDaysActive: 7,
      explicitUserApproval: true,
    },

    upgradeAfter: {
      successfulInteractions: 100,
      userSatisfactionRate: 0.9,
      daysAtTier: 14,
      explicitUserApproval: true,
      noRejectedActions: 10, // Last 10 proposed actions accepted
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // TIER 4: TRUSTED
  // Can execute some actions without confirmation
  // ═══════════════════════════════════════════════════════════════
  TRUSTED: {
    id: 'trusted',
    level: 4,
    name: 'Trusted',
    description: 'Can execute routine actions autonomously',
    color: '#10B981', // green
    icon: 'shield-check',

    permissions: [
      // Plus autonomous execution for low-risk actions
      PERMISSION_SCOPES.EXECUTE.NOTIFICATION_SEND,
      PERMISSION_SCOPES.DATA_WRITE.NOTIFICATIONS_SEND,
    ],

    // Some actions can bypass confirmation
    autoApproveScopes: [
      PERMISSION_SCOPES.EXECUTE.REMINDER_SET,
      PERMISSION_SCOPES.DATA_WRITE.NOTES_CREATE,
    ],

    requirements: {
      minSuccessRate: 0.9,
      minInteractions: 100,
      minDaysActive: 14,
      explicitUserApproval: true,
      noRejectedActions: 10,
    },

    upgradeAfter: null, // Max tier for standard users
  },
});

// Fix circular reference for permissions inheritance
const OBSERVER_PERMS = [
  'data:read:clients',
  'data:read:dossiers',
  'data:read:tasks',
  'data:read:sessions',
  'analysis:basic',
  'system:context:access',
];

const ASSISTANT_PERMS = [
  ...OBSERVER_PERMS,
  'data:read:documents',
  'data:read:history',
  'data:read:financial',
  'analysis:risk',
  'draft:internal',
  'draft:email',
];

const RESEARCHER_PERMS = [
  ...ASSISTANT_PERMS,
  'external:web:search',
  'external:legal:research',
  'draft:legal',
  'analysis:financial',
];

const OPERATOR_PERMS = [
  ...RESEARCHER_PERMS,
  'execute:task:create',
  'execute:reminder:set',
  'data:write:tasks:create',
  'data:write:reminders:create',
  'data:write:notes:create',
];

const TRUSTED_PERMS = [
  ...OPERATOR_PERMS,
  'execute:notification:send',
  'data:write:notifications:send',
];

/**
 * Get permissions for a tier
 */
function getTierPermissions(tierId) {
  const permMap = {
    observer: OBSERVER_PERMS,
    assistant: ASSISTANT_PERMS,
    researcher: RESEARCHER_PERMS,
    operator: OPERATOR_PERMS,
    trusted: TRUSTED_PERMS,
  };
  return permMap[tierId] || OBSERVER_PERMS;
}

/**
 * Trust Score Calculation
 */
class TrustScore {
  constructor() {
    this.totalInteractions = 0;
    this.successfulInteractions = 0;
    this.failedInteractions = 0;
    this.userApprovals = 0;
    this.userRejections = 0;
    this.recentActions = []; // Last N actions
    this.firstInteraction = null;
    this.lastInteraction = null;
  }

  /**
   * Record an interaction outcome
   */
  recordInteraction({ success, userApproved = null, actionType = null }) {
    this.totalInteractions++;
    const now = new Date().toISOString();

    if (!this.firstInteraction) {
      this.firstInteraction = now;
    }
    this.lastInteraction = now;

    if (success) {
      this.successfulInteractions++;
    } else {
      this.failedInteractions++;
    }

    if (userApproved === true) {
      this.userApprovals++;
    } else if (userApproved === false) {
      this.userRejections++;
    }

    // Track recent actions (keep last 20)
    this.recentActions.push({
      timestamp: now,
      success,
      userApproved,
      actionType,
    });
    if (this.recentActions.length > 20) {
      this.recentActions.shift();
    }
  }

  /**
   * Get success rate
   */
  getSuccessRate() {
    if (this.totalInteractions === 0) return 0;
    return this.successfulInteractions / this.totalInteractions;
  }

  /**
   * Get user satisfaction rate
   */
  getUserSatisfactionRate() {
    const total = this.userApprovals + this.userRejections;
    if (total === 0) return 1; // No rejections = satisfied
    return this.userApprovals / total;
  }

  /**
   * Get days active
   */
  getDaysActive() {
    if (!this.firstInteraction) return 0;
    const first = new Date(this.firstInteraction);
    const now = new Date();
    return Math.floor((now - first) / (1000 * 60 * 60 * 24));
  }

  /**
   * Get recent rejection count
   */
  getRecentRejectionCount(n = 10) {
    const recent = this.recentActions.slice(-n);
    return recent.filter(a => a.userApproved === false).length;
  }

  /**
   * Check if eligible for tier
   */
  meetsRequirements(tierRequirements) {
    if (tierRequirements.minSuccessRate !== undefined) {
      if (this.getSuccessRate() < tierRequirements.minSuccessRate) return false;
    }
    if (tierRequirements.minInteractions !== undefined) {
      if (this.totalInteractions < tierRequirements.minInteractions) return false;
    }
    if (tierRequirements.minDaysActive !== undefined) {
      if (this.getDaysActive() < tierRequirements.minDaysActive) return false;
    }
    return true;
  }

  /**
   * Check if ready for upgrade
   */
  readyForUpgrade(upgradeRequirements) {
    if (!upgradeRequirements) return false;

    if (upgradeRequirements.successfulInteractions !== undefined) {
      if (this.successfulInteractions < upgradeRequirements.successfulInteractions) return false;
    }
    if (upgradeRequirements.userSatisfactionRate !== undefined) {
      if (this.getUserSatisfactionRate() < upgradeRequirements.userSatisfactionRate) return false;
    }
    if (upgradeRequirements.noRejectedActions !== undefined) {
      if (this.getRecentRejectionCount(upgradeRequirements.noRejectedActions) > 0) return false;
    }

    return true;
  }

  toJSON() {
    return {
      totalInteractions: this.totalInteractions,
      successfulInteractions: this.successfulInteractions,
      failedInteractions: this.failedInteractions,
      userApprovals: this.userApprovals,
      userRejections: this.userRejections,
      successRate: this.getSuccessRate(),
      satisfactionRate: this.getUserSatisfactionRate(),
      daysActive: this.getDaysActive(),
      firstInteraction: this.firstInteraction,
      lastInteraction: this.lastInteraction,
    };
  }
}

/**
 * Trust Manager
 *
 * Manages trust tiers and permissions for a user/session.
 */
class TrustManager {
  constructor({ userId, initialTier = 'observer', ledger = null }) {
    this.userId = userId;
    this.currentTier = initialTier;
    this.trustScore = new TrustScore();
    this.ledger = ledger;
    this.tierHistory = [{
      tier: initialTier,
      timestamp: new Date().toISOString(),
      reason: 'Initial assignment',
    }];
    this.pendingUpgrade = null;
  }

  /**
   * Get current tier details
   */
  getCurrentTier() {
    return {
      ...TRUST_TIERS[this.currentTier.toUpperCase()],
      permissions: getTierPermissions(this.currentTier),
    };
  }

  /**
   * Check if user has permission
   */
  hasPermission(scope) {
    const permissions = getTierPermissions(this.currentTier);
    return permissions.includes(scope);
  }

  /**
   * Check if action requires confirmation
   */
  requiresConfirmation(scope) {
    const tier = TRUST_TIERS[this.currentTier.toUpperCase()];

    // Check if this scope is auto-approved at this tier
    if (tier.autoApproveScopes && tier.autoApproveScopes.includes(scope)) {
      return false;
    }

    // Check if tier requires confirmation for all actions
    if (tier.requiresConfirmation) {
      return true;
    }

    // Default: execution scopes require confirmation
    return scope.startsWith('execute:') || scope.startsWith('data:write:');
  }

  /**
   * Record an interaction
   */
  recordInteraction(outcome) {
    this.trustScore.recordInteraction(outcome);

    // Log to ledger
    if (this.ledger) {
      this.ledger.record({
        type: 'trust_interaction',
        userId: this.userId,
        tier: this.currentTier,
        outcome,
        trustScore: this.trustScore.toJSON(),
        timestamp: new Date().toISOString(),
      });
    }

    // Check for upgrade eligibility
    this._checkUpgradeEligibility();
  }

  /**
   * Check if eligible for upgrade
   */
  _checkUpgradeEligibility() {
    const currentTierDef = TRUST_TIERS[this.currentTier.toUpperCase()];
    if (!currentTierDef.upgradeAfter) return; // Already at max tier

    if (this.trustScore.readyForUpgrade(currentTierDef.upgradeAfter)) {
      const nextTier = this._getNextTier();
      if (nextTier && !this.pendingUpgrade) {
        this.pendingUpgrade = {
          fromTier: this.currentTier,
          toTier: nextTier,
          readyAt: new Date().toISOString(),
          requiresApproval: currentTierDef.upgradeAfter.explicitUserApproval || false,
        };

        if (this.ledger) {
          this.ledger.record({
            type: 'trust_upgrade_eligible',
            userId: this.userId,
            pendingUpgrade: this.pendingUpgrade,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }
  }

  /**
   * Get next tier
   */
  _getNextTier() {
    const currentLevel = TRUST_TIERS[this.currentTier.toUpperCase()].level;
    const tiers = Object.values(TRUST_TIERS);
    const nextTier = tiers.find(t => t.level === currentLevel + 1);
    return nextTier ? nextTier.id : null;
  }

  /**
   * Upgrade tier (with optional user approval)
   */
  upgradeTier({ approved = true, approvedBy = null, reason = null } = {}) {
    if (!this.pendingUpgrade) {
      return { success: false, error: 'No pending upgrade' };
    }

    if (this.pendingUpgrade.requiresApproval && !approved) {
      return { success: false, error: 'Upgrade requires user approval' };
    }

    const previousTier = this.currentTier;
    this.currentTier = this.pendingUpgrade.toTier;

    this.tierHistory.push({
      tier: this.currentTier,
      previousTier,
      timestamp: new Date().toISOString(),
      reason: reason || 'Earned through successful interactions',
      approvedBy,
    });

    if (this.ledger) {
      this.ledger.record({
        type: 'trust_tier_upgraded',
        userId: this.userId,
        previousTier,
        newTier: this.currentTier,
        approvedBy,
        reason,
        timestamp: new Date().toISOString(),
      });
    }

    this.pendingUpgrade = null;

    return {
      success: true,
      previousTier,
      newTier: this.currentTier,
    };
  }

  /**
   * Downgrade tier (e.g., due to violations)
   */
  downgradeTier({ toTier, reason }) {
    const previousTier = this.currentTier;
    this.currentTier = toTier;

    this.tierHistory.push({
      tier: this.currentTier,
      previousTier,
      timestamp: new Date().toISOString(),
      reason,
      isDowngrade: true,
    });

    if (this.ledger) {
      this.ledger.record({
        type: 'trust_tier_downgraded',
        userId: this.userId,
        previousTier,
        newTier: this.currentTier,
        reason,
        timestamp: new Date().toISOString(),
      });
    }

    this.pendingUpgrade = null;

    return {
      success: true,
      previousTier,
      newTier: this.currentTier,
    };
  }

  /**
   * Get trust status summary
   */
  getStatus() {
    const tier = this.getCurrentTier();

    return {
      userId: this.userId,
      currentTier: {
        id: tier.id,
        name: tier.name,
        level: tier.level,
        description: tier.description,
        color: tier.color,
        icon: tier.icon,
      },
      trustScore: this.trustScore.toJSON(),
      pendingUpgrade: this.pendingUpgrade,
      tierHistory: this.tierHistory,
    };
  }

  toJSON() {
    return this.getStatus();
  }
}

module.exports = {
  TRUST_TIERS,
  TrustScore,
  TrustManager,
  getTierPermissions,
};
