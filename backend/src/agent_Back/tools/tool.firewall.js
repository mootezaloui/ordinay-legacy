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
const { getAdapter } = require('../engine/entityAdapters');

/**
 * TOOL_DOMAIN_MAP
 *
 * Maps tools to data domains for access control.
 * If a domain is disabled in context.dataAccess, tools in that domain are BLOCKED.
 */
const TOOL_DOMAIN_MAP = Object.freeze({
  // READ tools
  webSearch: 'web', // External web search (public information only)
  mcpWebSearch: 'web', // External MCP web search (explicit activation only)
  legalResearch: 'legal', // Legal research (jurisprudence, statutes, procedures)
  mcpLegalSearch: 'legal', // External MCP legal search (explicit activation only)
  mcpDeepSearch: 'legal', // External deep web/legal search (explicit activation only)
  getClient: 'clients',
  listClients: 'clients',
  searchClientsByName: 'clients',
  getDossier: 'dossiers',
  getDossierByReference: 'dossiers',
  listDossiers: 'dossiers',
  listDossiersForClient: 'dossiers',
  getClientDossierSummary: 'dossiers',
  getDossierWorkSummary: 'dossiers',
  getLawsuit: 'lawsuits',
  listLawsuits: 'lawsuits',
  getSession: 'sessions',
  listSessions: 'sessions',
  listTasks: 'tasks',
  getTask: 'tasks',
  getTimeline: 'dossiers', // Timeline is dossier-scoped
  listPersonalTasks: 'personalTasks',
  getPersonalTask: 'personalTasks',
  listMissions: 'missions',
  getMission: 'missions',
  listOfficers: 'clients',
  getOfficer: 'clients',
  listFinancialEntries: 'financialEntries',
  getFinancialEntry: 'financialEntries',
  listNotifications: 'notifications',
  getNotification: 'notifications',
  listHistoryEvents: 'history',
  getHistoryEvent: 'history',

  // ANALYSIS tools
  detectOverdueTasks: 'tasks',
  computeDossierStatus: 'dossiers',
  findBlockingDependencies: 'dossiers',
  scanOperationalRisks: 'dossiers',

  // DRAFT tools (require underlying data access)
  draftInvitation: 'sessions',
  draftClientEmail: 'clients',
  draftHearingSummary: 'sessions',

  // RESEARCH tools
  compileDossierResearch: 'dossiers',

  // EXECUTE tools
  universalMutation: null, // Multi-domain — domain resolved per operation params
  createTask: 'tasks',
  updateTask: 'tasks',
  addNote: null, // Multi-entity — domain resolved per params
  createDocumentDraft: 'documents',
  updateDocumentMetadata: 'documents',
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
  LAWSUITS: 'lawsuits',
  TASKS: 'tasks',
  SESSIONS: 'sessions',
  DOCUMENTS: 'documents',
  PERSONAL_TASKS: 'personalTasks',
  MISSIONS: 'missions',
  FINANCIAL_ENTRIES: 'financialEntries',
  NOTIFICATIONS: 'notifications',
  HISTORY: 'history',
  WEB: 'web', // External web search (public information only)
  LEGAL: 'legal', // Legal research (jurisprudence, statutes, procedures)
});

/**
 * ENTITY_TYPE_DOMAIN_MAP
 *
 * Maps entity types (from universalMutation params) to data domains.
 * Used by GATE 6 to resolve domain for multi-domain tools.
 */
const ENTITY_TYPE_DOMAIN_MAP = Object.freeze({
  client: 'clients',
  dossier: 'dossiers',
  lawsuit: 'lawsuits',
  task: 'tasks',
  session: 'sessions',
  document: 'documents',
  personal_task: 'personalTasks',
  mission: 'missions',
  financial_entry: 'financialEntries',
  notification: 'notifications',
  history_event: 'history',
  officer: 'clients', // officers are client-domain entities
  note: null, // polymorphic — resolved from target entity
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
  checkPermission({ toolName, policy, context = {}, params = null }) {
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

    // GATE 3.5: External tools are blocked in all versions (placeholder for MCP)
    if (tool.category === TOOL_CATEGORIES.EXTERNAL) {
      const result = this._buildRejection({
        toolName,
        reason: 'EXTERNAL_TOOLS_DISABLED',
        message: `External tools are not yet available. Tool '${toolName}' is in the external category.`,
        policy,
        context,
        checks,
        tool,
      });
      this._logDecision(result);
      return result;
    }

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

    // GATE 4.5: Posture check — execute tools require matching posture
    if (tool.category === TOOL_CATEGORIES.EXECUTE && policy.requirePosture) {
      const currentPosture = context.posture || null;
      if (currentPosture !== policy.requirePosture) {
        const result = this._buildRejection({
          toolName,
          reason: 'POSTURE_MISMATCH',
          message: `Tool '${toolName}' requires posture ${policy.requirePosture}, current posture is ${currentPosture || 'NONE'}`,
          policy,
          context,
          checks,
          tool,
        });
        this._logDecision(result);
        return result;
      }

      checks.push({
        gate: 'POSTURE_CHECK',
        passed: true,
        message: `Posture ${currentPosture} matches required ${policy.requirePosture}`,
      });
    }

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
    } else if (toolDomain === null && params && context.dataAccess) {
      // Multi-domain tool (universalMutation, addNote) — resolve domains from params
      const entityTypes = _extractEntityTypes(params);
      for (const et of entityTypes) {
        const domain = ENTITY_TYPE_DOMAIN_MAP[et];
        if (domain && context.dataAccess[domain] === false) {
          const result = this._buildRejection({
            toolName,
            reason: 'DOMAIN_ACCESS_DENIED',
            message: `Access to ${domain} data is disabled (entity type: ${et}). Enable ${domain} access in the context panel to use this feature.`,
            policy,
            context,
            checks,
            tool,
            deniedDomain: domain,
          });
          this._logDecision(result);
          return result;
        }
      }

      checks.push({
        gate: 'DOMAIN_ACCESS_CHECK',
        passed: true,
        message: entityTypes.length > 0
          ? `Access to domains for [${entityTypes.join(', ')}] is permitted`
          : 'No domain restrictions specified (all domains allowed)',
      });
    } else if (toolDomain) {
      // No dataAccess in context = all domains allowed (backward compatibility)
      checks.push({
        gate: 'DOMAIN_ACCESS_CHECK',
        passed: true,
        message: 'No domain restrictions specified (all domains allowed)',
      });
    }

    // GATE 7: Delete adapter restriction — block DELETE_ENTITY if adapter forbids it
    if (params && params.operation === 'DELETE_ENTITY' && params.params && params.params.entityType) {
      try {
        const adapter = getAdapter(params.params.entityType);
        if (adapter.allowedDelete === false) {
          const result = this._buildRejection({
            toolName,
            reason: 'DELETE_NOT_ALLOWED',
            message: `Deletion is not allowed for entity type '${params.params.entityType}'. Use soft-delete or archive instead.`,
            policy,
            context,
            checks,
            tool,
          });
          this._logDecision(result);
          return result;
        }
      } catch (_) {
        // Unknown entity type — let downstream validation handle it
      }

      checks.push({
        gate: 'ADAPTER_DELETE_CHECK',
        passed: true,
        message: `Delete is allowed for ${params.params.entityType}`,
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
      universalMutation: 'listDossiers',
      createTask: 'listTasks',
      updateTask: 'getTask',
      addNote: 'getDossier',
      createDocumentDraft: 'getDossier',
      updateDocumentMetadata: 'getDossier',
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

/**
 * Extract entity types from universalMutation params for domain resolution.
 * @param {Object} params - Tool params (operation + params)
 * @returns {string[]} Unique entity types found
 * @private
 */
function _extractEntityTypes(params) {
  const types = new Set();
  const p = params.params || params;

  if (p.entityType) types.add(p.entityType);
  if (p.sourceType) types.add(p.sourceType);
  if (p.targetType) types.add(p.targetType);
  if (p.target && p.target.type) types.add(p.target.type);

  return [...types];
}

module.exports = {
  ToolFirewall,
  TOOL_DOMAIN_MAP,
  DATA_DOMAINS,
  ENTITY_TYPE_DOMAIN_MAP,
};
