'use strict';

/**
 * Execution Gate
 *
 * Central gating system that controls all agent actions.
 * Ensures actions are only executed when:
 * - User has granted permission
 * - Trust tier allows the action
 * - Confirmation received (if required)
 * - No policy violations
 *
 * GATE SEQUENCE:
 * 1. Permission Check → Is scope allowed?
 * 2. Trust Check → Does tier permit this?
 * 3. Confirmation Check → Is user approval needed/obtained?
 * 4. Policy Check → Does policy allow execution?
 * 5. Rate Limit Check → Is action within limits?
 * 6. Execute or Block
 */

const { PERMISSION_SCOPES, getScopeRiskLevel, hasSideEffects } = require('./permission.model');
const { TrustManager, getTierPermissions } = require('./trust.tiers');
const { ConfirmationManager, ConfirmationPayloads, CONFIRMATION_PRIORITY } = require('./confirmation.hooks');

/**
 * Gate Results
 */
const GATE_RESULT = Object.freeze({
  ALLOWED: 'allowed',
  BLOCKED: 'blocked',
  PENDING_CONFIRMATION: 'pending_confirmation',
  RATE_LIMITED: 'rate_limited',
});

/**
 * Block Reasons
 */
const BLOCK_REASON = Object.freeze({
  PERMISSION_DENIED: 'permission_denied',
  TRUST_INSUFFICIENT: 'trust_insufficient',
  CONFIRMATION_REQUIRED: 'confirmation_required',
  CONFIRMATION_REJECTED: 'confirmation_rejected',
  CONFIRMATION_EXPIRED: 'confirmation_expired',
  POLICY_VIOLATION: 'policy_violation',
  RATE_LIMITED: 'rate_limited',
  SCOPE_DISABLED: 'scope_disabled',
  ACTION_FORBIDDEN: 'action_forbidden',
});

/**
 * Execution Gate
 */
class ExecutionGate {
  constructor({
    trustManager,
    confirmationManager,
    ledger,
    policy,
    rateLimits = {},
  }) {
    this.trustManager = trustManager;
    this.confirmationManager = confirmationManager;
    this.ledger = ledger;
    this.policy = policy;
    this.rateLimits = rateLimits;

    this._actionCounts = new Map();
    this._pendingActions = new Map();
  }

  /**
   * Check if action can proceed
   *
   * Returns immediately with result - does NOT wait for confirmation.
   * Use `executeWithConfirmation` for blocking confirmation flow.
   */
  async checkAction({ action, scope, params = {}, context = {} }) {
    const checkId = `check_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const checks = [];

    // ─────────────────────────────────────────────────────────────
    // GATE 1: Permission Check
    // ─────────────────────────────────────────────────────────────
    const permissionCheck = this._checkPermission(scope);
    checks.push(permissionCheck);

    if (!permissionCheck.passed) {
      return this._buildBlockedResult({
        checkId,
        action,
        scope,
        reason: BLOCK_REASON.PERMISSION_DENIED,
        message: `Permission '${scope}' is not granted`,
        checks,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // GATE 2: Trust Check
    // ─────────────────────────────────────────────────────────────
    const trustCheck = this._checkTrust(scope);
    checks.push(trustCheck);

    if (!trustCheck.passed) {
      return this._buildBlockedResult({
        checkId,
        action,
        scope,
        reason: BLOCK_REASON.TRUST_INSUFFICIENT,
        message: `Trust tier '${this.trustManager.currentTier}' does not permit '${scope}'`,
        checks,
        suggestedAction: 'Earn trust through successful interactions or request tier upgrade',
      });
    }

    // ─────────────────────────────────────────────────────────────
    // GATE 3: Policy Check
    // ─────────────────────────────────────────────────────────────
    const policyCheck = this._checkPolicy(scope, action);
    checks.push(policyCheck);

    if (!policyCheck.passed) {
      return this._buildBlockedResult({
        checkId,
        action,
        scope,
        reason: BLOCK_REASON.POLICY_VIOLATION,
        message: policyCheck.message,
        checks,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // GATE 4: Rate Limit Check
    // ─────────────────────────────────────────────────────────────
    const rateLimitCheck = this._checkRateLimit(action);
    checks.push(rateLimitCheck);

    if (!rateLimitCheck.passed) {
      return this._buildBlockedResult({
        checkId,
        action,
        scope,
        reason: BLOCK_REASON.RATE_LIMITED,
        message: `Rate limit exceeded for action '${action}'`,
        checks,
        retryAfter: rateLimitCheck.retryAfter,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // GATE 5: Confirmation Check
    // ─────────────────────────────────────────────────────────────
    const confirmationCheck = this._checkConfirmation(scope, action, params, context);
    checks.push(confirmationCheck);

    if (confirmationCheck.required && !confirmationCheck.obtained) {
      // Request confirmation
      const confirmationRequest = this.confirmationManager.requestConfirmation(
        confirmationCheck.payload
      );

      this._pendingActions.set(confirmationRequest.id, {
        action,
        scope,
        params,
        context,
        checkId,
      });

      return {
        result: GATE_RESULT.PENDING_CONFIRMATION,
        checkId,
        action,
        scope,
        confirmationRequest: confirmationRequest.toJSON(),
        checks,
        message: 'Action requires user confirmation',
      };
    }

    // ─────────────────────────────────────────────────────────────
    // ALL GATES PASSED
    // ─────────────────────────────────────────────────────────────
    this._recordActionCount(action);

    return {
      result: GATE_RESULT.ALLOWED,
      checkId,
      action,
      scope,
      checks,
      message: 'Action permitted',
    };
  }

  /**
   * Handle confirmation response and re-check gates
   */
  async handleConfirmation(confirmationId, response) {
    const pending = this._pendingActions.get(confirmationId);
    if (!pending) {
      throw new Error(`No pending action for confirmation ${confirmationId}`);
    }

    const confirmationResult = this.confirmationManager.handleResponse(confirmationId, response);

    if (!response.approved) {
      this._pendingActions.delete(confirmationId);

      // Record rejection in trust score
      this.trustManager.recordInteraction({
        success: false,
        userApproved: false,
        actionType: pending.action,
      });

      return {
        result: GATE_RESULT.BLOCKED,
        reason: BLOCK_REASON.CONFIRMATION_REJECTED,
        action: pending.action,
        scope: pending.scope,
        message: response.reason || 'User rejected the action',
      };
    }

    // Confirmation approved - record in trust score
    this.trustManager.recordInteraction({
      success: true,
      userApproved: true,
      actionType: pending.action,
    });

    this._pendingActions.delete(confirmationId);
    this._recordActionCount(pending.action);

    return {
      result: GATE_RESULT.ALLOWED,
      action: pending.action,
      scope: pending.scope,
      params: confirmationResult.getEffectiveDetails(),
      message: 'Action approved by user',
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // Gate Check Methods
  // ═══════════════════════════════════════════════════════════════

  _checkPermission(scope) {
    const hasPermission = this.trustManager.hasPermission(scope);

    return {
      gate: 'PERMISSION',
      passed: hasPermission,
      message: hasPermission
        ? `Permission '${scope}' granted`
        : `Permission '${scope}' not granted`,
    };
  }

  _checkTrust(scope) {
    const tierPermissions = getTierPermissions(this.trustManager.currentTier);
    const hasTrust = tierPermissions.includes(scope);

    return {
      gate: 'TRUST',
      passed: hasTrust,
      currentTier: this.trustManager.currentTier,
      message: hasTrust
        ? `Trust tier permits '${scope}'`
        : `Trust tier '${this.trustManager.currentTier}' does not permit '${scope}'`,
    };
  }

  _checkPolicy(scope, action) {
    // Check if execution is allowed by policy
    if (scope.startsWith('execute:') || scope.startsWith('data:write:')) {
      if (!this.policy.allowExecution) {
        return {
          gate: 'POLICY',
          passed: false,
          message: `Policy ${this.policy.version} does not allow execution`,
        };
      }
    }

    // Check if external access is allowed
    if (scope.startsWith('external:')) {
      if (!this.policy.allowExternalSearch) {
        return {
          gate: 'POLICY',
          passed: false,
          message: `Policy ${this.policy.version} does not allow external access`,
        };
      }
    }

    return {
      gate: 'POLICY',
      passed: true,
      message: 'Policy allows action',
    };
  }

  _checkRateLimit(action) {
    const limit = this.rateLimits[action];
    if (!limit) {
      return { gate: 'RATE_LIMIT', passed: true, message: 'No rate limit configured' };
    }

    const key = `${action}_${this._getTimeWindow()}`;
    const count = this._actionCounts.get(key) || 0;

    if (count >= limit.max) {
      return {
        gate: 'RATE_LIMIT',
        passed: false,
        message: `Rate limit exceeded: ${count}/${limit.max} per ${limit.window}`,
        retryAfter: this._getRetryAfter(limit.window),
      };
    }

    return {
      gate: 'RATE_LIMIT',
      passed: true,
      message: `Rate limit: ${count}/${limit.max}`,
    };
  }

  _checkConfirmation(scope, action, params, context) {
    // Check if confirmation is required
    const required = this.trustManager.requiresConfirmation(scope);

    // Check if already confirmed in context
    const obtained = context.confirmed === true;

    if (!required) {
      return {
        gate: 'CONFIRMATION',
        passed: true,
        required: false,
        obtained: false,
        message: 'Confirmation not required',
      };
    }

    if (obtained) {
      return {
        gate: 'CONFIRMATION',
        passed: true,
        required: true,
        obtained: true,
        message: 'Confirmation already obtained',
      };
    }

    // Build confirmation payload
    const payload = this._buildConfirmationPayload(action, scope, params);

    return {
      gate: 'CONFIRMATION',
      passed: false,
      required: true,
      obtained: false,
      message: 'Confirmation required from user',
      payload,
    };
  }

  _buildConfirmationPayload(action, scope, params) {
    // Use predefined payloads where available
    if (action === 'create_task' && ConfirmationPayloads.taskCreation) {
      return ConfirmationPayloads.taskCreation(params);
    }
    if (action === 'create_reminder' && ConfirmationPayloads.reminderCreation) {
      return ConfirmationPayloads.reminderCreation(params);
    }
    if (action === 'send_email' && ConfirmationPayloads.emailSending) {
      return ConfirmationPayloads.emailSending(params);
    }
    if (action === 'external_search' && ConfirmationPayloads.externalSearch) {
      return ConfirmationPayloads.externalSearch(params);
    }

    // Default payload
    return {
      type: 'detailed',
      priority: getScopeRiskLevel(scope) === 'high' ? CONFIRMATION_PRIORITY.HIGH : CONFIRMATION_PRIORITY.NORMAL,
      action,
      scope,
      title: `Aktion bestatigen / Confirm Action`,
      description: `Der Agent mochte folgende Aktion ausfuhren: ${action}`,
      details: params,
      consequences: hasSideEffects(scope)
        ? ['Diese Aktion hat Auswirkungen auf Ihre Daten']
        : [],
    };
  }

  _buildBlockedResult({ checkId, action, scope, reason, message, checks, suggestedAction, retryAfter }) {
    const result = {
      result: GATE_RESULT.BLOCKED,
      checkId,
      action,
      scope,
      reason,
      message,
      checks,
    };

    if (suggestedAction) result.suggestedAction = suggestedAction;
    if (retryAfter) result.retryAfter = retryAfter;

    // Log blocked action
    if (this.ledger) {
      this.ledger.record({
        type: 'action_blocked',
        checkId,
        action,
        scope,
        reason,
        message,
        timestamp: new Date().toISOString(),
      });
    }

    return result;
  }

  _recordActionCount(action) {
    const key = `${action}_${this._getTimeWindow()}`;
    const count = this._actionCounts.get(key) || 0;
    this._actionCounts.set(key, count + 1);
  }

  _getTimeWindow() {
    // Hourly time window
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
  }

  _getRetryAfter(window) {
    const now = new Date();
    const nextWindow = new Date(now);

    if (window === 'hour') {
      nextWindow.setHours(nextWindow.getHours() + 1, 0, 0, 0);
    } else if (window === 'minute') {
      nextWindow.setMinutes(nextWindow.getMinutes() + 1, 0, 0);
    } else if (window === 'day') {
      nextWindow.setDate(nextWindow.getDate() + 1);
      nextWindow.setHours(0, 0, 0, 0);
    }

    return nextWindow.toISOString();
  }

  /**
   * Get pending confirmations
   */
  getPendingConfirmations() {
    return this.confirmationManager.getPending();
  }

  /**
   * Get gate statistics
   */
  getStatistics() {
    return {
      pendingConfirmations: this._pendingActions.size,
      trustTier: this.trustManager.currentTier,
      trustScore: this.trustManager.trustScore.toJSON(),
      policyVersion: this.policy.version,
    };
  }
}

/**
 * Create execution gate with defaults
 */
function createExecutionGate({ userId, policy, ledger }) {
  const trustManager = new TrustManager({
    userId,
    initialTier: 'observer',
    ledger,
  });

  const confirmationManager = new ConfirmationManager({ ledger });

  return new ExecutionGate({
    trustManager,
    confirmationManager,
    ledger,
    policy,
    rateLimits: {
      create_task: { max: 20, window: 'hour' },
      create_reminder: { max: 50, window: 'hour' },
      send_email: { max: 10, window: 'hour' },
      external_search: { max: 100, window: 'hour' },
    },
  });
}

module.exports = {
  GATE_RESULT,
  BLOCK_REASON,
  ExecutionGate,
  createExecutionGate,
};
