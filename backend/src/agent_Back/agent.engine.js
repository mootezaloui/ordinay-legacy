"use strict";

/**
 * Agent Engine
 *
 * Service container for the agent runtime.
 * Provides context management, tool execution, proposal lifecycle, and entity resolution.
 *
 * RECONSTRUCTED: Original file was deleted during pipeline migration.
 * The pipeline-specific code (pipeline.js, planner.js, executor.js, stages/*) has been removed.
 * This class is now a lean service container used by agent.router.js and orchestrator.
 *
 * Consumers access via:
 *   - agentEngine.contextStore   — ConversationContextStore
 *   - agentEngine.scopeManager   — ConversationScopeManager
 *   - agentEngine.ledger         — AgentLedgerService
 *   - agentEngine.toolRegistry   — ToolRegistry
 *   - agentEngine.ajv            — Ajv instance
 *   - agentEngine.*()            — Methods below
 */

const Ajv = require("ajv");
const addFormats = require("ajv-formats");

const ConversationContextStore = require("./context/conversation.context");
const { ConversationScopeManager } = require("./context/conversationScopeManager");
const AgentLedgerService = require("./ledger/agent.ledger.service");
const { initializeToolRegistry } = require("./tools/index");
const { ToolFirewall } = require("./tools/tool.firewall");
const { executeToolV2 } = require("./engine/toolRuntime");

const agentV1Policy = require("./policies/agent.v1.policy");
const agentV2Policy = require("./policies/agent.v2.policy");
const agentV3Policy = require("./policies/agent.v3.policy");

class AgentEngine {
  constructor() {
    this.ledger = new AgentLedgerService();
    this.contextStore = new ConversationContextStore();

    this.toolRegistry = initializeToolRegistry();
    this.toolFirewall = new ToolFirewall({
      registry: this.toolRegistry,
      ledger: this.ledger,
    });

    this.scopeManager = new ConversationScopeManager({
      contextStore: this.contextStore,
      ledger: this.ledger,
    });

    const ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });
    addFormats(ajv);
    this.ajv = ajv;

    // In-memory proposal store keyed by proposalId
    this._proposals = new Map();
  }

  // ─── Policy Resolution ────────────────────────────────────────────────────

  /**
   * Resolve policy object for the given agent version string.
   * @param {string} version - "v1" | "v2" | "v3"
   * @returns {Object} Policy object
   */
  _resolvePolicy(version) {
    if (String(version || "").toLowerCase() === "v1") return agentV1Policy;
    if (String(version || "").toLowerCase() === "v2") return agentV2Policy;
    return agentV3Policy;
  }

  // ─── Tool Execution ───────────────────────────────────────────────────────

  /**
   * Execute a tool with full V2 validation, firewall, and ledger tracing.
   * Delegates to engine/toolRuntime.js (which uses `this` bindings).
   *
   * @param {string} toolName
   * @param {Object} params
   * @param {Object} policy
   * @param {Object} [context]
   * @returns {Promise<{ result, trace }>}
   */
  async executeToolV2(toolName, params, policy, context = {}) {
    return executeToolV2.call(this, toolName, params, policy, context);
  }

  /**
   * Call a read tool handler directly, bypassing V2 schema validation.
   * Used by orchestrator for internal read operations.
   *
   * @param {string} toolName
   * @param {Object} params
   * @param {Object} policy
   * @returns {Promise<any>}
   */
  async _callReadTool(toolName, params, policy) {
    const tool = this.toolRegistry.get(toolName);
    if (!tool) {
      const err = new Error(`Tool ${toolName} not found in registry`);
      err.status = 404;
      err.code = "TOOL_NOT_FOUND";
      throw err;
    }
    return tool.handler(params, { ledger: this.ledger });
  }

  // ─── Proposal Lifecycle ───────────────────────────────────────────────────

  /**
   * Store a proposal in memory for later confirmation.
   *
   * @param {Object} proposal - Action proposal object with proposalId
   * @param {Object} [metadata] - Audit metadata (conversationId, sessionId, userId, etc.)
   */
  storeProposal(proposal, metadata = {}) {
    if (!proposal || !proposal.proposalId) return;
    this._proposals.set(proposal.proposalId, {
      proposal,
      metadata,
      storedAt: new Date().toISOString(),
    });
    this.ledger.record({
      type: "proposal_stored",
      proposalId: proposal.proposalId,
      actionType: proposal.actionType,
      sessionId: metadata.sessionId || null,
      conversationId: metadata.conversationId || null,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Confirm a stored proposal and execute the underlying tool.
   *
   * @param {Object} params
   * @param {string} params.proposalId
   * @param {string} [params.sessionId]
   * @param {string} [params.userId]
   * @param {boolean} [params.ackRisk]
   * @returns {Promise<Object>}
   */
  async confirmProposal({ proposalId, sessionId, userId, ackRisk = false } = {}) {
    if (!proposalId) {
      const err = new Error("proposalId is required");
      err.status = 400;
      err.code = "PROPOSAL_ID_REQUIRED";
      throw err;
    }

    const stored = this._proposals.get(proposalId);
    if (!stored) {
      const err = new Error(`Proposal ${proposalId} not found or already executed`);
      err.status = 404;
      err.code = "PROPOSAL_NOT_FOUND";
      throw err;
    }

    const { proposal, metadata } = stored;

    const policy = this._resolvePolicy(proposal.version || "v3");

    const { result, trace } = await executeToolV2.call(this, proposal.actionType, proposal.params, policy, {
      confirmed: true,
      sessionId: sessionId || proposal.sessionId || metadata?.sessionId || null,
      userId: userId || metadata?.userId || null,
      ackRisk: ackRisk === true,
      proposalId,
      conversationId: metadata?.conversationId || null,
    });

    this._proposals.delete(proposalId);

    this.ledger.record({
      type: "proposal_confirmed",
      proposalId,
      actionType: proposal.actionType,
      sessionId: sessionId || null,
      userId: userId || null,
      timestamp: new Date().toISOString(),
    });

    return { ...result, proposalId, trace };
  }

  /**
   * Clear pending mutation proposal state for a session.
   *
   * @param {Object} params
   * @param {string} params.sessionId - Used as conversationId in operational store
   * @param {string} [params.userId]
   */
  clearPendingMutationProposal({ sessionId, userId } = {}) {
    const effectiveUserId = String(userId || "default");
    const conversationId = sessionId;
    if (!conversationId) return;
    try {
      this.contextStore._operationalStore.update(effectiveUserId, conversationId, {
        pendingMutationProposal: null,
        suppressMutationDetectionUntilResolved: false,
      });
    } catch (_) {
      // best-effort
    }
  }

  // ─── Pending Operation Lifecycle ──────────────────────────────────────────

  /**
   * Get current pending operation for the request context.
   *
   * @param {Object} requestContext
   * @returns {Object|null}
   */
  getPendingOperation(requestContext) {
    const userId = requestContext?.userId || "default";
    const conversationId = requestContext?.conversationId ?? requestContext?.agentSessionId ?? null;
    if (!conversationId) return null;
    const ctx = this.contextStore._operationalStore.get(userId, conversationId);
    return ctx?.pendingOperation || null;
  }

  /**
   * Begin a pending operation and store it in operational context.
   *
   * @param {Object} requestContext
   * @param {Object} descriptor - Operation descriptor from buildDocumentGenerationPendingDescriptor etc.
   * @returns {Object|null} The created pending operation
   */
  beginPendingOperation(requestContext, descriptor) {
    const userId = requestContext?.userId || "default";
    const conversationId = requestContext?.conversationId ?? requestContext?.agentSessionId ?? null;
    if (!conversationId) return null;

    const id = `pop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const pendingOperation = {
      id,
      ...descriptor,
      status: "pending_resolution",
      createdAt: new Date().toISOString(),
    };

    this.contextStore._operationalStore.update(userId, conversationId, { pendingOperation });

    this.ledger.record({
      type: "pending_operation_started",
      pendingOperationId: id,
      operationType: descriptor?.operationType || null,
      conversationId,
      timestamp: new Date().toISOString(),
    });

    return pendingOperation;
  }

  /**
   * Clear (cancel) a pending operation.
   *
   * @param {Object} requestContext
   * @param {string} [reason]
   */
  clearPendingOperation(requestContext, reason) {
    const userId = requestContext?.userId || "default";
    const conversationId = requestContext?.conversationId ?? requestContext?.agentSessionId ?? null;
    if (!conversationId) return;

    const existing = this.getPendingOperation(requestContext);
    this.contextStore._operationalStore.update(userId, conversationId, { pendingOperation: null });

    this.ledger.record({
      type: "pending_operation_cleared",
      pendingOperationId: existing?.id || null,
      operationType: existing?.operationType || null,
      reason: reason || "explicit",
      conversationId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Apply user resolution input (message / followUpIntent) to a pending operation.
   * Attempts to resolve required bindings.
   *
   * @param {Object} requestContext
   * @param {string} message - User message
   * @param {Object|null} followUpIntent - Follow-up intent with resolved entity info
   * @returns {Promise<Object|null>} Updated pending operation
   */
  async applyResolutionInput(requestContext, message, followUpIntent) {
    const userId = requestContext?.userId || "default";
    const conversationId = requestContext?.conversationId ?? requestContext?.agentSessionId ?? null;
    const pending = this.getPendingOperation(requestContext);
    if (!pending || !conversationId) return null;

    const resolvedBindings = { ...(pending.resolvedBindings || {}) };

    // If followUpIntent carries entity resolution, apply it
    if (followUpIntent?.entityType && followUpIntent?.entityId) {
      resolvedBindings[followUpIntent.entityType] = {
        type: followUpIntent.entityType,
        id: followUpIntent.entityId,
        label: followUpIntent.entityLabel || null,
        source: "follow_up_intent",
      };
    }

    const updated = {
      ...pending,
      resolvedBindings,
      lastResolutionMessage: message || null,
      updatedAt: new Date().toISOString(),
    };

    this.contextStore._operationalStore.update(userId, conversationId, { pendingOperation: updated });
    return updated;
  }

  /**
   * Check if a pending operation has all required bindings resolved and can resume.
   *
   * @param {Object|null} pending
   * @returns {boolean}
   */
  canResumePendingOperation(pending) {
    if (!pending) return false;
    const required = Array.isArray(pending.requiredBindings) ? pending.requiredBindings : [];
    if (required.length === 0) return true;
    const resolved = pending.resolvedBindings || {};
    return required.every((binding) => {
      const match = resolved[binding.entityType];
      return match && match.id;
    });
  }

  /**
   * Resume a pending operation using the provided type-specific handlers.
   *
   * @param {Object} requestContext
   * @param {Object} handlers - Map of operationType → async handler({ pendingOperation, executionDescriptor })
   * @returns {Promise<Object|null>} Handler result or null
   */
  async resumePendingOperation(requestContext, handlers) {
    const pending = this.getPendingOperation(requestContext);
    if (!pending) return null;

    const operationType = String(pending.operationType || "").toLowerCase();
    const handler = handlers && handlers[operationType];
    if (typeof handler !== "function") return null;

    try {
      const result = await handler({
        pendingOperation: pending,
        executionDescriptor: pending.executionDescriptor,
      });
      if (result) {
        this.clearPendingOperation(requestContext, "resumed");
      }
      return result;
    } catch (_) {
      return null;
    }
  }

  // ─── Entity Resolution ────────────────────────────────────────────────────

  /**
   * Resolve an entity by name/reference or numeric ID.
   * Used by orchestrator to resolve ambiguous entity hints.
   *
   * @param {Object} params
   * @param {string} params.entityType
   * @param {string} params.identifier - Name, reference, or numeric ID string
   * @param {string} [params.mode] - Resolution mode hint
   * @param {number|null} [params.scopeClientId] - Client scope for dossier resolution
   * @param {Object} policy
   * @returns {Promise<{ found: boolean, entityId: number|null, entityType: string, entityLabel: string|null, reason: string }>}
   */
  async resolveEntity({ entityType, identifier, mode, scopeClientId } = {}, policy) {
    const type = String(entityType || "").trim().toLowerCase();
    const idStr = String(identifier || "").trim();

    if (!type || !idStr) {
      return { found: false, entityId: null, entityType: type, entityLabel: null, reason: "missing_params" };
    }

    // ── Try numeric ID directly ──────────────────────────────────────────
    if (/^\d+$/.test(idStr)) {
      const numId = parseInt(idStr, 10);
      const getToolMap = {
        client: "getClient",
        dossier: "getDossier",
        lawsuit: "getLawsuit",
        task: "getTask",
        session: "getSession",
        mission: "getMission",
        personal_task: "getPersonalTask",
        financial_entry: "getFinancialEntry",
        officer: "getOfficer",
      };
      const toolName = getToolMap[type];
      if (toolName) {
        try {
          const result = await this._callReadTool(toolName, { id: numId }, policy);
          if (result && result.id) {
            const label = result.name || result.title || result.reference || result.lawsuit_number || null;
            return { found: true, entityId: numId, entityType: type, entityLabel: label, reason: "exact_id" };
          }
        } catch (_) {}
      }
      return { found: false, entityId: null, entityType: type, entityLabel: null, reason: "not_found" };
    }

    // ── Try name/reference search ────────────────────────────────────────
    const tableMap = {
      client: { table: "clients", labelField: "name", searchFields: ["name"] },
      dossier: { table: "dossiers", labelField: "title", searchFields: ["title", "reference"] },
      lawsuit: { table: "lawsuits", labelField: "title", searchFields: ["title", "lawsuit_number"] },
      task: { table: "tasks", labelField: "title", searchFields: ["title"] },
      session: { table: "sessions", labelField: "title", searchFields: ["title"] },
      mission: { table: "missions", labelField: "title", searchFields: ["title"] },
    };

    const mapping = tableMap[type];
    if (!mapping) {
      return { found: false, entityId: null, entityType: type, entityLabel: null, reason: "unsupported_type" };
    }

    try {
      const db = require("../db/connection");
      const searchLower = `%${idStr.toLowerCase()}%`;
      const searchParams = mapping.searchFields.map(() => searchLower);
      const whereConditions = mapping.searchFields.map((f) => `LOWER(${f}) LIKE ?`).join(" OR ");

      // Scope-constrained search (dossier by client)
      if (scopeClientId && type === "dossier") {
        const scopedRows = db
          .prepare(
            `SELECT id, ${mapping.labelField} FROM ${mapping.table} WHERE deleted_at IS NULL AND (${whereConditions}) AND client_id = ?`,
          )
          .all(...searchParams, scopeClientId);
        if (scopedRows.length === 1) {
          return {
            found: true,
            entityId: scopedRows[0].id,
            entityType: type,
            entityLabel: scopedRows[0][mapping.labelField] || null,
            reason: "name_resolution_exact_unique",
          };
        }
      }

      // Global search
      const rows = db
        .prepare(
          `SELECT id, ${mapping.labelField} FROM ${mapping.table} WHERE deleted_at IS NULL AND (${whereConditions})`,
        )
        .all(...searchParams);

      if (rows.length === 1) {
        return {
          found: true,
          entityId: rows[0].id,
          entityType: type,
          entityLabel: rows[0][mapping.labelField] || null,
          reason: "name_resolution_exact_unique",
        };
      }

      if (rows.length > 1) {
        return { found: false, entityId: null, entityType: type, entityLabel: null, reason: "ambiguous" };
      }
    } catch (_) {}

    return { found: false, entityId: null, entityType: type, entityLabel: null, reason: "not_found" };
  }
}

module.exports = AgentEngine;
