"use strict";

const Ajv = require("ajv");
const addFormats = require("ajv-formats");

const classifyIntent = require("./intent.classifier");
const { INTENTS } = require("./intents");

const agentV1Policy = require("./policies/agent.v1.policy");
const agentV2Policy = require("./policies/agent.v2.policy");
const agentV3Policy = require("./policies/agent.v3.policy");

const RuleReasoner = require("./reasoners/rule.reasoner");
const AgentLedgerService = require("./ledger/agent.ledger.service");
const { initializeToolRegistry } = require("./tools");
const ToolFirewall = require("./tools/tool.firewall");

const explanationSchema = require("./schemas/explanation.schema.json");
const draftSchema = require("./schemas/draft.schema.json");
const riskSchema = require("./schemas/risk.schema.json");
const actionsSchema = require("./schemas/actions.schema.json");
const agentRequestSchema = require("./schemas/agentRequest.schema.json");
const agentResponseSchema = require("./schemas/agentResponse.schema.json");

const { createAgentRequest, extractAgentContext } = require("./contracts/agentRequest.contract");
const { createAgentResponse, RESPONSE_STATUS } = require("./contracts/agentResponse.contract");

class AgentEngine {
  constructor(options = {}) {
    this.policies = {
      v1: agentV1Policy,
      v2: agentV2Policy,
      v3: agentV3Policy,
    };

    this.reasoners = {
      rule: new RuleReasoner(),
    };

    this.ledger = options.ledgerService || new AgentLedgerService();

    // Initialize Tool Registry and Firewall
    this.toolRegistry = options.toolRegistry || initializeToolRegistry();
    this.toolFirewall = new ToolFirewall({
      registry: this.toolRegistry,
      ledger: this.ledger,
    });

    this.ajv = new Ajv({
      allErrors: true,
      removeAdditional: false,
      strict: true,
      allowUnionTypes: true,
    });
    addFormats(this.ajv);

    this.validators = {
      explanation: this.ajv.compile(explanationSchema),
      draft: this.ajv.compile(draftSchema),
      operational_risk_analysis: this.ajv.compile(riskSchema),
      action_plan: this.ajv.compile(actionsSchema),
      agent_request: this.ajv.compile(agentRequestSchema),
      agent_response: this.ajv.compile(agentResponseSchema),
    };
  }

  /**
   * Process UI request (with contract validation)
   *
   * This is the PRIMARY entry point for UI requests.
   * All UI requests MUST go through this method.
   *
   * @param {Object} uiRequest - Raw UI request
   * @returns {Promise<Object>} Validated agent response
   * @throws {Error} If request validation fails
   */
  async processUIRequest(uiRequest) {
    // STEP 1: Validate and create AgentRequest
    let agentRequest;
    try {
      agentRequest = createAgentRequest(uiRequest);
    } catch (validationError) {
      // Request validation failed - return FAILED response
      return createAgentResponse({
        requestId: uiRequest.requestId || 'unknown',
        agentVersion: uiRequest.agentVersion || 'v1',
        intent: uiRequest.intent || 'UNKNOWN',
        status: RESPONSE_STATUS.FAILED,
        errors: [{
          message: `Invalid request: ${validationError.message}`,
          code: 'INVALID_REQUEST',
          context: { originalError: validationError.message },
        }],
      });
    }

    // STEP 2: Log request to ledger
    this.ledger.record({
      type: 'ui_request_received',
      requestId: agentRequest.requestId,
      userId: agentRequest.userId,
      agentVersion: agentRequest.agentVersion,
      intent: agentRequest.intent,
      contextScope: agentRequest.contextScope,
      timestamp: new Date().toISOString(),
    });

    // STEP 3: Process request through Agent Engine
    let agentOutput;
    try {
      // Extract context from request
      const context = extractAgentContext(agentRequest);

      // Call existing run() method with transformed params
      agentOutput = await this.run({
        message: agentRequest.userMessage,
        context,
        agentVersion: agentRequest.agentVersion,
        reasoner: 'rule',
      });
    } catch (processingError) {
      // Agent processing failed - return FAILED response
      return createAgentResponse({
        requestId: agentRequest.requestId,
        agentVersion: agentRequest.agentVersion,
        intent: agentRequest.intent,
        status: RESPONSE_STATUS.FAILED,
        errors: [{
          message: `Agent processing failed: ${processingError.message}`,
          code: processingError.errorType || 'AGENT_ERROR',
          context: { originalError: processingError.message },
        }],
      });
    }

    // STEP 4: Transform agent output to AgentResponse
    let agentResponse;
    try {
      agentResponse = this._transformToAgentResponse(agentRequest, agentOutput);
    } catch (transformError) {
      // Response transformation failed - return FAILED response
      return createAgentResponse({
        requestId: agentRequest.requestId,
        agentVersion: agentRequest.agentVersion,
        intent: agentRequest.intent,
        status: RESPONSE_STATUS.FAILED,
        errors: [{
          message: `Response transformation failed: ${transformError.message}`,
          code: 'TRANSFORM_ERROR',
          context: { originalError: transformError.message },
        }],
      });
    }

    // STEP 5: Log response to ledger
    this.ledger.record({
      type: 'ui_response_sent',
      responseId: agentResponse.responseId,
      requestId: agentResponse.requestId,
      status: agentResponse.status,
      timestamp: new Date().toISOString(),
    });

    return agentResponse;
  }

  /**
   * Transform agent output to AgentResponse format
   * @param {Object} agentRequest - Original agent request
   * @param {Object} agentOutput - Agent output from run()
   * @returns {Object} Validated agent response
   * @private
   */
  _transformToAgentResponse(agentRequest, agentOutput) {
    const { intent, output } = agentOutput;

    // Build response based on intent and output type
    const responseData = {
      requestId: agentRequest.requestId,
      agentVersion: agentRequest.agentVersion,
      intent,
      status: RESPONSE_STATUS.SUCCESS,
    };

    // Map output to appropriate response fields
    if (output.type === 'explanation') {
      responseData.explanation = output;
    } else if (output.type === 'operational_risk_analysis') {
      responseData.risks = [output];
    } else if (['INVITATION', 'CLIENT_EMAIL', 'HEARING_SUMMARY', 'INTERNAL_NOTE'].includes(output.type)) {
      responseData.drafts = [output];
    } else if (output.type === 'action_plan') {
      responseData.actionProposals = output.actions || [];
    }

    return createAgentResponse(responseData);
  }

  /**
   * Propose a tool action (separated from execution)
   * @param {string} toolName - Name of the tool to call
   * @param {Object} params - Tool parameters
   * @param {Object} policy - Agent policy
   * @param {Object} context - Execution context
   * @returns {Object} Proposal result
   */
  proposeAction(toolName, params, policy, context = {}) {
    // Check permission through firewall
    const permission = this.toolFirewall.checkPermission({
      toolName,
      policy,
      context,
    });

    if (!permission.permitted) {
      return {
        proposed: true,
        permitted: false,
        toolName,
        params,
        reason: permission.reason,
        message: permission.message,
        suggestedAlternative: permission.suggestedAlternative,
      };
    }

    return {
      proposed: true,
      permitted: true,
      toolName,
      params,
      tool: permission.tool,
    };
  }

  /**
   * Execute a tool action (BLOCKED in v1/v2)
   * @param {string} toolName - Name of the tool to execute
   * @param {Object} params - Tool parameters
   * @param {Object} policy - Agent policy
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Execution result
   */
  async executeAction(toolName, params, policy, context = {}) {
    // CRITICAL: Check permission first
    const permission = this.toolFirewall.checkPermission({
      toolName,
      policy,
      context,
    });

    if (!permission.permitted) {
      const error = new Error(permission.message);
      error.status = 403;
      error.reason = permission.reason;
      error.toolName = toolName;
      error.suggestedAlternative = permission.suggestedAlternative;
      throw error;
    }

    // Get tool from registry
    const tool = this.toolRegistry.get(toolName);
    if (!tool) {
      const error = new Error(`Tool ${toolName} not found in registry`);
      error.status = 404;
      throw error;
    }

    // Execute tool handler
    try {
      const result = await tool.handler(params);

      // Log successful execution
      this.ledger.record({
        type: "tool_execution",
        toolName,
        params,
        result,
        success: true,
        policyVersion: policy.version,
        timestamp: new Date().toISOString(),
      });

      return {
        executed: true,
        toolName,
        result,
      };
    } catch (executionError) {
      // Log failed execution
      this.ledger.record({
        type: "tool_execution",
        toolName,
        params,
        error: executionError.message,
        success: false,
        policyVersion: policy.version,
        timestamp: new Date().toISOString(),
      });

      throw executionError;
    }
  }

  /**
   * Call a tool (checks permission, then executes if allowed)
   * @param {string} toolName - Name of the tool
   * @param {Object} params - Tool parameters
   * @param {Object} policy - Agent policy
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Tool result
   */
  async callTool(toolName, params, policy, context = {}) {
    const proposal = this.proposeAction(toolName, params, policy, context);

    if (!proposal.permitted) {
      const error = new Error(proposal.message);
      error.status = 403;
      error.reason = proposal.reason;
      error.toolName = toolName;
      error.suggestedAlternative = proposal.suggestedAlternative;
      throw error;
    }

    return this.executeAction(toolName, params, policy, context);
  }

  async run({
    message,
    context = {},
    agentVersion = "v1",
    reasoner: preferredReasoner,
  } = {}) {
    if (typeof message !== "string" || !message.trim()) {
      const error = new Error("message is required");
      error.status = 400;
      throw error;
    }

    const policy = this._resolvePolicy(agentVersion);
    this._assertExecutionIntent(context, policy);

    const intent = classifyIntent(message, context);
    this._ensureIntentAllowed(intent, policy);

    const reasoner = this._resolveReasoner(policy, preferredReasoner);
    const response = await this._executeIntent(intent, reasoner, {
      message,
      context,
    });

    this._validateAgainstSchema(intent, response);

    const schemaKey = this._schemaKeyForIntent(intent);
    const ledgerEntry = this.ledger.record({
      intent,
      agentVersion: policy.version,
      policySnapshot: {
        allowExecution: policy.allowExecution,
        allowExternalSearch: policy.allowExternalSearch,
        allowedIntents: policy.allowedIntents,
        allowedToolCategories: policy.allowedToolCategories,
        allowEnrichment: policy.allowEnrichment,
      },
      reasoner: reasoner.name,
      request: {
        message,
        context,
      },
      response,
      validation: {
        schema: schemaKey,
        valid: true,
        contractValidated: true,
        contractType: schemaKey,
      },
      execution: {
        permitted: policy.allowExecution,
        invoked: false,
      },
    });

    return {
      intent,
      agentVersion: policy.version,
      reasoner: reasoner.name,
      output: response,
      ledgerEntryId: ledgerEntry.id,
    };
  }

  _resolvePolicy(agentVersion) {
    const normalized = String(agentVersion || "").toLowerCase();
    const key = normalized.startsWith("v") ? normalized : `v${normalized}`;
    const policy = this.policies[key];
    if (!policy) {
      const error = new Error(`Unsupported agent version: ${agentVersion}`);
      error.status = 400;
      throw error;
    }
    return policy;
  }

  _resolveReasoner(policy, preferredReasoner) {
    const allowedReasoners = ["rule"];
    const preferred =
      typeof preferredReasoner === "string"
        ? preferredReasoner
        : policy.defaultReasoner;
    if (preferred && !allowedReasoners.includes(preferred)) {
      const error = new Error(
        `Reasoner ${preferred} is not permitted; only deterministic rule-based reasoner is enabled.`
      );
      error.status = 400;
      throw error;
    }
    return this.reasoners.rule;
  }

  _assertExecutionIntent(context, policy) {
    const requestedTools = (context && context.requestedTools) || [];
    const executionRequested = Boolean(context && context.execute === true);
    if (
      !policy.allowExecution &&
      (executionRequested ||
        (Array.isArray(requestedTools) && requestedTools.length))
    ) {
      const error = new Error(
        "Tool execution is not permitted for this agent version."
      );
      error.status = 400;
      throw error;
    }
  }

  _ensureIntentAllowed(intent, policy) {
    if (!policy.allowedIntents.includes(intent)) {
      const error = new Error(
        `Intent ${intent} is not permitted for agent version ${policy.version}.`
      );
      error.status = 400;
      throw error;
    }
  }

  async _executeIntent(intent, reasoner, payload) {
    const { message, context } = payload;
    switch (intent) {
      case INTENTS.EXPLAIN_ENTITY_STATE:
        return reasoner.explain({ message, context });
      case INTENTS.SUMMARIZE_SESSION:
        return reasoner.summarize({ message, context });
      case INTENTS.DRAFT_INVITATION:
        return reasoner.draft({ message, context, draftType: "invitation" });
      case INTENTS.DRAFT_CLIENT_EMAIL:
        return reasoner.draft({ message, context, draftType: "client_email" });
      case INTENTS.ANALYZE_OPERATIONAL_RISKS:
        return reasoner.analyzeRisks({ message, context });
      case INTENTS.PROPOSE_ACTIONS:
        return reasoner.proposeActions({ message, context });
      default: {
        const error = new Error(`Unsupported intent: ${intent}`);
        error.status = 400;
        throw error;
      }
    }
  }

  /**
   * Validate agent output against semantic contract
   * This is the HARD VALIDATION BOUNDARY - no coercion, no silent fixes
   * @param {string} contractType - Contract type (e.g., 'draft', 'operational_risk_analysis')
   * @param {Object} output - Agent output to validate
   * @param {Object} context - Validation context (for logging)
   * @returns {boolean} true if valid
   * @throws {Error} if validation fails (FAILS ENTIRE RESPONSE)
   */
  _validateContract(contractType, output, context = {}) {
    const validator = this.validators[contractType];
    if (!validator) {
      const error = new Error(`No validator for contract: ${contractType}`);
      error.status = 500;
      error.errorType = "NO_VALIDATOR";
      throw error;
    }

    const valid = validator(output);
    if (!valid) {
      // Log contract validation failure
      this.ledger.record({
        type: "contract_validation_failure",
        contract: contractType,
        validationErrors: validator.errors,
        output: output,
        context: context,
        timestamp: new Date().toISOString(),
      });

      // Debug log: print the offending object and errors
      // eslint-disable-next-line no-console
      console.error("=== CONTRACT VALIDATION ERROR ===");
      console.error("Contract:", contractType);
      console.error("Output object:", JSON.stringify(output, null, 2));
      console.error("Validation errors:", validator.errors);
      // End debug log

      const error = new Error(
        `Contract validation failed: ${this.ajv.errorsText(validator.errors)}`
      );
      error.status = 500;
      error.errorType = "CONTRACT_VALIDATION_FAILED";
      error.contract = contractType;
      error.validationErrors = validator.errors;
      throw error; // FAIL ENTIRE RESPONSE - NO PARTIAL SUCCESS
    }

    // Log contract validation success
    this.ledger.record({
      type: "contract_validation_success",
      contract: contractType,
      timestamp: new Date().toISOString(),
    });

    return true;
  }

  _validateAgainstSchema(intent, output) {
    const schemaKey = this._schemaKeyForIntent(intent);

    // Use contract validation boundary
    this._validateContract(schemaKey, output, { intent });
  }

  _schemaKeyForIntent(intent) {
    if (
      intent === INTENTS.EXPLAIN_ENTITY_STATE ||
      intent === INTENTS.SUMMARIZE_SESSION
    ) {
      return "explanation";
    }
    if (
      intent === INTENTS.DRAFT_INVITATION ||
      intent === INTENTS.DRAFT_CLIENT_EMAIL
    ) {
      return "draft";
    }
    if (intent === INTENTS.ANALYZE_OPERATIONAL_RISKS) {
      return "operational_risk_analysis"; // Updated to match schema key
    }
    if (intent === INTENTS.PROPOSE_ACTIONS) {
      return "action_plan";
    }
    return "explanation";
  }
}

module.exports = AgentEngine;
