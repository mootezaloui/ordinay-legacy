'use strict';

/**
 * Tool Firewall
 *
 * Safety gates that prevent unauthorized tool execution.
 *
 * CRITICAL: This is a security boundary.
 * - All tool calls MUST pass through this firewall
 * - Checks are mandatory, no silent fallbacks
 * - Blocked calls throw explicit errors
 * - All decisions are logged
 *
 * BLOCKING RULES:
 * - Tools not in registry → BLOCK
 * - Tool not allowed for agent version → BLOCK
 * - Tool category not allowed by policy → BLOCK
 * - Execute tools in v1/v2 → BLOCK
 * - Execute flag false but execution requested → BLOCK
 */

const { TOOL_CATEGORIES } = require('./tool.registry');

/**
 * TOOL_DOMAIN_MAP
 *
 * Maps tools to data domains for access control.
 * If a domain is disabled in context.dataAccess, tools in that domain are BLOCKED.
 */
const TOOL_DOMAIN_MAP = Object.freeze({
  // READ tools
  getClient: 'clients',
  getDossier: 'dossiers',
  getCase: 'cases',
  getSession: 'sessions',
  listTasks: 'tasks',
  getTimeline: 'dossiers', // Timeline is dossier-scoped

  // ANALYSIS tools
  detectOverdueTasks: 'tasks',
  computeDossierStatus: 'dossiers',
  findBlockingDependencies: 'dossiers',
  scanOperationalRisks: 'dossiers',

  // DRAFT tools (require underlying data access)
  draftInvitation: 'sessions',
  draftClientEmail: 'clients',
  draftHearingSummary: 'sessions',

  // EXECUTE tools
  createTask: 'tasks',
  scheduleReminder: 'tasks',
  prepareClientNotification: 'clients',
});

/**
 * DATA_DOMAINS
 *
 * All supported data domains for access control.
 */
const DATA_DOMAINS = Object.freeze({
  CLIENTS: 'clients',
  DOSSIERS: 'dossiers',
  CASES: 'cases',
  TASKS: 'tasks',
  SESSIONS: 'sessions',
  DOCUMENTS: 'documents',
  PERSONAL_TASKS: 'personalTasks',
  MISSIONS: 'missions',
});

class ToolFirewall {
  constructor({ registry, ledger }) {
    if (!registry) {
      throw new Error('ToolFirewall requires a ToolRegistry instance');
    }
    if (!ledger) {
      throw new Error('ToolFirewall requires a AgentLedgerService instance');
    }

    this.registry = registry;
    this.ledger = ledger;
  }

  /**
   * Check if a tool call is permitted
   *
   * @param {Object} options
   * @param {string} options.toolName - Name of tool to call
   * @param {Object} options.policy - Agent policy
   * @param {Object} options.context - Execution context
   * @returns {Object} Permission result
   */
  checkPermission({ toolName, policy, context = {} }) {
    const checks = [];

    // GATE 1: Tool must be declared in registry
    const tool = this.registry.get(toolName);
    if (!tool) {
      const result = this._buildRejection({
        toolName,
        reason: 'UNDECLARED_TOOL',
        message: `Tool '${toolName}' is not declared in the tool registry`,
        policy,
        context,
        checks,
      });
      this._logDecision(result);
      return result;
    }

    checks.push({
      gate: 'REGISTRY_CHECK',
      passed: true,
      message: 'Tool exists in registry',
    });

    // GATE 2: Agent version must be allowed for this tool
    const agentVersion = policy.version;
    if (!tool.allowedAgentVersions.includes(agentVersion)) {
      const result = this._buildRejection({
        toolName,
        reason: 'VERSION_NOT_ALLOWED',
        message: `Tool '${toolName}' is not allowed for agent version ${agentVersion}. Allowed versions: ${tool.allowedAgentVersions.join(', ')}`,
        policy,
        context,
        checks,
        tool,
      });
      this._logDecision(result);
      return result;
    }

    checks.push({
      gate: 'VERSION_CHECK',
      passed: true,
      message: `Agent version ${agentVersion} is allowed`,
    });

    // GATE 3: Tool category must be allowed by policy
    if (!policy.allowedToolCategories.includes(tool.category)) {
      const result = this._buildRejection({
        toolName,
        reason: 'CATEGORY_NOT_ALLOWED',
        message: `Tool category '${tool.category}' is not allowed by agent policy ${agentVersion}. Allowed categories: ${policy.allowedToolCategories.join(', ')}`,
        policy,
        context,
        checks,
        tool,
      });
      this._logDecision(result);
      return result;
    }

    checks.push({
      gate: 'CATEGORY_CHECK',
      passed: true,
      message: `Category '${tool.category}' is allowed by policy`,
    });

    // GATE 4: Execute tools require explicit execution permission
    if (tool.category === TOOL_CATEGORIES.EXECUTE && !policy.allowExecution) {
      const result = this._buildRejection({
        toolName,
        reason: 'EXECUTION_NOT_PERMITTED',
        message: `Execution tools are not permitted for agent version ${agentVersion}. This is a safety constraint.`,
        policy,
        context,
        checks,
        tool,
        suggestedAlternative: this._suggestReadAlternative(toolName),
      });
      this._logDecision(result);
      return result;
    }

    checks.push({
      gate: 'EXECUTION_CHECK',
      passed: true,
      message: tool.category === TOOL_CATEGORIES.EXECUTE
        ? 'Execution is permitted by policy'
        : 'Tool does not require execution permission',
    });

    // GATE 5: Side effects require explicit confirmation in context (for execute tools)
    if (tool.sideEffects && tool.category === TOOL_CATEGORIES.EXECUTE) {
      const confirmationRequired = tool.confirmationRequired !== false; // default to true
      if (confirmationRequired && !context.confirmed) {
        const result = this._buildRejection({
          toolName,
          reason: 'CONFIRMATION_REQUIRED',
          message: `Tool '${toolName}' has side effects and requires explicit confirmation`,
          policy,
          context,
          checks,
          tool,
        });
        this._logDecision(result);
        return result;
      }

      checks.push({
        gate: 'CONFIRMATION_CHECK',
        passed: true,
        message: context.confirmed
          ? 'Execution confirmed'
          : 'Confirmation not required for this tool',
      });
    }

    // GATE 6: Domain access must be enabled in context.dataAccess
    const toolDomain = TOOL_DOMAIN_MAP[toolName];
    if (toolDomain && context.dataAccess) {
      const domainEnabled = context.dataAccess[toolDomain];
      // If dataAccess is specified and domain is explicitly disabled, block
      if (domainEnabled === false) {
        const result = this._buildRejection({
          toolName,
          reason: 'DOMAIN_ACCESS_DENIED',
          message: `Access to ${toolDomain} data is disabled. Enable ${toolDomain} access in the context panel to use this feature.`,
          policy,
          context,
          checks,
          tool,
          deniedDomain: toolDomain,
        });
        this._logDecision(result);
        return result;
      }

      checks.push({
        gate: 'DOMAIN_ACCESS_CHECK',
        passed: true,
        message: `Access to ${toolDomain} domain is permitted`,
      });
    } else if (toolDomain) {
      // No dataAccess in context = all domains allowed (backward compatibility)
      checks.push({
        gate: 'DOMAIN_ACCESS_CHECK',
        passed: true,
        message: 'No domain restrictions specified (all domains allowed)',
      });
    }

    // ALL GATES PASSED
    const result = {
      permitted: true,
      toolName,
      tool,
      policy: {
        version: policy.version,
        allowExecution: policy.allowExecution,
        allowedToolCategories: policy.allowedToolCategories,
      },
      context,
      checks,
      timestamp: new Date().toISOString(),
    };

    this._logDecision(result);
    return result;
  }

  /**
   * Build a rejection result
   * @private
   */
  _buildRejection({ toolName, reason, message, policy, context, checks, tool = null, suggestedAlternative = null }) {
    return {
      permitted: false,
      toolName,
      tool,
      reason,
      message,
      policy: {
        version: policy.version,
        allowExecution: policy.allowExecution,
        allowedToolCategories: policy.allowedToolCategories,
      },
      context,
      checks,
      suggestedAlternative,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Log firewall decision to ledger
   * @private
   */
  _logDecision(result) {
    this.ledger.record({
      type: 'tool_permission_check',
      toolName: result.toolName,
      permitted: result.permitted,
      reason: result.reason || 'PERMITTED',
      policyVersion: result.policy.version,
      toolCategory: result.tool ? result.tool.category : null,
      checks: result.checks,
      timestamp: result.timestamp,
    });
  }

  /**
   * Suggest a safe alternative for execute tools
   * @private
   */
  _suggestReadAlternative(toolName) {
    // Map execute tools to their read equivalents
    const alternatives = {
      createTask: 'listTasks',
      scheduleReminder: 'listReminders',
      prepareClientNotification: 'getClient',
      updateDossierStatus: 'getDossier',
    };

    const alternative = alternatives[toolName];
    if (alternative) {
      return {
        toolName: alternative,
        message: `Consider using '${alternative}' to read data instead`,
      };
    }

    return null;
  }
}

module.exports = {
  ToolFirewall,
  TOOL_DOMAIN_MAP,
  DATA_DOMAINS,
};
