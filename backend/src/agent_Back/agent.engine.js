"use strict";

const Ajv = require("ajv");
const addFormats = require("ajv-formats");

const classifyIntent = require("./intent.classifier");
const {
  detectDataRequirements,
  DATA_REQUIREMENTS,
  isSlashCommand,
  parseSlashCommand,
  getAvailableCommands,
  detectReadIntent,
  READ_INTENTS,
  detectFollowUp,
  FOLLOW_UP_TYPES,
  hasExplicitEntityMention,
  detectEntityType,
} = require("./intent.classifier");
const ConversationContextStore = require("./context/conversation.context");
const {
  ACTION_TYPES,
  CONTEXT_SOURCES,
} = require("./context/conversation.context");
const { INTENTS } = require("./intents");

const agentV1Policy = require("./policies/agent.v1.policy");
const agentV2Policy = require("./policies/agent.v2.policy");
const agentV3Policy = require("./policies/agent.v3.policy");

const RuleReasoner = require("./reasoners/rule.reasoner");
const AgentLedgerService = require("./ledger/agent.ledger.service");
const { initializeToolRegistry } = require("./tools");
const {
  ToolFirewall,
  DATA_DOMAINS,
  TOOL_DOMAIN_MAP,
} = require("./tools/tool.firewall");

const chatSchema = require("./schemas/chat.schema.json");
const explanationSchema = require("./schemas/explanation.schema.json");
const draftSchema = require("./schemas/draft.schema.json");
const riskSchema = require("./schemas/risk.schema.json");
const actionsSchema = require("./schemas/actions.schema.json");
const agentRequestSchema = require("./schemas/agentRequest.schema.json");
const agentResponseSchema = require("./schemas/agentResponse.schema.json");

const {
  createAgentRequest,
  extractAgentContext,
} = require("./contracts/agentRequest.contract");
const {
  createAgentResponse,
  RESPONSE_STATUS,
} = require("./contracts/agentResponse.contract");

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

    // Initialize Conversation Context Store for follow-up handling
    this.contextStore = options.contextStore || new ConversationContextStore();

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
      chat: this.ajv.compile(chatSchema),
      explanation: this.ajv.compile(explanationSchema),
      draft: this.ajv.compile(draftSchema),
      operational_risk_analysis: this.ajv.compile(riskSchema),
      action_plan: this.ajv.compile(actionsSchema),
      agent_request: this.ajv.compile(agentRequestSchema),
      agent_response: this.ajv.compile(agentResponseSchema),
    };
  }

  /**
   * DOMAIN ACCESS CHECK
   *
   * Checks if a data domain is accessible based on context.dataAccess permissions.
   * This is the AUTHORITATIVE enforcement point for data access control.
   *
   * @param {string} domain - Domain to check (clients, dossiers, lawsuits, tasks, sessions, etc.)
   * @param {Object} context - Request context containing dataAccess permissions
   * @returns {{ permitted: boolean, message?: string }} Check result
   * @private
   */
  _checkDomainAccess(domain, context) {
    // If no dataAccess in context, allow all (backward compatibility)
    if (!context || !context.dataAccess) {
      return { permitted: true };
    }

    const domainEnabled = context.dataAccess[domain];

    // If domain is explicitly disabled, block
    if (domainEnabled === false) {
      this.ledger.record({
        type: "domain_access_denied",
        domain,
        dataAccess: context.dataAccess,
        timestamp: new Date().toISOString(),
      });

      return {
        permitted: false,
        message: `Access to ${domain} data is disabled. Enable ${domain} access in the Context panel to use this feature.`,
      };
    }

    return { permitted: true };
  }

  /**
   * Generate a domain access denied response
   *
   * @param {string} domain - Domain that was denied
   * @param {string} message - Denial message
   * @param {Object} policy - Current policy
   * @returns {Object} Formatted response
   * @private
   */
  _generateDomainDeniedResponse(domain, message, policy) {
    return {
      intent: "ACCESS_DENIED",
      agentVersion: policy.version,
      reasoner: "domain-firewall",
      output: {
        type: "explanation",
        entityId: "domain_access_denied",
        entityType: "security",
        summary: message,
        details: [
          `The ${domain} domain is currently disabled in your data access settings.`,
          "",
          "To access this data:",
          "1. Open the Context panel (right sidebar)",
          `2. Enable access to "${domain}"`,
          "3. Try your request again",
        ],
        timestamp: new Date().toISOString(),
        confidence: 1,
        sources: [
          {
            sourceType: "system",
            reference: "domain_firewall",
            note: "Data access permission check",
          },
        ],
        status: "blocked",
        source: "domain-firewall",
        requires_validation: false,
      },
      isAccessDenied: true,
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
        requestId: uiRequest.requestId || "unknown",
        agentVersion: uiRequest.agentVersion || "v1",
        intent: uiRequest.intent || "UNKNOWN",
        status: RESPONSE_STATUS.FAILED,
        errors: [
          {
            message: `Invalid request: ${validationError.message}`,
            code: "INVALID_REQUEST",
            context: { originalError: validationError.message },
          },
        ],
      });
    }

    // STEP 2: Log request to ledger
    this.ledger.record({
      type: "ui_request_received",
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
        reasoner: "rule",
      });
    } catch (processingError) {
      // Agent processing failed - return FAILED response
      return createAgentResponse({
        requestId: agentRequest.requestId,
        agentVersion: agentRequest.agentVersion,
        intent: agentRequest.intent,
        status: RESPONSE_STATUS.FAILED,
        errors: [
          {
            message: `Agent processing failed: ${processingError.message}`,
            code: processingError.errorType || "AGENT_ERROR",
            context: { originalError: processingError.message },
          },
        ],
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
        errors: [
          {
            message: `Response transformation failed: ${transformError.message}`,
            code: "TRANSFORM_ERROR",
            context: { originalError: transformError.message },
          },
        ],
      });
    }

    // STEP 5: Log response to ledger
    this.ledger.record({
      type: "ui_response_sent",
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
    if (output.type === "chat") {
      responseData.chat = output;
    } else if (output.type === "explanation") {
      responseData.explanation = output;
    } else if (output.type === "operational_risk_analysis") {
      responseData.risks = [output];
    } else if (
      [
        "INVITATION",
        "CLIENT_EMAIL",
        "HEARING_SUMMARY",
        "INTERNAL_NOTE",
      ].includes(output.type)
    ) {
      responseData.drafts = [output];
    } else if (output.type === "action_plan") {
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

    // STEP: Check for slash commands BEFORE intent classification
    if (isSlashCommand(message)) {
      const result = await this._executeSlashCommand(message, context, policy);
      // Update conversation context after slash command
      this._updateConversationContext(
        context,
        message,
        result,
        CONTEXT_SOURCES.SLASH_COMMAND,
      );
      return result;
    }

    // ========== FOLLOW-UP INTENT GATE ==========
    // Detect follow-up messages BEFORE regular intent classification
    const followUpDetection = detectFollowUp(message, context);
    if (followUpDetection && followUpDetection.isFollowUp) {
      const followUpResult = await this._handleFollowUp(
        followUpDetection,
        message,
        context,
        policy,
      );
      if (followUpResult) {
        return followUpResult;
      }
      // If follow-up handling returns null, continue to regular processing
    }
    // ========== END FOLLOW-UP INTENT GATE ==========

    // ========== READ INTENT GATE ==========
    // Rule-based detection BEFORE LLM - ensures data questions always access local data
    const readIntent = detectReadIntent(message, context);
    if (
      readIntent &&
      readIntent.requiresLocalData &&
      policy.allowedToolCategories.includes("read")
    ) {
      this.ledger.record({
        type: "read_intent_gate_triggered",
        intent: readIntent.intent,
        allowedTools: readIntent.allowedTools,
        timestamp: new Date().toISOString(),
      });

      const readResult = await this._executeReadIntent(
        readIntent,
        message,
        context,
        policy,
      );
      // Update conversation context after read intent execution
      this._updateConversationContext(
        context,
        message,
        readResult,
        CONTEXT_SOURCES.READ_INTENT,
      );
      return readResult;
    }
    // ========== END READ INTENT GATE ==========

    const intent = await classifyIntent(message, context);
    this._ensureIntentAllowed(intent, policy);

    // STEP: Detect data requirements and fetch local data if needed
    const dataReqs = detectDataRequirements(message, context);
    let enrichedContext = context;

    if (
      dataReqs.requiresData &&
      policy.allowedToolCategories.includes("read")
    ) {
      // Log data requirement detection
      this.ledger.record({
        type: "data_requirements_detected",
        requiresData: true,
        needs: dataReqs.needs,
        entityHints: dataReqs.entityHints,
        timestamp: new Date().toISOString(),
      });

      // Check for entity resolution failures that require clarification
      const fetchedData = await this._fetchRequiredData(
        dataReqs,
        context,
        policy,
      );

      // If there are ambiguous resolutions, return clarification request
      // This is returned as an explanation type to pass schema validation
      const ambiguousFailures = fetchedData.resolution.failed.filter(
        (f) => f.reason === "ambiguous",
      );
      if (ambiguousFailures.length > 0) {
        const clarification = ambiguousFailures[0];

        // Log clarification needed
        this.ledger.record({
          type: "clarification_required",
          reason: "ambiguous_entity",
          candidates: clarification.candidates,
          timestamp: new Date().toISOString(),
        });

        // Return as explanation type (passes schema validation)
        const clarificationOutput = {
          type: "explanation",
          entityId: "pending_clarification",
          entityType: "query",
          summary: clarification.message,
          details: [
            "Multiple matches were found for your query.",
            "Please specify which one you mean:",
            ...clarification.candidates.map(
              (c) => `  - ${c.name} (ID: ${c.id})`,
            ),
          ],
          timestamp: new Date().toISOString(),
          confidence: 0,
          sources: [
            {
              sourceType: "context",
              reference: "entity_resolution",
              note: "Awaiting user clarification",
            },
          ],
          status: "pending_clarification",
          source: "rule-based",
          requires_validation: false,
        };

        // Skip schema validation for clarification responses
        this.ledger.record({
          intent,
          agentVersion: policy.version,
          policySnapshot: {
            allowExecution: policy.allowExecution,
            allowedIntents: policy.allowedIntents,
          },
          reasoner: "rule",
          request: { message, context },
          response: clarificationOutput,
          needsClarification: true,
        });

        return {
          intent,
          agentVersion: policy.version,
          reasoner: "rule",
          output: clarificationOutput,
          needsClarification: true,
        };
      }

      // Build enriched context with fetched data
      enrichedContext = this._buildEnrichedContext(
        context,
        fetchedData,
        dataReqs,
      );

      // Log successful data enrichment
      this.ledger.record({
        type: "context_enriched",
        entitiesFetched: Object.keys(fetchedData.entities),
        listsFetched: Object.keys(fetchedData.lists),
        resolutionStats: fetchedData.resolution,
        timestamp: new Date().toISOString(),
      });
    }

    const reasoner = this._resolveReasoner(policy, preferredReasoner);
    const response = await this._executeIntent(intent, reasoner, {
      message,
      context: enrichedContext,
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
        `Reasoner ${preferred} is not permitted; only deterministic rule-based reasoner is enabled.`,
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
        "Tool execution is not permitted for this agent version.",
      );
      error.status = 400;
      throw error;
    }
  }

  _ensureIntentAllowed(intent, policy) {
    if (!policy.allowedIntents.includes(intent)) {
      const error = new Error(
        `Intent ${intent} is not permitted for agent version ${policy.version}.`,
      );
      error.status = 400;
      throw error;
    }
  }

  async _executeIntent(intent, reasoner, payload) {
    const { message, context } = payload;
    switch (intent) {
      case INTENTS.GENERAL_CHAT:
        return reasoner.chat({ message, context });
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
        `Contract validation failed: ${this.ajv.errorsText(validator.errors)}`,
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
    if (intent === INTENTS.GENERAL_CHAT) {
      return "chat";
    }
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

  /**
   * Execute a slash command
   * Bypasses LLM intent classification - deterministic tool execution
   *
   * @param {string} message - Slash command message
   * @param {Object} context - Request context
   * @param {Object} policy - Current agent policy
   * @returns {Promise<Object>} Command result
   * @private
   */
  async _executeSlashCommand(message, context, policy) {
    const parsed = parseSlashCommand(message);

    // Log command attempt
    this.ledger.record({
      type: "slash_command_received",
      command: parsed.command,
      valid: parsed.valid,
      args: parsed.args,
      timestamp: new Date().toISOString(),
    });

    // Handle invalid commands
    if (!parsed.valid) {
      return {
        intent: "COMMAND",
        agentVersion: policy.version,
        reasoner: "command",
        output: {
          type: "explanation",
          entityId: "command_error",
          entityType: "command",
          summary: parsed.error,
          details: parsed.suggestion
            ? [parsed.suggestion]
            : parsed.availableCommands
              ? [
                  "Available commands:",
                  ...parsed.availableCommands.map((c) => `  ${c}`),
                ]
              : [],
          timestamp: new Date().toISOString(),
          confidence: 1,
          sources: [
            {
              sourceType: "system",
              reference: "command_parser",
              note: "Slash command validation",
            },
          ],
          status: "error",
          source: "command-parser",
          requires_validation: false,
        },
        isCommand: true,
      };
    }

    // Handle /help command specially
    if (parsed.commandKey === "help") {
      const commands = getAvailableCommands();
      const grouped = {};
      commands.forEach((cmd) => {
        if (!grouped[cmd.category]) grouped[cmd.category] = [];
        grouped[cmd.category].push(cmd);
      });

      const details = ["Available commands:"];
      Object.entries(grouped).forEach(([category, cmds]) => {
        if (category !== "help") {
          details.push("");
          details.push(
            `${category.charAt(0).toUpperCase() + category.slice(1)}:`,
          );
          cmds.forEach((cmd) => {
            details.push(`  ${cmd.usage} - ${cmd.description}`);
          });
        }
      });

      return {
        intent: "COMMAND",
        agentVersion: policy.version,
        reasoner: "command",
        output: {
          type: "explanation",
          entityId: "help",
          entityType: "command",
          summary: "Slash Command Reference",
          details,
          timestamp: new Date().toISOString(),
          confidence: 1,
          sources: [
            {
              sourceType: "system",
              reference: "command_registry",
              note: "Available slash commands",
            },
          ],
          status: "complete",
          source: "command-parser",
          requires_validation: false,
        },
        isCommand: true,
      };
    }

    // Execute command using READ intent pipeline
    try {
      const result = await this._executeCommandTools(
        parsed,
        context,
        policy,
        message,
      );

      this.ledger.record({
        type: "slash_command_executed",
        command: parsed.command,
        success: true,
        timestamp: new Date().toISOString(),
      });

      return {
        ...result,
        isCommand: true,
      };
    } catch (err) {
      this.ledger.record({
        type: "slash_command_error",
        command: parsed.command,
        error: err.message,
        timestamp: new Date().toISOString(),
      });

      return {
        intent: "COMMAND",
        agentVersion: policy.version,
        reasoner: "command",
        output: {
          type: "explanation",
          entityId: "command_error",
          entityType: "command",
          summary: `Command failed: ${err.message}`,
          details: [
            "The command could not be executed.",
            "Please try again or use /help for available commands.",
          ],
          timestamp: new Date().toISOString(),
          confidence: 1,
          sources: [{ sourceType: "system", reference: "command-parser" }],
          status: "error",
          source: "command-parser",
          requires_validation: false,
        },
        isCommand: true,
      };
    }
  }

  /**
   * Execute a READ intent (deterministic data access)
   * This bypasses LLM for intent classification - data is retrieved first
   * LLM is only used for formatting/explanation after data is retrieved
   *
   * CRITICAL: Domain access is checked BEFORE any database queries.
   * If the required domain is disabled, the intent is BLOCKED.
   *
   * @param {Object} readIntent - Detected READ intent from detectReadIntent()
   * @param {string} message - Original user message
   * @param {Object} context - Request context
   * @param {Object} policy - Current agent policy
   * @returns {Promise<Object>} Data response
   * @private
  */
  async _executeReadIntent(readIntent, message, context, policy) {
    const { intent, entityHints = [], filters = {} } = readIntent;
    const now = new Date();
    const scope = String(context?.scope || "").toLowerCase();

    const formatDate = (value) =>
      value ? new Date(value).toISOString().slice(0, 10) : "N/A";
    const formatDateTime = (value) =>
      value
        ? new Date(value).toISOString().replace("T", " ").slice(0, 16)
        : "N/A";

    const parsePayload = (value) => {
      if (value === null || value === undefined) return {};
      if (typeof value === "object") return value;
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value);
          if (parsed && typeof parsed === "object") return parsed;
        } catch (err) {
          return { value };
        }
      }
      return { value };
    };

    const getHintValue = (type, entityType = null) => {
      const hint = entityHints.find(
        (item) =>
          item.type === type &&
          (!entityType || !item.entityType || item.entityType === entityType),
      );
      return hint ? hint.value : null;
    };

    const isFinancialOverdue = (entry) =>
      entry?.due_date &&
      !entry?.paid_at &&
      new Date(entry.due_date) < now;

    const isMissionOverdue = (mission) =>
      mission?.due_date &&
      !["done", "completed", "closed", "cancelled"].includes(
        String(mission.status || "").toLowerCase(),
      ) &&
      new Date(mission.due_date) < now;

    const isSessionOverdue = (session) =>
      session?.scheduled_at &&
      !["done", "completed", "closed", "cancelled"].includes(
        String(session.status || "").toLowerCase(),
      ) &&
      new Date(session.scheduled_at) < now;

    let title = "Read data";

    // DOMAIN ACCESS CHECK - Map READ intents to required domains
    const INTENT_DOMAIN_MAP = {
      [READ_INTENTS.LIST_CLIENTS]: DATA_DOMAINS.CLIENTS,
      [READ_INTENTS.READ_CLIENT]: DATA_DOMAINS.CLIENTS,
      [READ_INTENTS.EXPLAIN_CLIENT_STATE]: DATA_DOMAINS.CLIENTS,
      [READ_INTENTS.SUMMARIZE_CLIENT]: DATA_DOMAINS.CLIENTS,
      [READ_INTENTS.LIST_DOSSIERS]: DATA_DOMAINS.DOSSIERS,
      [READ_INTENTS.READ_DOSSIER]: DATA_DOMAINS.DOSSIERS,
      [READ_INTENTS.EXPLAIN_DOSSIER_STATE]: DATA_DOMAINS.DOSSIERS,
      [READ_INTENTS.SUMMARIZE_DOSSIER]: DATA_DOMAINS.DOSSIERS,
      [READ_INTENTS.LIST_LAWSUITS]: DATA_DOMAINS.LAWSUITS,
      [READ_INTENTS.READ_LAWSUIT]: DATA_DOMAINS.LAWSUITS,
      [READ_INTENTS.EXPLAIN_LAWSUIT_STATE]: DATA_DOMAINS.LAWSUITS,
      [READ_INTENTS.SUMMARIZE_LAWSUIT]: DATA_DOMAINS.LAWSUITS,
      [READ_INTENTS.LIST_TASKS]: DATA_DOMAINS.TASKS,
      [READ_INTENTS.LIST_OVERDUE_TASKS]: DATA_DOMAINS.TASKS,
      [READ_INTENTS.READ_TASK]: DATA_DOMAINS.TASKS,
      [READ_INTENTS.EXPLAIN_TASK_STATE]: DATA_DOMAINS.TASKS,
      [READ_INTENTS.SUMMARIZE_TASK]: DATA_DOMAINS.TASKS,
      [READ_INTENTS.LIST_PERSONAL_TASKS]: DATA_DOMAINS.PERSONAL_TASKS,
      [READ_INTENTS.READ_PERSONAL_TASK]: DATA_DOMAINS.PERSONAL_TASKS,
      [READ_INTENTS.EXPLAIN_PERSONAL_TASK_STATE]: DATA_DOMAINS.PERSONAL_TASKS,
      [READ_INTENTS.SUMMARIZE_PERSONAL_TASK]: DATA_DOMAINS.PERSONAL_TASKS,
      [READ_INTENTS.LIST_SESSIONS]: DATA_DOMAINS.SESSIONS,
      [READ_INTENTS.LIST_UPCOMING_SESSIONS]: DATA_DOMAINS.SESSIONS,
      [READ_INTENTS.READ_SESSION]: DATA_DOMAINS.SESSIONS,
      [READ_INTENTS.EXPLAIN_SESSION_STATE]: DATA_DOMAINS.SESSIONS,
      [READ_INTENTS.SUMMARIZE_SESSION]: DATA_DOMAINS.SESSIONS,
      [READ_INTENTS.LIST_MISSIONS]: DATA_DOMAINS.MISSIONS,
      [READ_INTENTS.READ_MISSION]: DATA_DOMAINS.MISSIONS,
      [READ_INTENTS.EXPLAIN_MISSION_STATE]: DATA_DOMAINS.MISSIONS,
      [READ_INTENTS.SUMMARIZE_MISSION]: DATA_DOMAINS.MISSIONS,
      [READ_INTENTS.LIST_FINANCIAL_ENTRIES]: DATA_DOMAINS.FINANCIAL_ENTRIES,
      [READ_INTENTS.READ_FINANCIAL_ENTRY]: DATA_DOMAINS.FINANCIAL_ENTRIES,
      [READ_INTENTS.EXPLAIN_FINANCIAL_ENTRY_STATE]: DATA_DOMAINS.FINANCIAL_ENTRIES,
      [READ_INTENTS.SUMMARIZE_FINANCIAL_ENTRY]: DATA_DOMAINS.FINANCIAL_ENTRIES,
      [READ_INTENTS.LIST_NOTIFICATIONS]: DATA_DOMAINS.NOTIFICATIONS,
      [READ_INTENTS.READ_NOTIFICATION]: DATA_DOMAINS.NOTIFICATIONS,
      [READ_INTENTS.EXPLAIN_NOTIFICATION_STATE]: DATA_DOMAINS.NOTIFICATIONS,
      [READ_INTENTS.SUMMARIZE_NOTIFICATION]: DATA_DOMAINS.NOTIFICATIONS,
      [READ_INTENTS.LIST_HISTORY_EVENTS]: DATA_DOMAINS.HISTORY,
      [READ_INTENTS.READ_HISTORY_EVENT]: DATA_DOMAINS.HISTORY,
      [READ_INTENTS.EXPLAIN_HISTORY_STATE]: DATA_DOMAINS.HISTORY,
      [READ_INTENTS.SUMMARIZE_HISTORY]: DATA_DOMAINS.HISTORY,
    };

    const requiredDomain = INTENT_DOMAIN_MAP[intent];
    if (requiredDomain) {
      const domainCheck = this._checkDomainAccess(requiredDomain, context);
      if (!domainCheck.permitted) {
        this.ledger.record({
          type: "read_intent_domain_blocked",
          intent,
          domain: requiredDomain,
          timestamp: new Date().toISOString(),
        });
        // Return domain denied response
        return {
          intent: "ACCESS_DENIED",
          agentVersion: policy.version,
          reasoner: "domain-firewall",
          output: {
            type: "explanation",
            entityId: "domain_access_denied",
            entityType: "security",
            title: "Read data — Access denied",
            summary: domainCheck.message,
            details: [
              `This query requires access to ${requiredDomain} data.`,
              "",
              "To access this data:",
              "1. Open the Context panel (right sidebar)",
              `2. Enable access to "${requiredDomain}"`,
              "3. Try your request again",
            ],
            timestamp: new Date().toISOString(),
            confidence: 1,
            sources: [
              {
                sourceType: "system",
                reference: "domain_firewall",
                note: "Data access permission check",
              },
            ],
            status: "blocked",
            source: "domain-firewall",
            requires_validation: false,
          },
          isAccessDenied: true,
        };
      }
    }

    let data = null;
    let summary = "";
    const details = [];
    const sources = [];

    try {
      switch (intent) {
        case READ_INTENTS.LIST_CLIENTS: {
          const { clients } = await this._callReadTool(
            "listClients",
            { limit: 50 },
            policy,
          );
          data = clients;
          title = "Read data — Clients";
          summary =
            clients.length > 0
              ? `Found ${clients.length} client(s)`
              : "No clients found";
          clients.forEach((c) => {
            details.push(
              `${c.name} (ID: ${c.id}) — ${c.status || "active"}${c.email ? ` • ${c.email}` : ""}`,
            );
          });
          sources.push({
            sourceType: "system",
            reference: "tool:listClients",
            note: "Client list",
          });
          break;
        }

        case READ_INTENTS.LIST_DOSSIERS: {
          let clientId = scope === "client" ? context?.clientId : null;
          if (!clientId) {
            const hintClientId = getHintValue("id", "client");
            if (hintClientId) clientId = hintClientId;
          }
          if (!clientId) {
            const hintClientName = getHintValue("name", "client");
            if (hintClientName) {
              const resolution = await this._resolveEntity(
                { type: "client", nameHint: hintClientName },
                policy,
              );
              if (resolution.resolved) {
                clientId = resolution.entity.id;
              } else if (resolution.reason === "ambiguous") {
                title = "Read data — Dossiers";
                summary = resolution.message;
                resolution.candidates?.forEach((c) =>
                  details.push(`${c.name} (ID: ${c.id})`),
                );
                details.push("Please specify which client you mean.");
                break;
              } else if (resolution.reason === "not_found") {
                title = "Read data — Dossiers";
                summary = resolution.message;
                details.push("Try listing clients to see available records.");
                break;
              }
            }
          }
          const { dossiers } = await this._callReadTool(
            "listDossiers",
            {
              limit: 50,
              clientId,
            },
            policy,
          );
          data = dossiers;
          title = "Read data — Dossiers";
          summary =
            dossiers.length > 0
              ? `Found ${dossiers.length} dossier(s)`
              : "No dossiers found";
          dossiers.forEach((d) => {
            details.push(
              `${d.reference || "Dossier"} — ${d.title || "Untitled"} (${d.status || "open"}, ${d.priority || "medium"})`,
            );
          });
          sources.push({
            sourceType: "system",
            reference: "tool:listDossiers",
            note: "Dossier list",
          });
          break;
        }

        case READ_INTENTS.LIST_LAWSUITS: {
          let dossierId = scope === "dossier" ? context?.dossierId : null;
          if (!dossierId) {
            const hintDossierId = getHintValue("id", "dossier");
            if (hintDossierId) dossierId = hintDossierId;
          }
          if (!dossierId) {
            const hintRef = getHintValue("reference", "dossier");
            const hintName = getHintValue("name", "dossier");
            if (hintRef || hintName) {
              const resolution = await this._resolveEntity(
                {
                  type: "dossier",
                  reference: hintRef || undefined,
                  nameHint: hintName || undefined,
                },
                policy,
              );
              if (resolution.resolved) {
                dossierId = resolution.entity.id;
              } else if (resolution.reason === "ambiguous") {
                title = "Read data — Lawsuits";
                summary = resolution.message;
                resolution.candidates?.forEach((c) =>
                  details.push(`${c.name} (ID: ${c.id})`),
                );
                details.push("Please specify which dossier you mean.");
                break;
              } else if (resolution.reason === "not_found") {
                title = "Read data — Lawsuits";
                summary = resolution.message;
                details.push("Try listing dossiers to see available records.");
                break;
              }
            }
          }
          if (
            !dossierId &&
            (getHintValue("id", "client") || getHintValue("name", "client"))
          ) {
            title = "Read data — Lawsuits";
            summary = "Cases are linked to dossiers.";
            details.push("Specify a dossier to list related cases.");
            break;
          }
          const { lawsuits } = await this._callReadTool(
            "listLawsuits",
            {
              limit: 50,
              dossierId,
            },
            policy,
          );
          data = lawsuits;
          title = "Read data — Lawsuits";
          summary =
            lawsuits.length > 0
              ? `Found ${lawsuits.length} lawsuit(s)`
              : "No lawsuits found";
          lawsuits.forEach((l) => {
            const ref = l.reference || l.lawsuit_number || "Lawsuit";
            details.push(
              `${ref} — ${l.title || "Untitled"} (${l.status || "in_progress"})`,
            );
          });
          sources.push({
            sourceType: "system",
            reference: "tool:listLawsuits",
            note: "Lawsuit list",
          });
          break;
        }

        case READ_INTENTS.LIST_TASKS: {
          let dossierId = scope === "dossier" ? context?.dossierId : null;
          let lawsuitId = scope === "lawsuit" ? context?.lawsuitId : null;

          if (!dossierId && !lawsuitId) {
            const hintDossierId = getHintValue("id", "dossier");
            const hintDossierRef = getHintValue("reference", "dossier");
            const hintDossierName = getHintValue("name", "dossier");
            if (hintDossierId) {
              dossierId = hintDossierId;
            } else if (hintDossierRef || hintDossierName) {
              const resolution = await this._resolveEntity(
                {
                  type: "dossier",
                  reference: hintDossierRef || undefined,
                  nameHint: hintDossierName || undefined,
                },
                policy,
              );
              if (resolution.resolved) {
                dossierId = resolution.entity.id;
              } else if (resolution.reason === "ambiguous") {
                title = "Read data — Tasks";
                summary = resolution.message;
                resolution.candidates?.forEach((c) =>
                  details.push(`${c.name} (ID: ${c.id})`),
                );
                details.push("Please specify which dossier you mean.");
                break;
              } else if (resolution.reason === "not_found") {
                title = "Read data — Tasks";
                summary = resolution.message;
                details.push("Try listing dossiers to see available records.");
                break;
              }
            }
          }

          if (!dossierId && !lawsuitId) {
            const hintLawsuitId = getHintValue("id", "lawsuit");
            const hintLawsuitRef = getHintValue("reference", "lawsuit");
            const hintLawsuitName = getHintValue("name", "lawsuit");
            if (hintLawsuitId) {
              lawsuitId = hintLawsuitId;
            } else if (hintLawsuitRef || hintLawsuitName) {
              const resolution = await this._resolveEntity(
                {
                  type: "lawsuit",
                  reference: hintLawsuitRef || undefined,
                  nameHint: hintLawsuitName || undefined,
                },
                policy,
              );
              if (resolution.resolved) {
                lawsuitId = resolution.entity.id;
              } else if (resolution.reason === "ambiguous") {
                title = "Read data — Tasks";
                summary = resolution.message;
                resolution.candidates?.forEach((c) =>
                  details.push(`${c.name} (ID: ${c.id})`),
                );
                details.push("Please specify which case you mean.");
                break;
              } else if (resolution.reason === "not_found") {
                title = "Read data — Tasks";
                summary = resolution.message;
                details.push("Try listing cases to see available records.");
                break;
              }
            }
          }

          if (
            !dossierId &&
            !lawsuitId &&
            (getHintValue("id", "client") || getHintValue("name", "client"))
          ) {
            title = "Read data — Tasks";
            summary = "Tasks are linked to dossiers or cases.";
            details.push("Specify a dossier or case to list related tasks.");
            break;
          }

          const { tasks } = await this._callReadTool(
            "listTasks",
            {
              limit: 50,
              dossierId,
              lawsuitId,
            },
            policy,
          );
          data = tasks;
          title = "Read data — Tasks";
          summary =
            tasks.length > 0 ? `Found ${tasks.length} task(s)` : "No tasks found";
          tasks.forEach((t) => {
            const due = t.due_date ? ` due ${formatDate(t.due_date)}` : "";
            details.push(
              `${t.title} (ID: ${t.id}) — ${t.status || "todo"}${due}`,
            );
          });
          sources.push({
            sourceType: "system",
            reference: "tool:listTasks",
            note: "Task list",
          });
          break;
        }

        case READ_INTENTS.LIST_OVERDUE_TASKS: {
          let dossierId = scope === "dossier" ? context?.dossierId : null;
          let lawsuitId = scope === "lawsuit" ? context?.lawsuitId : null;

          if (!dossierId && !lawsuitId) {
            const hintDossierId = getHintValue("id", "dossier");
            const hintDossierRef = getHintValue("reference", "dossier");
            const hintDossierName = getHintValue("name", "dossier");
            if (hintDossierId) {
              dossierId = hintDossierId;
            } else if (hintDossierRef || hintDossierName) {
              const resolution = await this._resolveEntity(
                {
                  type: "dossier",
                  reference: hintDossierRef || undefined,
                  nameHint: hintDossierName || undefined,
                },
                policy,
              );
              if (resolution.resolved) {
                dossierId = resolution.entity.id;
              } else if (resolution.reason === "ambiguous") {
                title = "Read data — Overdue tasks";
                summary = resolution.message;
                resolution.candidates?.forEach((c) =>
                  details.push(`${c.name} (ID: ${c.id})`),
                );
                details.push("Please specify which dossier you mean.");
                break;
              } else if (resolution.reason === "not_found") {
                title = "Read data — Overdue tasks";
                summary = resolution.message;
                details.push("Try listing dossiers to see available records.");
                break;
              }
            }
          }

          if (!dossierId && !lawsuitId) {
            const hintLawsuitId = getHintValue("id", "lawsuit");
            const hintLawsuitRef = getHintValue("reference", "lawsuit");
            const hintLawsuitName = getHintValue("name", "lawsuit");
            if (hintLawsuitId) {
              lawsuitId = hintLawsuitId;
            } else if (hintLawsuitRef || hintLawsuitName) {
              const resolution = await this._resolveEntity(
                {
                  type: "lawsuit",
                  reference: hintLawsuitRef || undefined,
                  nameHint: hintLawsuitName || undefined,
                },
                policy,
              );
              if (resolution.resolved) {
                lawsuitId = resolution.entity.id;
              } else if (resolution.reason === "ambiguous") {
                title = "Read data — Overdue tasks";
                summary = resolution.message;
                resolution.candidates?.forEach((c) =>
                  details.push(`${c.name} (ID: ${c.id})`),
                );
                details.push("Please specify which case you mean.");
                break;
              } else if (resolution.reason === "not_found") {
                title = "Read data — Overdue tasks";
                summary = resolution.message;
                details.push("Try listing cases to see available records.");
                break;
              }
            }
          }

          if (
            !dossierId &&
            !lawsuitId &&
            (getHintValue("id", "client") || getHintValue("name", "client"))
          ) {
            title = "Read data — Overdue tasks";
            summary = "Tasks are linked to dossiers or cases.";
            details.push("Specify a dossier or case to list related tasks.");
            break;
          }

          const { tasks } = await this._callReadTool(
            "listTasks",
            {
              limit: 100,
              dossierId,
              lawsuitId,
            },
            policy,
          );
          const overdue = tasks.filter(
            (task) =>
              task.due_date &&
              !["done", "cancelled"].includes(task.status) &&
              new Date(task.due_date) < now,
          );
          data = overdue;
          title = "Read data — Overdue tasks";
          summary =
            overdue.length > 0
              ? `⚠ ${overdue.length} overdue task(s)`
              : "No overdue tasks";
          overdue.forEach((t) => {
            details.push(
              `${t.title} (ID: ${t.id}) — ${t.status || "todo"} due ${formatDate(t.due_date)}`,
            );
          });
          sources.push({
            sourceType: "system",
            reference: "tool:listTasks",
            note: "Overdue tasks from list",
          });
          break;
        }

        case READ_INTENTS.LIST_PERSONAL_TASKS: {
          const { personalTasks } = await this._callReadTool(
            "listPersonalTasks",
            { limit: 50 },
            policy,
          );
          data = personalTasks;
          title = "Read data — Personal tasks";
          summary =
            personalTasks.length > 0
              ? `Found ${personalTasks.length} personal task(s)`
              : "No personal tasks found";
          personalTasks.forEach((t) => {
            const due = t.due_date ? ` due ${formatDate(t.due_date)}` : "";
            details.push(
              `${t.title || "Personal task"} (ID: ${t.id}) — ${t.status || "todo"}${due}`,
            );
          });
          sources.push({
            sourceType: "system",
            reference: "tool:listPersonalTasks",
            note: "Personal task list",
          });
          break;
        }

        case READ_INTENTS.LIST_SESSIONS:
        case READ_INTENTS.LIST_UPCOMING_SESSIONS: {
          const timeframe = filters?.timeframe || null;
          let dossierId = scope === "dossier" ? context?.dossierId : null;
          let lawsuitId = scope === "lawsuit" ? context?.lawsuitId : null;

          if (!dossierId && !lawsuitId) {
            const hintDossierId = getHintValue("id", "dossier");
            const hintDossierRef = getHintValue("reference", "dossier");
            const hintDossierName = getHintValue("name", "dossier");
            if (hintDossierId) {
              dossierId = hintDossierId;
            } else if (hintDossierRef || hintDossierName) {
              const resolution = await this._resolveEntity(
                {
                  type: "dossier",
                  reference: hintDossierRef || undefined,
                  nameHint: hintDossierName || undefined,
                },
                policy,
              );
              if (resolution.resolved) {
                dossierId = resolution.entity.id;
              } else if (resolution.reason === "ambiguous") {
                title = "Read data — Sessions";
                summary = resolution.message;
                resolution.candidates?.forEach((c) =>
                  details.push(`${c.name} (ID: ${c.id})`),
                );
                details.push("Please specify which dossier you mean.");
                break;
              } else if (resolution.reason === "not_found") {
                title = "Read data — Sessions";
                summary = resolution.message;
                details.push("Try listing dossiers to see available records.");
                break;
              }
            }
          }

          if (!dossierId && !lawsuitId) {
            const hintLawsuitId = getHintValue("id", "lawsuit");
            const hintLawsuitRef = getHintValue("reference", "lawsuit");
            const hintLawsuitName = getHintValue("name", "lawsuit");
            if (hintLawsuitId) {
              lawsuitId = hintLawsuitId;
            } else if (hintLawsuitRef || hintLawsuitName) {
              const resolution = await this._resolveEntity(
                {
                  type: "lawsuit",
                  reference: hintLawsuitRef || undefined,
                  nameHint: hintLawsuitName || undefined,
                },
                policy,
              );
              if (resolution.resolved) {
                lawsuitId = resolution.entity.id;
              } else if (resolution.reason === "ambiguous") {
                title = "Read data — Sessions";
                summary = resolution.message;
                resolution.candidates?.forEach((c) =>
                  details.push(`${c.name} (ID: ${c.id})`),
                );
                details.push("Please specify which case you mean.");
                break;
              } else if (resolution.reason === "not_found") {
                title = "Read data — Sessions";
                summary = resolution.message;
                details.push("Try listing cases to see available records.");
                break;
              }
            }
          }

          if (
            !dossierId &&
            !lawsuitId &&
            (getHintValue("id", "client") || getHintValue("name", "client"))
          ) {
            title = "Read data — Sessions";
            summary = "Sessions are linked to dossiers or cases.";
            details.push("Specify a dossier or case to list related sessions.");
            break;
          }

          const { sessions } = await this._callReadTool(
            "listSessions",
            {
              limit: 50,
              dossierId,
              lawsuitId,
              timeframe,
            },
            policy,
          );
          data = sessions;
          title = "Read data — Sessions";
          summary =
            sessions.length > 0
              ? `${sessions.length} session(s)${
                  timeframe ? ` ${timeframe}` : ""
                }`
              : `No sessions${timeframe ? ` ${timeframe}` : ""} found`;
          sessions.forEach((s) => {
            const when = s.scheduled_at
              ? formatDateTime(s.scheduled_at)
              : "unscheduled";
            details.push(
              `${s.session_type || "session"} — ${s.title || "Untitled"} (${s.status || "scheduled"}) • ${when}`,
            );
          });
          sources.push({
            sourceType: "system",
            reference: "tool:listSessions",
            note: "Session list",
          });
          break;
        }

        case READ_INTENTS.LIST_MISSIONS: {
          let dossierId = scope === "dossier" ? context?.dossierId : null;
          let lawsuitId = scope === "lawsuit" ? context?.lawsuitId : null;

          if (!dossierId && !lawsuitId) {
            const hintDossierId = getHintValue("id", "dossier");
            const hintDossierRef = getHintValue("reference", "dossier");
            const hintDossierName = getHintValue("name", "dossier");
            if (hintDossierId) {
              dossierId = hintDossierId;
            } else if (hintDossierRef || hintDossierName) {
              const resolution = await this._resolveEntity(
                {
                  type: "dossier",
                  reference: hintDossierRef || undefined,
                  nameHint: hintDossierName || undefined,
                },
                policy,
              );
              if (resolution.resolved) {
                dossierId = resolution.entity.id;
              } else if (resolution.reason === "ambiguous") {
                title = "Read data — Missions";
                summary = resolution.message;
                resolution.candidates?.forEach((c) =>
                  details.push(`${c.name} (ID: ${c.id})`),
                );
                details.push("Please specify which dossier you mean.");
                break;
              } else if (resolution.reason === "not_found") {
                title = "Read data — Missions";
                summary = resolution.message;
                details.push("Try listing dossiers to see available records.");
                break;
              }
            }
          }

          if (!dossierId && !lawsuitId) {
            const hintLawsuitId = getHintValue("id", "lawsuit");
            const hintLawsuitRef = getHintValue("reference", "lawsuit");
            const hintLawsuitName = getHintValue("name", "lawsuit");
            if (hintLawsuitId) {
              lawsuitId = hintLawsuitId;
            } else if (hintLawsuitRef || hintLawsuitName) {
              const resolution = await this._resolveEntity(
                {
                  type: "lawsuit",
                  reference: hintLawsuitRef || undefined,
                  nameHint: hintLawsuitName || undefined,
                },
                policy,
              );
              if (resolution.resolved) {
                lawsuitId = resolution.entity.id;
              } else if (resolution.reason === "ambiguous") {
                title = "Read data — Missions";
                summary = resolution.message;
                resolution.candidates?.forEach((c) =>
                  details.push(`${c.name} (ID: ${c.id})`),
                );
                details.push("Please specify which case you mean.");
                break;
              } else if (resolution.reason === "not_found") {
                title = "Read data — Missions";
                summary = resolution.message;
                details.push("Try listing cases to see available records.");
                break;
              }
            }
          }

          if (
            !dossierId &&
            !lawsuitId &&
            (getHintValue("id", "client") || getHintValue("name", "client"))
          ) {
            title = "Read data — Missions";
            summary = "Missions are linked to dossiers or cases.";
            details.push("Specify a dossier or case to list related missions.");
            break;
          }

          const { missions } = await this._callReadTool(
            "listMissions",
            {
              limit: 50,
              dossierId,
              lawsuitId,
            },
            policy,
          );
          data = missions;
          title = "Read data — Missions";
          summary =
            missions.length > 0
              ? `Found ${missions.length} mission(s)`
              : "No missions found";
          missions.forEach((m) => {
            const due = m.due_date ? ` due ${formatDate(m.due_date)}` : "";
            details.push(
              `${m.reference || "Mission"} — ${m.title || "Untitled"} (${m.status || "planned"})${due}`,
            );
          });
          sources.push({
            sourceType: "system",
            reference: "tool:listMissions",
            note: "Mission list",
          });
          break;
        }

        case READ_INTENTS.LIST_FINANCIAL_ENTRIES: {
          let clientId = scope === "client" ? context?.clientId : null;
          let dossierId = scope === "dossier" ? context?.dossierId : null;
          let lawsuitId = scope === "lawsuit" ? context?.lawsuitId : null;
          let missionId = scope === "mission" ? context?.missionId : null;
          let taskId = scope === "task" ? context?.taskId : null;
          let personalTaskId =
            scope === "personal_task" ? context?.personalTaskId : null;

          if (
            !clientId &&
            !dossierId &&
            !lawsuitId &&
            !missionId &&
            !taskId &&
            !personalTaskId
          ) {
            const hintClientId = getHintValue("id", "client");
            const hintClientName = getHintValue("name", "client");
            if (hintClientId) {
              clientId = hintClientId;
            } else if (hintClientName) {
              const resolution = await this._resolveEntity(
                { type: "client", nameHint: hintClientName },
                policy,
              );
              if (resolution.resolved) {
                clientId = resolution.entity.id;
              } else if (resolution.reason === "ambiguous") {
                title = "Read data — Financial entries";
                summary = resolution.message;
                resolution.candidates?.forEach((c) =>
                  details.push(`${c.name} (ID: ${c.id})`),
                );
                details.push("Please specify which client you mean.");
                break;
              } else if (resolution.reason === "not_found") {
                title = "Read data — Financial entries";
                summary = resolution.message;
                details.push("Try listing clients to see available records.");
                break;
              }
            }
          }

          if (
            !dossierId &&
            (getHintValue("reference", "dossier") || getHintValue("name", "dossier"))
          ) {
            const resolution = await this._resolveEntity(
              {
                type: "dossier",
                reference: getHintValue("reference", "dossier") || undefined,
                nameHint: getHintValue("name", "dossier") || undefined,
              },
              policy,
            );
            if (resolution.resolved) {
              dossierId = resolution.entity.id;
            } else if (resolution.reason === "ambiguous") {
              title = "Read data — Financial entries";
              summary = resolution.message;
              resolution.candidates?.forEach((c) =>
                details.push(`${c.name} (ID: ${c.id})`),
              );
              details.push("Please specify which dossier you mean.");
              break;
            } else if (resolution.reason === "not_found") {
              title = "Read data — Financial entries";
              summary = resolution.message;
              details.push("Try listing dossiers to see available records.");
              break;
            }
          }

          if (
            !lawsuitId &&
            (getHintValue("reference", "lawsuit") || getHintValue("name", "lawsuit"))
          ) {
            const resolution = await this._resolveEntity(
              {
                type: "lawsuit",
                reference: getHintValue("reference", "lawsuit") || undefined,
                nameHint: getHintValue("name", "lawsuit") || undefined,
              },
              policy,
            );
            if (resolution.resolved) {
              lawsuitId = resolution.entity.id;
            } else if (resolution.reason === "ambiguous") {
              title = "Read data — Financial entries";
              summary = resolution.message;
              resolution.candidates?.forEach((c) =>
                details.push(`${c.name} (ID: ${c.id})`),
              );
              details.push("Please specify which case you mean.");
              break;
            } else if (resolution.reason === "not_found") {
              title = "Read data — Financial entries";
              summary = resolution.message;
              details.push("Try listing cases to see available records.");
              break;
            }
          }

          if (
            !missionId &&
            (getHintValue("reference", "mission") || getHintValue("name", "mission"))
          ) {
            const resolution = await this._resolveEntity(
              {
                type: "mission",
                reference: getHintValue("reference", "mission") || undefined,
                nameHint: getHintValue("name", "mission") || undefined,
              },
              policy,
            );
            if (resolution.resolved) {
              missionId = resolution.entity.id;
            } else if (resolution.reason === "ambiguous") {
              title = "Read data — Financial entries";
              summary = resolution.message;
              resolution.candidates?.forEach((c) =>
                details.push(`${c.name} (ID: ${c.id})`),
              );
              details.push("Please specify which mission you mean.");
              break;
            } else if (resolution.reason === "not_found") {
              title = "Read data — Financial entries";
              summary = resolution.message;
              details.push("Try listing missions to see available records.");
              break;
            }
          }

          if (!taskId && getHintValue("id", "task")) {
            taskId = getHintValue("id", "task");
          }

          if (!personalTaskId && getHintValue("id", "personal_task")) {
            personalTaskId = getHintValue("id", "personal_task");
          }

          const scopeCount = [
            clientId,
            dossierId,
            lawsuitId,
            missionId,
            taskId,
            personalTaskId,
          ].filter(Boolean).length;
          if (scopeCount > 1) {
            title = "Read data — Financial entries";
            summary = "Multiple scopes detected for financial entries.";
            details.push("Please specify a single client, dossier, case, mission, or task.");
            break;
          }

          const { financialEntries } = await this._callReadTool(
            "listFinancialEntries",
            {
              limit: 50,
              paymentStatus: filters?.paymentStatus || null,
              clientId,
              dossierId,
              lawsuitId,
              missionId,
              taskId,
              personalTaskId,
            },
            policy,
          );
          data = financialEntries;
          title = "Read data — Financial entries";
          summary =
            financialEntries.length > 0
              ? `Found ${financialEntries.length} entry(ies)`
              : "No financial entries found";
          financialEntries.forEach((entry) => {
            const amount = entry.amount
              ? `${entry.amount} ${entry.currency || ""}`.trim()
              : "N/A";
            const due = entry.due_date ? ` due ${formatDate(entry.due_date)}` : "";
            const ref =
              entry.reference || entry.title || entry.entry_type || "Entry";
            details.push(
              `${ref} — ${amount} (${entry.status || "draft"})${due}`,
            );
          });
          sources.push({
            sourceType: "system",
            reference: "tool:listFinancialEntries",
            note: "Financial entry list",
          });
          break;
        }

        case READ_INTENTS.LIST_NOTIFICATIONS: {
          let entityType = null;
          let entityId = null;
          const scopeMap = {
            client: context?.clientId,
            dossier: context?.dossierId,
            lawsuit: context?.lawsuitId,
            session: context?.sessionId,
            task: context?.taskId,
            mission: context?.missionId,
            personal_task: context?.personalTaskId,
            financial_entry: context?.financialEntryId,
          };
          if (scope && scopeMap[scope]) {
            entityType = scope;
            entityId = scopeMap[scope];
          }

          if (!entityType) {
            const hintTypes = [
              "client",
              "dossier",
              "lawsuit",
              "session",
              "task",
              "mission",
              "personal_task",
              "financial_entry",
            ];
            for (const hintType of hintTypes) {
              const hintId = getHintValue("id", hintType);
              const hintRef = getHintValue("reference", hintType);
              const hintName = getHintValue("name", hintType);
              if (hintId) {
                entityType = hintType;
                entityId = hintId;
                break;
              }
              if (hintRef || hintName) {
                const resolution = await this._resolveEntity(
                  {
                    type: hintType,
                    reference: hintRef || undefined,
                    nameHint: hintName || undefined,
                  },
                  policy,
                );
                if (resolution.resolved) {
                  entityType = hintType;
                  entityId = resolution.entity.id;
                  break;
                } else if (resolution.reason === "ambiguous") {
                  title = "Read data — Notifications";
                  summary = resolution.message;
                  resolution.candidates?.forEach((c) =>
                    details.push(`${c.name} (ID: ${c.id})`),
                  );
                  details.push("Please specify which record you mean.");
                  break;
                } else if (resolution.reason === "not_found") {
                  title = "Read data — Notifications";
                  summary = resolution.message;
                  details.push("Try listing records to see available items.");
                  break;
                }
              }
            }
            if (summary) break;
          }

          const { notifications } = await this._callReadTool(
            "listNotifications",
            {
              limit: 50,
              status: filters?.status || null,
              entityType,
              entityId,
            },
            policy,
          );
          data = notifications;
          title = "Read data — Notifications";
          summary =
            notifications.length > 0
              ? `Found ${notifications.length} notification(s)`
              : "No notifications found";
          notifications.forEach((n) => {
            const type = n.template_key || n.type || "Notification";
            details.push(`${type} (ID: ${n.id}) — ${n.status || "unread"}`);
          });
          sources.push({
            sourceType: "system",
            reference: "tool:listNotifications",
            note: "Notification list",
          });
          break;
        }

        case READ_INTENTS.LIST_HISTORY_EVENTS: {
          let entityType = filters?.entityType || null;
          let entityId = filters?.entityId || null;

          if (!entityType) {
            const scopeMap = {
              client: context?.clientId,
              dossier: context?.dossierId,
              lawsuit: context?.lawsuitId,
              session: context?.sessionId,
              task: context?.taskId,
              mission: context?.missionId,
              personal_task: context?.personalTaskId,
              financial_entry: context?.financialEntryId,
            };
            if (scope && scopeMap[scope]) {
              entityType = scope;
              entityId = scopeMap[scope];
            }
          }

          if (!entityType) {
            const hintTypes = [
              "client",
              "dossier",
              "lawsuit",
              "session",
              "task",
              "mission",
              "personal_task",
              "financial_entry",
            ];
            for (const hintType of hintTypes) {
              const hintId = getHintValue("id", hintType);
              const hintRef = getHintValue("reference", hintType);
              const hintName = getHintValue("name", hintType);
              if (hintId) {
                entityType = hintType;
                entityId = hintId;
                break;
              }
              if (hintRef || hintName) {
                const resolution = await this._resolveEntity(
                  {
                    type: hintType,
                    reference: hintRef || undefined,
                    nameHint: hintName || undefined,
                  },
                  policy,
                );
                if (resolution.resolved) {
                  entityType = hintType;
                  entityId = resolution.entity.id;
                  break;
                } else if (resolution.reason === "ambiguous") {
                  title = "Read data — History";
                  summary = resolution.message;
                  resolution.candidates?.forEach((c) =>
                    details.push(`${c.name} (ID: ${c.id})`),
                  );
                  details.push("Please specify which record you mean.");
                  break;
                } else if (resolution.reason === "not_found") {
                  title = "Read data — History";
                  summary = resolution.message;
                  details.push("Try listing records to see available items.");
                  break;
                }
              }
            }
            if (summary) break;
          }

          const { historyEvents } = await this._callReadTool(
            "listHistoryEvents",
            {
              limit: 50,
              entityType,
              entityId,
            },
            policy,
          );
          data = historyEvents;
          title = "Read data — History";
          summary =
            historyEvents.length > 0
              ? `Found ${historyEvents.length} history event(s)`
              : "No history events found";
          historyEvents.forEach((e) => {
            const when = e.created_at ? formatDateTime(e.created_at) : "unknown";
            details.push(
              `${when} — ${e.action || "event"}: ${e.description || "No description"}`,
            );
          });
          sources.push({
            sourceType: "system",
            reference: "tool:listHistoryEvents",
            note: "History list",
          });
          break;
        }

        case READ_INTENTS.READ_CLIENT: {
          const hintId = entityHints.find((hint) => hint.type === "id")?.value;
          const hintName = entityHints.find((hint) => hint.type === "name")?.value;
          title = "Read data — Client";

          if (hintId) {
            const result = await this._callReadTool(
              "getClient",
              { clientId: hintId },
              policy,
            );
            const client = result?.client;
            if (!client) {
              summary = `No client found for ID ${hintId}`;
              details.push("Try listing clients to see available records.");
              break;
            }
            summary = `Client: ${client.name}`;
            details.push(`ID: ${client.id}`);
            details.push(`Status: ${client.status || "active"}`);
            details.push(`Email: ${client.email || "N/A"}`);
            details.push(`Phone: ${client.phone || "N/A"}`);
            details.push(`Company: ${client.company || "N/A"}`);
            sources.push({
              sourceType: "system",
              reference: "tool:getClient",
              note: "Client lookup",
            });
            data = client;
            break;
          }

          if (hintName) {
            const result = await this._callReadTool(
              "searchClientsByName",
              { nameHint: hintName, limit: 10 },
              policy,
            );
            const clients = result?.clients || [];
            if (clients.length === 0) {
              summary = `No client found matching "${hintName}"`;
              details.push("Try listing all clients with: show me my clients");
            } else if (clients.length === 1) {
              const client = clients[0];
              summary = `Client: ${client.name}`;
              details.push(`ID: ${client.id}`);
              details.push(`Status: ${client.status || "active"}`);
              details.push(`Email: ${client.email || "N/A"}`);
              details.push(`Phone: ${client.phone || "N/A"}`);
              details.push(`Company: ${client.company || "N/A"}`);
              sources.push({
                sourceType: "system",
                reference: "tool:searchClientsByName",
                note: "Client lookup",
              });
              data = client;
            } else {
              summary = `Multiple clients match "${hintName}"`;
              clients.forEach((c) => {
                details.push(
                  `${c.name} (ID: ${c.id}) — ${c.status || "active"}`,
                );
              });
              details.push("Please specify which client you mean.");
            }
            break;
          }

          summary = "Which client?";
          details.push("Provide a client ID or name.");
          break;
        }

        case READ_INTENTS.EXPLAIN_CLIENT_STATE:
        case READ_INTENTS.SUMMARIZE_CLIENT: {
          const scope = String(context?.scope || "").toLowerCase();
          const scopedId = scope === "client" ? context?.clientId : null;
          const hintId = entityHints.find((hint) => hint.type === "id")?.value;
          const hintName = entityHints.find((hint) => hint.type === "name")?.value;
          const targetId = hintId || scopedId;

          if (targetId) {
            const result = await this._callReadTool(
              "getClient",
              { clientId: targetId },
              policy,
            );
            const client = result?.client;
            if (!client) {
              title = "Read data — Client";
              summary = `No client found for ID ${targetId}`;
              details.push("Try listing clients to see available records.");
              break;
            }

            const dossiersResult = await this._callReadTool(
              "listDossiersForClient",
              { clientId: client.id, limit: 50 },
              policy,
            );
            const dossiers = dossiersResult?.dossiers || [];
            const financialResult = await this._callReadTool(
              "listFinancialEntries",
              { clientId: client.id, limit: 200 },
              policy,
            );
            const financialEntries = financialResult?.financialEntries || [];
            const overdueReceivables = financialEntries.filter(
              (entry) =>
                String(entry.direction || "").toLowerCase() === "receivable" &&
                !entry.paid_at &&
                entry.due_date &&
                new Date(entry.due_date) < now,
            );
            const historyResult = await this._callReadTool(
              "listHistoryEvents",
              { entityType: "client", entityId: client.id, limit: 5 },
              policy,
            );
            const historyEvents = historyResult?.historyEvents || [];

            if (intent === READ_INTENTS.EXPLAIN_CLIENT_STATE) {
              title = "Read data — Client state";
              summary = `Client: ${client.name}`;
              details.push(`Status: ${client.status || "active"}`);
              details.push(
                `Relationships: ${dossiers.length} dossier(s), ${financialEntries.length} financial entry(ies)`,
              );
              details.push(
                overdueReceivables.length > 0
                  ? `Blocking: ${overdueReceivables.length} overdue receivable(s)`
                  : "Blocking: none detected",
              );
              sources.push({
                sourceType: "system",
                reference: "tool:getClient",
                note: "Client state",
              });
              data = client;
              break;
            }

            title = "Read data — Client summary";
            summary = `Client: ${client.name}`;
            const recentActivity = historyEvents.map((event) => {
              const when = event.created_at
                ? formatDateTime(event.created_at)
                : "unknown";
              return `${when} — ${event.action || "event"}`;
            });
            details.push(
              `Summary: status ${client.status || "active"}, ${dossiers.length} dossier(s)`,
            );
            details.push(
              `Recent activity: ${recentActivity.length > 0 ? recentActivity.join(" | ") : "none"}`,
            );
            details.push(
              overdueReceivables.length > 0
                ? `Key risks: ${overdueReceivables.length} overdue receivable(s)`
                : "Key risks: none detected",
            );
            sources.push({
              sourceType: "system",
              reference: "tool:getClient",
              note: "Client summary",
            });
            data = client;
            break;
          }

          if (hintName) {
            const result = await this._callReadTool(
              "searchClientsByName",
              { nameHint: hintName, limit: 5 },
              policy,
            );
            const clients = result?.clients || [];
            if (clients.length === 1) {
              const client = clients[0];
              title =
                intent === READ_INTENTS.EXPLAIN_CLIENT_STATE
                  ? "Read data — Client state"
                  : "Read data — Client summary";
              summary = `Client: ${client.name}`;
              details.push(`Status: ${client.status || "active"}`);
              details.push("Provide a client ID for relationships and blockers.");
              sources.push({
                sourceType: "system",
                reference: "tool:searchClientsByName",
                note: "Client lookup",
              });
              data = client;
              break;
            }
            summary = `Multiple clients match "${hintName}"`;
            clients.forEach((c) =>
              details.push(`${c.name} (ID: ${c.id}) — ${c.status || "active"}`),
            );
            details.push("Please specify which client you mean.");
            break;
          }

          summary = "Which client?";
          details.push("Provide a client ID or name.");
          break;
        }

        case READ_INTENTS.READ_DOSSIER: {
          const hintId = entityHints.find((hint) => hint.type === "id")?.value;
          const hintRef = entityHints.find((hint) => hint.type === "reference")?.value;
          const hintName = entityHints.find((hint) => hint.type === "name")?.value;
          title = "Read data — Dossier";

          if (hintId) {
            const result = await this._callReadTool(
              "getDossier",
              { dossierId: hintId },
              policy,
            );
            const dossier = result?.dossier;
            if (!dossier) {
              summary = `No dossier found for ID ${hintId}`;
              details.push("Try listing dossiers to see available records.");
              break;
            }
            summary = `Dossier: ${dossier.reference || dossier.title || hintId}`;
            details.push(`Title: ${dossier.title || "Untitled"}`);
            details.push(`Status: ${dossier.status || "open"}`);
            details.push(`Priority: ${dossier.priority || "medium"}`);
            details.push(`Client ID: ${dossier.client_id || "N/A"}`);
            if (dossier.phase) details.push(`Phase: ${dossier.phase}`);
            sources.push({
              sourceType: "system",
              reference: "tool:getDossier",
              note: "Dossier lookup",
            });
            data = dossier;
            break;
          }

          if (hintRef) {
            const result = await this._callReadTool(
              "getDossierByReference",
              { reference: hintRef },
              policy,
            );
            const dossier = result?.dossier;
            if (!dossier) {
              summary = `No dossier found for reference "${hintRef}"`;
              details.push("Try listing all dossiers with: show me my dossiers");
              break;
            }
            summary = `Dossier: ${dossier.reference || hintRef}`;
            details.push(`Title: ${dossier.title || "Untitled"}`);
            details.push(`Status: ${dossier.status || "open"}`);
            details.push(`Priority: ${dossier.priority || "medium"}`);
            details.push(`Client ID: ${dossier.client_id || "N/A"}`);
            if (dossier.phase) details.push(`Phase: ${dossier.phase}`);
            sources.push({
              sourceType: "system",
              reference: "tool:getDossierByReference",
              note: "Dossier lookup",
            });
            data = dossier;
            break;
          }

          if (hintName) {
            const result = await this._callReadTool(
              "listDossiers",
              { query: hintName, limit: 10 },
              policy,
            );
            const dossiers = result?.dossiers || [];
            if (dossiers.length === 0) {
              summary = `No dossier found for "${hintName}"`;
              details.push("Try listing all dossiers with: show me my dossiers");
            } else if (dossiers.length === 1) {
              const dossier = dossiers[0];
              summary = `Dossier: ${dossier.reference || dossier.title}`;
              details.push(`Title: ${dossier.title || "Untitled"}`);
              details.push(`Status: ${dossier.status || "open"}`);
              details.push(`Priority: ${dossier.priority || "medium"}`);
              details.push(`Client ID: ${dossier.client_id || "N/A"}`);
              if (dossier.phase) details.push(`Phase: ${dossier.phase}`);
              sources.push({
                sourceType: "system",
                reference: "tool:listDossiers",
                note: "Dossier lookup",
              });
              data = dossier;
            } else {
              summary = `Multiple dossiers match "${hintName}"`;
              dossiers.forEach((d) =>
                details.push(
                  `${d.reference || "Dossier"} — ${d.title || "Untitled"} (ID: ${d.id})`,
                ),
              );
              details.push("Please specify which dossier you mean.");
            }
            break;
          }

          summary = "Which dossier?";
          details.push("Provide a dossier ID or reference.");
          break;
        }

        case READ_INTENTS.EXPLAIN_DOSSIER_STATE:
        case READ_INTENTS.SUMMARIZE_DOSSIER: {
          const scope = String(context?.scope || "").toLowerCase();
          const scopedId = scope === "dossier" ? context?.dossierId : null;
          const hintId = entityHints.find((hint) => hint.type === "id")?.value;
          const hintRef = entityHints.find((hint) => hint.type === "reference")?.value;
          const hintName = entityHints.find((hint) => hint.type === "name")?.value;
          const targetId = hintId || scopedId;

          const fetchDossierByRef = async (reference) => {
            const result = await this._callReadTool(
              "getDossierByReference",
              { reference },
              policy,
            );
            return result?.dossier || null;
          };

          let dossier = null;
          if (targetId) {
            const result = await this._callReadTool(
              "getDossier",
              { dossierId: targetId },
              policy,
            );
            dossier = result?.dossier || null;
          } else if (hintRef) {
            dossier = await fetchDossierByRef(hintRef);
          } else if (hintName) {
            const result = await this._callReadTool(
              "listDossiers",
              { query: hintName, limit: 5 },
              policy,
            );
            const dossiers = result?.dossiers || [];
            if (dossiers.length === 1) dossier = dossiers[0];
            else if (dossiers.length > 1) {
              summary = `Multiple dossiers match "${hintName}"`;
              dossiers.forEach((d) =>
                details.push(
                  `${d.reference || "Dossier"} — ${d.title || "Untitled"} (ID: ${d.id})`,
                ),
              );
              details.push("Please specify which dossier you mean.");
              break;
            }
          }

          if (!dossier) {
            summary = "Which dossier?";
            details.push("Provide a dossier ID or reference.");
            break;
          }

          const tasksResult = await this._callReadTool(
            "listTasks",
            { dossierId: dossier.id, limit: 200 },
            policy,
          );
          const tasks = tasksResult?.tasks || [];
          const sessionsResult = await this._callReadTool(
            "listSessions",
            { dossierId: dossier.id, limit: 200 },
            policy,
          );
          const sessions = sessionsResult?.sessions || [];
          const missionsResult = await this._callReadTool(
            "listMissions",
            { dossierId: dossier.id, limit: 200 },
            policy,
          );
          const missions = missionsResult?.missions || [];
          const financialResult = await this._callReadTool(
            "listFinancialEntries",
            { dossierId: dossier.id, limit: 200 },
            policy,
          );
          const financialEntries = financialResult?.financialEntries || [];
          const lawsuitsResult = await this._callReadTool(
            "listLawsuits",
            { dossierId: dossier.id, limit: 200 },
            policy,
          );
          const lawsuits = lawsuitsResult?.lawsuits || [];
          const overdueTasks = tasks.filter(
            (task) =>
              task.due_date &&
              !["done", "cancelled"].includes(task.status) &&
              new Date(task.due_date) < now,
          );
          const blockedTasks = tasks.filter(
            (task) => String(task.status || "").toLowerCase() === "blocked",
          );
          const deadlineOverdue =
            dossier.next_deadline && new Date(dossier.next_deadline) < now;
          const overdueReceivables = financialEntries.filter(
            (entry) =>
              String(entry.direction || "").toLowerCase() === "receivable" &&
              isFinancialOverdue(entry),
          );
          const historyResult = await this._callReadTool(
            "listHistoryEvents",
            { entityType: "dossier", entityId: dossier.id, limit: 5 },
            policy,
          );
          const historyEvents = historyResult?.historyEvents || [];

          if (intent === READ_INTENTS.EXPLAIN_DOSSIER_STATE) {
            title = "Read data — Dossier state";
            summary = `${dossier.reference || "Dossier"} — ${dossier.title || "Untitled"}`;
            details.push(`Status: ${dossier.status || "open"} (priority ${dossier.priority || "medium"})`);
            details.push(
              `Relationships: ${lawsuits.length} lawsuit(s), ${tasks.length} task(s), ${sessions.length} session(s), ${missions.length} mission(s), ${financialEntries.length} financial entry(ies)`,
            );
            details.push(
              blockedTasks.length > 0 ||
                overdueTasks.length > 0 ||
                deadlineOverdue ||
                overdueReceivables.length > 0
                ? `Blocking: ${blockedTasks.length} blocked task(s), ${overdueTasks.length} overdue task(s), ${overdueReceivables.length} overdue receivable(s), ${deadlineOverdue ? "deadline overdue" : "deadline ok"}`
                : "Blocking: none detected",
            );
            sources.push({
              sourceType: "system",
              reference: "tool:getDossier",
              note: "Dossier state",
            });
            data = dossier;
            break;
          }

          title = "Read data — Dossier summary";
          summary = `${dossier.reference || "Dossier"} — ${dossier.title || "Untitled"}`;
          const recentActivity = historyEvents.map((event) => {
            const when = event.created_at ? formatDateTime(event.created_at) : "unknown";
            return `${when} — ${event.action || "event"}`;
          });
          details.push(
            `Summary: status ${dossier.status || "open"}, ${tasks.length} task(s), ${sessions.length} session(s), ${financialEntries.length} financial entry(ies)`,
          );
          details.push(
            `Recent activity: ${recentActivity.length > 0 ? recentActivity.join(" | ") : "none"}`,
          );
          details.push(
            `Key dates/risks: ${dossier.next_deadline ? `next deadline ${formatDate(dossier.next_deadline)}` : "no deadline"}${deadlineOverdue ? " (overdue)" : ""}${
              overdueReceivables.length > 0
                ? `, ${overdueReceivables.length} overdue receivable(s)`
                : ""
            }`,
          );
          sources.push({
            sourceType: "system",
            reference: "tool:getDossier",
            note: "Dossier summary",
          });
          data = dossier;
          break;
        }

        case READ_INTENTS.READ_LAWSUIT: {
          const hintId = entityHints.find((hint) => hint.type === "id")?.value;
          const hintRef = entityHints.find((hint) => hint.type === "reference")?.value;
          const hintName = entityHints.find((hint) => hint.type === "name")?.value;
          title = "Read data — Lawsuit";

          const resolveFromList = async (query) => {
            const result = await this._callReadTool(
              "listLawsuits",
              { query, limit: 10 },
              policy,
            );
            return result?.lawsuits || [];
          };

          if (hintId) {
            const result = await this._callReadTool(
              "getLawsuit",
              { lawsuitId: hintId },
              policy,
            );
            const lawsuit = result?.lawsuit;
            if (!lawsuit) {
              summary = `No lawsuit found for ID ${hintId}`;
              details.push("Try listing lawsuits to see available records.");
              break;
            }
            summary = `Lawsuit: ${lawsuit.reference || lawsuit.lawsuit_number || hintId}`;
            details.push(`Title: ${lawsuit.title || "Untitled"}`);
            details.push(`Status: ${lawsuit.status || "in_progress"}`);
            if (lawsuit.court) details.push(`Court: ${lawsuit.court}`);
            const adversary =
              lawsuit.adversary_party ||
              lawsuit.adversary_name ||
              lawsuit.adversary;
            if (adversary) details.push(`Adversary: ${adversary}`);
            details.push(`Next hearing: ${lawsuit.next_hearing ? formatDate(lawsuit.next_hearing) : "N/A"}`);
            details.push(`Dossier ID: ${lawsuit.dossier_id || "N/A"}`);
            sources.push({
              sourceType: "system",
              reference: "tool:getLawsuit",
              note: "Lawsuit lookup",
            });
            data = lawsuit;
            break;
          }

          if (hintRef || hintName) {
            const query = hintRef || hintName;
            const lawsuits = await resolveFromList(query);
            if (lawsuits.length === 0) {
              summary = `No lawsuit found for "${query}"`;
              details.push("Try listing all lawsuits with: show me my lawsuits");
            } else if (lawsuits.length === 1) {
              const lawsuit = lawsuits[0];
              summary = `Lawsuit: ${lawsuit.reference || lawsuit.lawsuit_number || "Lawsuit"}`;
              details.push(`Title: ${lawsuit.title || "Untitled"}`);
              details.push(`Status: ${lawsuit.status || "in_progress"}`);
              if (lawsuit.court) details.push(`Court: ${lawsuit.court}`);
              const adversary =
                lawsuit.adversary_party ||
                lawsuit.adversary_name ||
                lawsuit.adversary;
              if (adversary) details.push(`Adversary: ${adversary}`);
              details.push(`Next hearing: ${lawsuit.next_hearing ? formatDate(lawsuit.next_hearing) : "N/A"}`);
              details.push(`Dossier ID: ${lawsuit.dossier_id || "N/A"}`);
              sources.push({
                sourceType: "system",
                reference: "tool:listLawsuits",
                note: "Lawsuit lookup",
              });
              data = lawsuit;
            } else {
              summary = `Multiple lawsuits match "${query}"`;
              lawsuits.forEach((l) => {
                details.push(
                  `${l.reference || l.lawsuit_number || "Lawsuit"} — ${l.title || "Untitled"} (ID: ${l.id})`,
                );
              });
              details.push("Please specify which lawsuit you mean.");
            }
            break;
          }

          summary = "Which lawsuit?";
          details.push("Provide a lawsuit ID or reference.");
          break;
        }

        case READ_INTENTS.EXPLAIN_LAWSUIT_STATE:
        case READ_INTENTS.SUMMARIZE_LAWSUIT: {
          const scope = String(context?.scope || "").toLowerCase();
          const scopedId = scope === "lawsuit" ? context?.lawsuitId : null;
          const hintId = entityHints.find((hint) => hint.type === "id")?.value;
          const hintRef = entityHints.find((hint) => hint.type === "reference")?.value;
          const hintName = entityHints.find((hint) => hint.type === "name")?.value;
          const targetId = hintId || scopedId;

          let lawsuit = null;
          if (targetId) {
            const result = await this._callReadTool(
              "getLawsuit",
              { lawsuitId: targetId },
              policy,
            );
            lawsuit = result?.lawsuit || null;
          } else if (hintRef || hintName) {
            const query = hintRef || hintName;
            const result = await this._callReadTool(
              "listLawsuits",
              { query, limit: 5 },
              policy,
            );
            const lawsuits = result?.lawsuits || [];
            if (lawsuits.length === 1) lawsuit = lawsuits[0];
            else if (lawsuits.length > 1) {
              summary = `Multiple lawsuits match "${query}"`;
              lawsuits.forEach((l) =>
                details.push(
                  `${l.reference || l.lawsuit_number || "Lawsuit"} — ${l.title || "Untitled"} (ID: ${l.id})`,
                ),
              );
              details.push("Please specify which lawsuit you mean.");
              break;
            }
          }

          if (!lawsuit) {
            summary = "Which lawsuit?";
            details.push("Provide a lawsuit ID or reference.");
            break;
          }

          const tasksResult = await this._callReadTool(
            "listTasks",
            { lawsuitId: lawsuit.id, limit: 200 },
            policy,
          );
          const tasks = tasksResult?.tasks || [];
          const sessionsResult = await this._callReadTool(
            "listSessions",
            { lawsuitId: lawsuit.id, limit: 200 },
            policy,
          );
          const sessions = sessionsResult?.sessions || [];
          const overdueTasks = tasks.filter(
            (task) =>
              task.due_date &&
              !["done", "cancelled"].includes(task.status) &&
              new Date(task.due_date) < now,
          );
          const hearingOverdue =
            lawsuit.next_hearing && new Date(lawsuit.next_hearing) < now;
          const historyResult = await this._callReadTool(
            "listHistoryEvents",
            { entityType: "lawsuit", entityId: lawsuit.id, limit: 5 },
            policy,
          );
          const historyEvents = historyResult?.historyEvents || [];

          if (intent === READ_INTENTS.EXPLAIN_LAWSUIT_STATE) {
            title = "Read data — Lawsuit state";
            summary = `${lawsuit.reference || lawsuit.lawsuit_number || "Lawsuit"} — ${lawsuit.title || "Untitled"}`;
            details.push(`Status: ${lawsuit.status || "in_progress"}`);
            if (lawsuit.court) details.push(`Court: ${lawsuit.court}`);
            const adversary =
              lawsuit.adversary_party ||
              lawsuit.adversary_name ||
              lawsuit.adversary;
            if (adversary) details.push(`Adversary: ${adversary}`);
            details.push(
              `Relationships: ${tasks.length} task(s), ${sessions.length} session(s)`,
            );
            details.push(
              hearingOverdue || overdueTasks.length > 0
                ? `Blocking: ${overdueTasks.length} overdue task(s)${hearingOverdue ? ", next hearing overdue" : ""}`
                : "Blocking: none detected",
            );
            sources.push({
              sourceType: "system",
              reference: "tool:getLawsuit",
              note: "Lawsuit state",
            });
            data = lawsuit;
            break;
          }

          title = "Read data — Lawsuit summary";
          summary = `${lawsuit.reference || lawsuit.lawsuit_number || "Lawsuit"} — ${lawsuit.title || "Untitled"}`;
          const recentActivity = historyEvents.map((event) => {
            const when = event.created_at ? formatDateTime(event.created_at) : "unknown";
            return `${when} — ${event.action || "event"}`;
          });
          details.push(
            `Summary: status ${lawsuit.status || "in_progress"}, ${tasks.length} task(s), ${sessions.length} session(s)`,
          );
          if (lawsuit.court) details.push(`Court: ${lawsuit.court}`);
          const adversary =
            lawsuit.adversary_party ||
            lawsuit.adversary_name ||
            lawsuit.adversary;
          if (adversary) details.push(`Adversary: ${adversary}`);
          details.push(
            `Recent activity: ${recentActivity.length > 0 ? recentActivity.join(" | ") : "none"}`,
          );
          details.push(
            `Key dates/risks: ${lawsuit.next_hearing ? `next hearing ${formatDate(lawsuit.next_hearing)}` : "no hearing scheduled"}${hearingOverdue ? " (overdue)" : ""}`,
          );
          sources.push({
            sourceType: "system",
            reference: "tool:getLawsuit",
            note: "Lawsuit summary",
          });
          data = lawsuit;
          break;
        }

        case READ_INTENTS.READ_TASK: {
          const hintId = entityHints.find((hint) => hint.type === "id")?.value;
          const hintName = entityHints.find((hint) => hint.type === "name")?.value;
          title = "Read data — Task";

          if (hintId) {
            const result = await this._callReadTool(
              "getTask",
              { taskId: hintId },
              policy,
            );
            const task = result?.task;
            if (!task) {
              summary = `No task found for ID ${hintId}`;
              details.push("Try listing tasks to see available records.");
              break;
            }
            summary = `Task: ${task.title || hintId}`;
            details.push(`Status: ${task.status || "todo"}`);
            details.push(`Priority: ${task.priority || "medium"}`);
            details.push(`Due date: ${task.due_date ? formatDate(task.due_date) : "N/A"}`);
            details.push(`Dossier ID: ${task.dossier_id || "N/A"}`);
            details.push(`Lawsuit ID: ${task.lawsuit_id || "N/A"}`);
            sources.push({
              sourceType: "system",
              reference: "tool:getTask",
              note: "Task lookup",
            });
            data = task;
            break;
          }

          if (hintName) {
            const result = await this._callReadTool(
              "listTasks",
              { query: hintName, limit: 10 },
              policy,
            );
            const tasks = result?.tasks || [];
            if (tasks.length === 0) {
              summary = `No task found for "${hintName}"`;
              details.push("Try listing all tasks with: show me my tasks");
            } else if (tasks.length === 1) {
              const task = tasks[0];
              summary = `Task: ${task.title || "Task"}`;
              details.push(`Status: ${task.status || "todo"}`);
              details.push(`Priority: ${task.priority || "medium"}`);
              details.push(`Due date: ${task.due_date ? formatDate(task.due_date) : "N/A"}`);
              details.push(`Dossier ID: ${task.dossier_id || "N/A"}`);
              details.push(`Lawsuit ID: ${task.lawsuit_id || "N/A"}`);
              sources.push({
                sourceType: "system",
                reference: "tool:listTasks",
                note: "Task lookup",
              });
              data = task;
            } else {
              summary = `Multiple tasks match "${hintName}"`;
              tasks.forEach((t) =>
                details.push(`${t.title || "Task"} (ID: ${t.id}) — ${t.status || "todo"}`),
              );
              details.push("Please specify which task you mean.");
            }
            break;
          }

          summary = "Which task?";
          details.push("Provide a task ID or title.");
          break;
        }

        case READ_INTENTS.EXPLAIN_TASK_STATE:
        case READ_INTENTS.SUMMARIZE_TASK: {
          const scope = String(context?.scope || "").toLowerCase();
          const scopedId = scope === "task" ? context?.taskId : null;
          const hintId = entityHints.find((hint) => hint.type === "id")?.value;
          const hintName = entityHints.find((hint) => hint.type === "name")?.value;
          const targetId = hintId || scopedId;

          if (
            intent === READ_INTENTS.SUMMARIZE_TASK &&
            !targetId &&
            !hintName
          ) {
            const listResult = await this._callReadTool(
              "listTasks",
              { limit: 200 },
              policy,
            );
            const tasks = listResult?.tasks || [];
            const pending = tasks.filter(
              (task) =>
                !["done", "cancelled"].includes(
                  String(task.status || "").toLowerCase(),
                ),
            );
            const overdue = pending.filter(
              (task) =>
                task.due_date && new Date(task.due_date) < now,
            );
            const byPriority = pending.reduce((acc, task) => {
              const key = String(task.priority || "medium").toLowerCase();
              acc[key] = (acc[key] || 0) + 1;
              return acc;
            }, {});

            title = "Read data — Task workload summary";
            summary =
              pending.length > 0
                ? `${pending.length} pending task(s)`
                : "No pending tasks";
            details.push(
              `Overdue: ${overdue.length}`,
            );
            details.push(
              `By priority: ${Object.entries(byPriority)
                .map(([key, count]) => `${key} ${count}`)
                .join(", ") || "N/A"}`,
            );
            details.push(
              `Total tasks in scope: ${tasks.length}`,
            );
            sources.push({
              sourceType: "system",
              reference: "tool:listTasks",
              note: "Pending workload summary",
            });
            data = tasks;
            break;
          }

          let task = null;
          if (targetId) {
            const result = await this._callReadTool(
              "getTask",
              { taskId: targetId },
              policy,
            );
            task = result?.task || null;
          } else if (hintName) {
            const result = await this._callReadTool(
              "listTasks",
              { query: hintName, limit: 5 },
              policy,
            );
            const tasks = result?.tasks || [];
            if (tasks.length === 1) task = tasks[0];
            else if (tasks.length > 1) {
              summary = `Multiple tasks match "${hintName}"`;
              tasks.forEach((t) =>
                details.push(`${t.title || "Task"} (ID: ${t.id}) — ${t.status || "todo"}`),
              );
              details.push("Please specify which task you mean.");
              break;
            }
          }

          if (!task) {
            summary = "Which task?";
            details.push("Provide a task ID or title.");
            break;
          }

          const overdue =
            task.due_date &&
            !["done", "cancelled"].includes(task.status) &&
            new Date(task.due_date) < now;
          const blocked = String(task.status || "").toLowerCase() === "blocked";
          const historyResult = await this._callReadTool(
            "listHistoryEvents",
            { entityType: "task", entityId: task.id, limit: 5 },
            policy,
          );
          const historyEvents = historyResult?.historyEvents || [];

          if (intent === READ_INTENTS.EXPLAIN_TASK_STATE) {
            title = "Read data — Task state";
            summary = `${task.title || "Task"} (ID: ${task.id})`;
            details.push(`Status: ${task.status || "todo"} (priority ${task.priority || "medium"})`);
            details.push(
              `Relationships: dossier ${task.dossier_id || "N/A"}, lawsuit ${task.lawsuit_id || "N/A"}`,
            );
            details.push(
              blocked || overdue
                ? `Blocking: ${blocked ? "blocked" : ""}${blocked && overdue ? ", " : ""}${overdue ? "overdue" : ""}`
                : "Blocking: none detected",
            );
            sources.push({
              sourceType: "system",
              reference: "tool:getTask",
              note: "Task state",
            });
            data = task;
            break;
          }

          title = "Read data — Task summary";
          summary = `${task.title || "Task"} (ID: ${task.id})`;
          const recentActivity = historyEvents.map((event) => {
            const when = event.created_at ? formatDateTime(event.created_at) : "unknown";
            return `${when} — ${event.action || "event"}`;
          });
          details.push(
            `Summary: status ${task.status || "todo"}, due ${task.due_date ? formatDate(task.due_date) : "N/A"}`,
          );
          details.push(
            `Recent activity: ${recentActivity.length > 0 ? recentActivity.join(" | ") : "none"}`,
          );
          details.push(`Key dates/risks: ${overdue ? "task overdue" : "no overdue risk"}`);
          sources.push({
            sourceType: "system",
            reference: "tool:getTask",
            note: "Task summary",
          });
          data = task;
          break;
        }

        case READ_INTENTS.READ_PERSONAL_TASK: {
          const hintId = entityHints.find((hint) => hint.type === "id")?.value;
          const hintName = entityHints.find((hint) => hint.type === "name")?.value;
          title = "Read data — Personal task";

          if (hintId) {
            const result = await this._callReadTool(
              "getPersonalTask",
              { personalTaskId: hintId },
              policy,
            );
            const task = result?.personalTask;
            if (!task) {
              summary = `No personal task found for ID ${hintId}`;
              details.push("Try listing personal tasks to see available records.");
              break;
            }
            summary = `Personal task: ${task.title || hintId}`;
            details.push(`Status: ${task.status || "todo"}`);
            details.push(`Priority: ${task.priority || "medium"}`);
            details.push(`Due date: ${task.due_date ? formatDate(task.due_date) : "N/A"}`);
            sources.push({
              sourceType: "system",
              reference: "tool:getPersonalTask",
              note: "Personal task lookup",
            });
            data = task;
            break;
          }

          if (hintName) {
            const result = await this._callReadTool(
              "listPersonalTasks",
              { query: hintName, limit: 10 },
              policy,
            );
            const tasks = result?.personalTasks || [];
            if (tasks.length === 0) {
              summary = `No personal task found for "${hintName}"`;
              details.push("Try listing all personal tasks with: show me my personal tasks");
            } else if (tasks.length === 1) {
              const task = tasks[0];
              summary = `Personal task: ${task.title || "Personal task"}`;
              details.push(`Status: ${task.status || "todo"}`);
              details.push(`Priority: ${task.priority || "medium"}`);
              details.push(`Due date: ${task.due_date ? formatDate(task.due_date) : "N/A"}`);
              sources.push({
                sourceType: "system",
                reference: "tool:listPersonalTasks",
                note: "Personal task lookup",
              });
              data = task;
            } else {
              summary = `Multiple personal tasks match "${hintName}"`;
              tasks.forEach((t) =>
                details.push(`${t.title || "Personal task"} (ID: ${t.id}) — ${t.status || "todo"}`),
              );
              details.push("Please specify which personal task you mean.");
            }
            break;
          }

          summary = "Which personal task?";
          details.push("Provide a personal task ID or title.");
          break;
        }

        case READ_INTENTS.EXPLAIN_PERSONAL_TASK_STATE:
        case READ_INTENTS.SUMMARIZE_PERSONAL_TASK: {
          const hintId = entityHints.find((hint) => hint.type === "id")?.value;
          const hintName = entityHints.find((hint) => hint.type === "name")?.value;
          const targetId =
            hintId ||
            (String(context?.scope || "").toLowerCase() === "personal_task"
              ? context?.taskId
              : null);

          let task = null;
          if (targetId) {
            const result = await this._callReadTool(
              "getPersonalTask",
              { personalTaskId: targetId },
              policy,
            );
            task = result?.personalTask || null;
          } else if (hintName) {
            const result = await this._callReadTool(
              "listPersonalTasks",
              { query: hintName, limit: 5 },
              policy,
            );
            const tasks = result?.personalTasks || [];
            if (tasks.length === 1) task = tasks[0];
            else if (tasks.length > 1) {
              summary = `Multiple personal tasks match "${hintName}"`;
              tasks.forEach((t) =>
                details.push(`${t.title || "Personal task"} (ID: ${t.id}) — ${t.status || "todo"}`),
              );
              details.push("Please specify which personal task you mean.");
              break;
            }
          }

          if (!task) {
            summary = "Which personal task?";
            details.push("Provide a personal task ID or title.");
            break;
          }

          const overdue =
            task.due_date &&
            !["done", "cancelled"].includes(task.status) &&
            new Date(task.due_date) < now;
          const historyResult = await this._callReadTool(
            "listHistoryEvents",
            { entityType: "personal_task", entityId: task.id, limit: 5 },
            policy,
          );
          const historyEvents = historyResult?.historyEvents || [];

          if (intent === READ_INTENTS.EXPLAIN_PERSONAL_TASK_STATE) {
            title = "Read data — Personal task state";
            summary = `${task.title || "Personal task"} (ID: ${task.id})`;
            details.push(`Status: ${task.status || "todo"} (priority ${task.priority || "medium"})`);
            details.push(overdue ? "Blocking: overdue" : "Blocking: none detected");
            sources.push({
              sourceType: "system",
              reference: "tool:getPersonalTask",
              note: "Personal task state",
            });
            data = task;
            break;
          }

          title = "Read data — Personal task summary";
          summary = `${task.title || "Personal task"} (ID: ${task.id})`;
          const recentActivity = historyEvents.map((event) => {
            const when = event.created_at ? formatDateTime(event.created_at) : "unknown";
            return `${when} — ${event.action || "event"}`;
          });
          details.push(
            `Summary: status ${task.status || "todo"}, due ${task.due_date ? formatDate(task.due_date) : "N/A"}`,
          );
          details.push(
            `Recent activity: ${recentActivity.length > 0 ? recentActivity.join(" | ") : "none"}`,
          );
          details.push(`Key dates/risks: ${overdue ? "task overdue" : "no overdue risk"}`);
          sources.push({
            sourceType: "system",
            reference: "tool:getPersonalTask",
            note: "Personal task summary",
          });
          data = task;
          break;
        }

        case READ_INTENTS.READ_SESSION: {
          const hintId = entityHints.find((hint) => hint.type === "id")?.value;
          const hintName = entityHints.find((hint) => hint.type === "name")?.value;
          title = "Read data — Session";

          if (hintId) {
            const result = await this._callReadTool(
              "getSession",
              { sessionId: hintId },
              policy,
            );
            const session = result?.session;
            if (!session) {
              summary = `No session found for ID ${hintId}`;
              details.push("Try listing sessions to see available records.");
              break;
            }
            summary = `Session: ${session.title || session.session_type || hintId}`;
            details.push(`Status: ${session.status || "scheduled"}`);
            details.push(
              `Scheduled: ${session.scheduled_at ? formatDateTime(session.scheduled_at) : "N/A"}`,
            );
            details.push(`Location: ${session.location || "N/A"}`);
            details.push(`Dossier ID: ${session.dossier_id || "N/A"}`);
            details.push(`Lawsuit ID: ${session.lawsuit_id || "N/A"}`);
            sources.push({
              sourceType: "system",
              reference: "tool:getSession",
              note: "Session lookup",
            });
            data = session;
            break;
          }

          if (hintName) {
            const result = await this._callReadTool(
              "listSessions",
              { query: hintName, limit: 10 },
              policy,
            );
            const sessions = result?.sessions || [];
            if (sessions.length === 0) {
              summary = `No session found for "${hintName}"`;
              details.push("Try listing all sessions with: show me my sessions");
            } else if (sessions.length === 1) {
              const session = sessions[0];
              summary = `Session: ${session.title || session.session_type || "Session"}`;
              details.push(`Status: ${session.status || "scheduled"}`);
              details.push(
                `Scheduled: ${session.scheduled_at ? formatDateTime(session.scheduled_at) : "N/A"}`,
              );
              details.push(`Location: ${session.location || "N/A"}`);
              details.push(`Dossier ID: ${session.dossier_id || "N/A"}`);
              details.push(`Lawsuit ID: ${session.lawsuit_id || "N/A"}`);
              sources.push({
                sourceType: "system",
                reference: "tool:listSessions",
                note: "Session lookup",
              });
              data = session;
            } else {
              summary = `Multiple sessions match "${hintName}"`;
              sessions.forEach((s) =>
                details.push(
                  `${s.title || s.session_type || "Session"} (ID: ${s.id}) — ${s.status || "scheduled"}`,
                ),
              );
              details.push("Please specify which session you mean.");
            }
            break;
          }

          summary = "Which session?";
          details.push("Provide a session ID or title.");
          break;
        }

        case READ_INTENTS.EXPLAIN_SESSION_STATE:
        case READ_INTENTS.SUMMARIZE_SESSION: {
          const hintId = getHintValue("id", "session") || getHintValue("id");
          const hintName = getHintValue("name", "session") || getHintValue("name");
          const scopedId = scope === "session" ? context?.sessionId : null;
          const targetId = hintId || scopedId;

          let session = null;
          if (targetId) {
            const result = await this._callReadTool(
              "getSession",
              { sessionId: targetId },
              policy,
            );
            session = result?.session || null;
          } else if (hintName) {
            const result = await this._callReadTool(
              "listSessions",
              { query: hintName, limit: 10 },
              policy,
            );
            const sessions = result?.sessions || [];
            if (sessions.length === 1) {
              session = sessions[0];
            } else if (sessions.length > 1) {
              title =
                intent === READ_INTENTS.EXPLAIN_SESSION_STATE
                  ? "Read data — Session state"
                  : "Read data — Session summary";
              summary = `Multiple sessions match "${hintName}"`;
              sessions.forEach((s) =>
                details.push(
                  `${s.title || s.session_type || "Session"} (ID: ${s.id}) — ${s.status || "scheduled"}`,
                ),
              );
              details.push("Please specify which session you mean.");
              break;
            }
          }

          if (!session) {
            summary = "Which session?";
            details.push("Provide a session ID or title.");
            break;
          }

          const participants = Array.isArray(session.participants)
            ? session.participants
            : [];
          const overdue = isSessionOverdue(session);
          const historyResult = await this._callReadTool(
            "listHistoryEvents",
            { entityType: "session", entityId: session.id, limit: 5 },
            policy,
          );
          const historyEvents = historyResult?.historyEvents || [];

          if (intent === READ_INTENTS.EXPLAIN_SESSION_STATE) {
            title = "Read data — Session state";
            summary = `Session: ${session.title || session.session_type || "Session"}`;
            details.push(`Status: ${session.status || "scheduled"}`);
            details.push(
              `Scheduled: ${session.scheduled_at ? formatDateTime(session.scheduled_at) : "N/A"}`,
            );
            details.push(`Location: ${session.location || "N/A"}`);
            details.push(
              `Participants: ${participants.length > 0 ? participants.length : "N/A"}`,
            );
            if (session.outcome)
              details.push(`Outcome: ${session.outcome}`);
            details.push(
              `Relationships: dossier ${session.dossier_id || "N/A"}, case ${session.lawsuit_id || "N/A"}`,
            );
            details.push(
              overdue ? "Blocking: session date passed" : "Blocking: none detected",
            );
            const normalizedStatus = String(session.status || "scheduled").toLowerCase();
            let nextSteps = "No follow-up recorded yet.";
            if (normalizedStatus === "scheduled") {
              if (session.scheduled_at && new Date(session.scheduled_at) < now) {
                nextSteps = "Scheduled date has passed; outcome not recorded.";
              } else {
                nextSteps = "Session is upcoming; outcome not recorded.";
              }
            } else if (["completed", "done"].includes(normalizedStatus)) {
              nextSteps = session.outcome
                ? "Outcome recorded; follow-up items may exist."
                : "Outcome missing; follow-up items may exist.";
            } else if (normalizedStatus === "cancelled") {
              nextSteps = "Session cancelled; no outcome recorded.";
            }
            details.push("Explanation:");
            details.push(`Next steps (read-only): ${nextSteps}`);
            sources.push({
              sourceType: "system",
              reference: "tool:getSession",
              note: "Session state",
            });
            data = session;
            break;
          }

          title = "Read data — Session summary";
          summary = `Session: ${session.title || session.session_type || "Session"}`;
          const recentActivity = historyEvents.map((event) => {
            const when = event.created_at ? formatDateTime(event.created_at) : "unknown";
            return `${when} — ${event.action || "event"}`;
          });
          details.push(
            `Summary: status ${session.status || "scheduled"}, scheduled ${session.scheduled_at ? formatDateTime(session.scheduled_at) : "N/A"}`,
          );
          details.push(
            `Outcome: ${session.outcome || "not recorded"}`,
          );
          details.push(
            `Recent activity: ${recentActivity.length > 0 ? recentActivity.join(" | ") : "none"}`,
          );
          details.push(
            `Key dates/risks: ${session.scheduled_at ? formatDateTime(session.scheduled_at) : "no schedule"}${overdue ? " (overdue)" : ""}`,
          );
          sources.push({
            sourceType: "system",
            reference: "tool:getSession",
            note: "Session summary",
          });
          data = session;
          break;
        }

        case READ_INTENTS.READ_MISSION: {
          const hintId = entityHints.find((hint) => hint.type === "id")?.value;
          const hintRef = entityHints.find((hint) => hint.type === "reference")?.value;
          const hintName = entityHints.find((hint) => hint.type === "name")?.value;
          title = "Read data — Mission";

          if (hintId) {
            const result = await this._callReadTool(
              "getMission",
              { missionId: hintId },
              policy,
            );
            const mission = result?.mission;
            if (!mission) {
              summary = `No mission found for ID ${hintId}`;
              details.push("Try listing missions to see available records.");
              break;
            }
            summary = `Mission: ${mission.reference || mission.title || hintId}`;
            details.push(`Title: ${mission.title || "Untitled"}`);
            details.push(`Status: ${mission.status || "planned"}`);
            details.push(`Due date: ${mission.due_date ? formatDate(mission.due_date) : "N/A"}`);
            details.push(`Dossier ID: ${mission.dossier_id || "N/A"}`);
            details.push(`Lawsuit ID: ${mission.lawsuit_id || "N/A"}`);
            sources.push({
              sourceType: "system",
              reference: "tool:getMission",
              note: "Mission lookup",
            });
            data = mission;
            break;
          }

          if (hintRef || hintName) {
            const query = hintRef || hintName;
            const result = await this._callReadTool(
              "listMissions",
              { query, limit: 10 },
              policy,
            );
            const missions = result?.missions || [];
            if (missions.length === 0) {
              summary = `No mission found for "${query}"`;
              details.push("Try listing all missions with: show me my missions");
            } else if (missions.length === 1) {
              const mission = missions[0];
              summary = `Mission: ${mission.reference || mission.title || "Mission"}`;
              details.push(`Title: ${mission.title || "Untitled"}`);
              details.push(`Status: ${mission.status || "planned"}`);
              details.push(`Due date: ${mission.due_date ? formatDate(mission.due_date) : "N/A"}`);
              details.push(`Dossier ID: ${mission.dossier_id || "N/A"}`);
              details.push(`Lawsuit ID: ${mission.lawsuit_id || "N/A"}`);
              sources.push({
                sourceType: "system",
                reference: "tool:listMissions",
                note: "Mission lookup",
              });
              data = mission;
            } else {
              summary = `Multiple missions match "${query}"`;
              missions.forEach((m) =>
                details.push(
                  `${m.reference || "Mission"} — ${m.title || "Untitled"} (ID: ${m.id})`,
                ),
              );
              details.push("Please specify which mission you mean.");
            }
            break;
          }

          summary = "Which mission?";
          details.push("Provide a mission ID or reference.");
          break;
        }

        case READ_INTENTS.EXPLAIN_MISSION_STATE:
        case READ_INTENTS.SUMMARIZE_MISSION: {
          const hintId = getHintValue("id", "mission") || getHintValue("id");
          const hintRef = getHintValue("reference", "mission");
          const hintName = getHintValue("name", "mission") || getHintValue("name");
          const scopedId = scope === "mission" ? context?.missionId : null;
          const targetId = hintId || scopedId;

          let mission = null;
          if (targetId) {
            const result = await this._callReadTool(
              "getMission",
              { missionId: targetId },
              policy,
            );
            mission = result?.mission || null;
          } else if (hintRef || hintName) {
            const query = hintRef || hintName;
            const result = await this._callReadTool(
              "listMissions",
              { query, limit: 10 },
              policy,
            );
            const missions = result?.missions || [];
            if (missions.length === 1) {
              mission = missions[0];
            } else if (missions.length > 1) {
              title =
                intent === READ_INTENTS.EXPLAIN_MISSION_STATE
                  ? "Read data — Mission state"
                  : "Read data — Mission summary";
              summary = `Multiple missions match "${query}"`;
              missions.forEach((m) =>
                details.push(
                  `${m.reference || "Mission"} — ${m.title || "Untitled"} (ID: ${m.id})`,
                ),
              );
              details.push("Please specify which mission you mean.");
              break;
            }
          }

          if (!mission) {
            summary = "Which mission?";
            details.push("Provide a mission ID or reference.");
            break;
          }

          const overdue = isMissionOverdue(mission);
          const historyResult = await this._callReadTool(
            "listHistoryEvents",
            { entityType: "mission", entityId: mission.id, limit: 5 },
            policy,
          );
          const historyEvents = historyResult?.historyEvents || [];

          if (intent === READ_INTENTS.EXPLAIN_MISSION_STATE) {
            title = "Read data — Mission state";
            summary = `Mission: ${mission.reference || mission.title || "Mission"}`;
            details.push(`Status: ${mission.status || "planned"}`);
            details.push(`Priority: ${mission.priority || "medium"}`);
            details.push(`Due date: ${mission.due_date ? formatDate(mission.due_date) : "N/A"}`);
            details.push(
              `Relationships: dossier ${mission.dossier_id || "N/A"}, case ${mission.lawsuit_id || "N/A"}`,
            );
            details.push(
              overdue ? "Blocking: mission overdue" : "Blocking: none detected",
            );
            details.push("Explanation:");
            details.push(
              mission.result
                ? `Progress: result recorded (${mission.result})`
                : "Progress: no result recorded",
            );
            sources.push({
              sourceType: "system",
              reference: "tool:getMission",
              note: "Mission state",
            });
            data = mission;
            break;
          }

          title = "Read data — Mission summary";
          summary = `Mission: ${mission.reference || mission.title || "Mission"}`;
          const recentActivity = historyEvents.map((event) => {
            const when = event.created_at ? formatDateTime(event.created_at) : "unknown";
            return `${when} — ${event.action || "event"}`;
          });
          details.push(
            `Summary: status ${mission.status || "planned"}, due ${mission.due_date ? formatDate(mission.due_date) : "N/A"}`,
          );
          details.push(`Result: ${mission.result || "not recorded"}`);
          details.push(
            `Recent activity: ${recentActivity.length > 0 ? recentActivity.join(" | ") : "none"}`,
          );
          details.push(
            `Key dates/risks: ${mission.due_date ? formatDate(mission.due_date) : "no due date"}${overdue ? " (overdue)" : ""}`,
          );
          sources.push({
            sourceType: "system",
            reference: "tool:getMission",
            note: "Mission summary",
          });
          data = mission;
          break;
        }

        case READ_INTENTS.READ_FINANCIAL_ENTRY: {
          const hintId = entityHints.find((hint) => hint.type === "id")?.value;
          const hintRef = entityHints.find((hint) => hint.type === "reference")?.value;
          const hintName = entityHints.find((hint) => hint.type === "name")?.value;
          title = "Read data — Financial entry";

          if (hintId) {
            const result = await this._callReadTool(
              "getFinancialEntry",
              { financialEntryId: hintId },
              policy,
            );
            const entry = result?.financialEntry;
            if (!entry) {
              summary = `No financial entry found for ID ${hintId}`;
              details.push("Try listing entries to see available records.");
              break;
            }
            summary = `Entry: ${entry.reference || entry.title || hintId}`;
            details.push(`Status: ${entry.status || "draft"}`);
            details.push(
              `Amount: ${entry.amount ? `${entry.amount} ${entry.currency || ""}`.trim() : "N/A"}`,
            );
            details.push(`Due date: ${entry.due_date ? formatDate(entry.due_date) : "N/A"}`);
            details.push(`Client ID: ${entry.client_id || "N/A"}`);
            details.push(`Dossier ID: ${entry.dossier_id || "N/A"}`);
            sources.push({
              sourceType: "system",
              reference: "tool:getFinancialEntry",
              note: "Financial entry lookup",
            });
            data = entry;
            break;
          }

          if (hintRef || hintName) {
            const query = hintRef || hintName;
            const result = await this._callReadTool(
              "listFinancialEntries",
              { query, limit: 10 },
              policy,
            );
            const entries = result?.financialEntries || [];
            if (entries.length === 0) {
              summary = `No financial entry found for "${query}"`;
              details.push("Try listing all entries with: show me my accounting entries");
            } else if (entries.length === 1) {
              const entry = entries[0];
              summary = `Entry: ${entry.reference || entry.title || "Financial entry"}`;
              details.push(`Status: ${entry.status || "draft"}`);
              details.push(
                `Amount: ${entry.amount ? `${entry.amount} ${entry.currency || ""}`.trim() : "N/A"}`,
              );
              details.push(`Due date: ${entry.due_date ? formatDate(entry.due_date) : "N/A"}`);
              details.push(`Client ID: ${entry.client_id || "N/A"}`);
              details.push(`Dossier ID: ${entry.dossier_id || "N/A"}`);
              sources.push({
                sourceType: "system",
                reference: "tool:listFinancialEntries",
                note: "Financial entry lookup",
              });
              data = entry;
            } else {
              summary = `Multiple financial entries match "${query}"`;
              entries.forEach((e) => {
                const ref = e.reference || e.title || "Entry";
                details.push(`${ref} (ID: ${e.id}) — ${e.status || "draft"}`);
              });
              details.push("Please specify which entry you mean.");
            }
            break;
          }

          summary = "Which financial entry?";
          details.push("Provide an entry ID or reference.");
          break;
        }

        case READ_INTENTS.EXPLAIN_FINANCIAL_ENTRY_STATE:
        case READ_INTENTS.SUMMARIZE_FINANCIAL_ENTRY: {
          const hintId =
            getHintValue("id", "financial_entry") || getHintValue("id");
          const hintRef = getHintValue("reference", "financial_entry");
          const hintName =
            getHintValue("name", "financial_entry") || getHintValue("name");
          const hasEntryHint = Boolean(hintId || hintRef || hintName);

          let entry = null;
          if (hintId) {
            const result = await this._callReadTool(
              "getFinancialEntry",
              { financialEntryId: hintId },
              policy,
            );
            entry = result?.financialEntry || null;
          } else if (hintRef || hintName) {
            const query = hintRef || hintName;
            const result = await this._callReadTool(
              "listFinancialEntries",
              { query, limit: 10 },
              policy,
            );
            const entries = result?.financialEntries || [];
            if (entries.length === 1) {
              entry = entries[0];
            } else if (entries.length > 1) {
              title =
                intent === READ_INTENTS.EXPLAIN_FINANCIAL_ENTRY_STATE
                  ? "Read data — Financial status"
                  : "Read data — Financial summary";
              summary = `Multiple financial entries match "${query}"`;
              entries.forEach((e) => {
                const ref = e.reference || e.title || "Entry";
                details.push(`${ref} (ID: ${e.id}) — ${e.status || "draft"}`);
              });
              details.push("Please specify which entry you mean.");
              break;
            }
          }

          if (!entry && hasEntryHint) {
            summary = "Which financial entry?";
            details.push("Provide an entry ID or reference.");
            break;
          }

          if (!entry) {
            // Aggregate financial status / balance summary
            let clientId = scope === "client" ? context?.clientId : null;
            let dossierId = scope === "dossier" ? context?.dossierId : null;
            let lawsuitId = scope === "lawsuit" ? context?.lawsuitId : null;
            let missionId = scope === "mission" ? context?.missionId : null;
            let taskId = scope === "task" ? context?.taskId : null;
            let personalTaskId =
              scope === "personal_task" ? context?.personalTaskId : null;

            if (
              !clientId &&
              !dossierId &&
              !lawsuitId &&
              !missionId &&
              !taskId &&
              !personalTaskId
            ) {
              const hintClientId = getHintValue("id", "client");
              const hintClientName = getHintValue("name", "client");
              if (hintClientId) {
                clientId = hintClientId;
              } else if (hintClientName) {
                const resolution = await this._resolveEntity(
                  { type: "client", nameHint: hintClientName },
                  policy,
                );
                if (resolution.resolved) {
                  clientId = resolution.entity.id;
                } else if (resolution.reason === "ambiguous") {
                  title = "Read data — Financial summary";
                  summary = resolution.message;
                  resolution.candidates?.forEach((c) =>
                    details.push(`${c.name} (ID: ${c.id})`),
                  );
                  details.push("Please specify which client you mean.");
                  break;
                } else if (resolution.reason === "not_found") {
                  title = "Read data — Financial summary";
                  summary = resolution.message;
                  details.push("Try listing clients to see available records.");
                  break;
                }
              }
            }

            if (
              !dossierId &&
              (getHintValue("reference", "dossier") || getHintValue("name", "dossier"))
            ) {
              const resolution = await this._resolveEntity(
                {
                  type: "dossier",
                  reference: getHintValue("reference", "dossier") || undefined,
                  nameHint: getHintValue("name", "dossier") || undefined,
                },
                policy,
              );
              if (resolution.resolved) {
                dossierId = resolution.entity.id;
              } else if (resolution.reason === "ambiguous") {
                title = "Read data — Financial summary";
                summary = resolution.message;
                resolution.candidates?.forEach((c) =>
                  details.push(`${c.name} (ID: ${c.id})`),
                );
                details.push("Please specify which dossier you mean.");
                break;
              } else if (resolution.reason === "not_found") {
                title = "Read data — Financial summary";
                summary = resolution.message;
                details.push("Try listing dossiers to see available records.");
                break;
              }
            }

            if (
              !lawsuitId &&
              (getHintValue("reference", "lawsuit") || getHintValue("name", "lawsuit"))
            ) {
              const resolution = await this._resolveEntity(
                {
                  type: "lawsuit",
                  reference: getHintValue("reference", "lawsuit") || undefined,
                  nameHint: getHintValue("name", "lawsuit") || undefined,
                },
                policy,
              );
              if (resolution.resolved) {
                lawsuitId = resolution.entity.id;
              } else if (resolution.reason === "ambiguous") {
                title = "Read data — Financial summary";
                summary = resolution.message;
                resolution.candidates?.forEach((c) =>
                  details.push(`${c.name} (ID: ${c.id})`),
                );
                details.push("Please specify which case you mean.");
                break;
              } else if (resolution.reason === "not_found") {
                title = "Read data — Financial summary";
                summary = resolution.message;
                details.push("Try listing cases to see available records.");
                break;
              }
            }

            if (
              !missionId &&
              (getHintValue("reference", "mission") || getHintValue("name", "mission"))
            ) {
              const resolution = await this._resolveEntity(
                {
                  type: "mission",
                  reference: getHintValue("reference", "mission") || undefined,
                  nameHint: getHintValue("name", "mission") || undefined,
                },
                policy,
              );
              if (resolution.resolved) {
                missionId = resolution.entity.id;
              } else if (resolution.reason === "ambiguous") {
                title = "Read data — Financial summary";
                summary = resolution.message;
                resolution.candidates?.forEach((c) =>
                  details.push(`${c.name} (ID: ${c.id})`),
                );
                details.push("Please specify which mission you mean.");
                break;
              } else if (resolution.reason === "not_found") {
                title = "Read data — Financial summary";
                summary = resolution.message;
                details.push("Try listing missions to see available records.");
                break;
              }
            }

            if (!taskId && getHintValue("id", "task")) {
              taskId = getHintValue("id", "task");
            }
            if (!personalTaskId && getHintValue("id", "personal_task")) {
              personalTaskId = getHintValue("id", "personal_task");
            }

            const scopeCount = [
              clientId,
              dossierId,
              lawsuitId,
              missionId,
              taskId,
              personalTaskId,
            ].filter(Boolean).length;
            if (scopeCount > 1) {
              title = "Read data — Financial summary";
              summary = "Multiple scopes detected for financial entries.";
              details.push(
                "Please specify a single client, dossier, case, mission, or task.",
              );
              break;
            }

            const result = await this._callReadTool(
              "listFinancialEntries",
              {
                limit: 200,
                paymentStatus: filters?.paymentStatus || null,
                clientId,
                dossierId,
                lawsuitId,
                missionId,
                taskId,
                personalTaskId,
              },
              policy,
            );
            const entries = result?.financialEntries || [];
            const totals = {};
            const unpaidTotals = {};
            const overdueTotals = {};
            let unpaidCount = 0;
            let overdueCount = 0;

            const addAmount = (map, currency, amount) => {
              const key = currency || "N/A";
              map[key] = (map[key] || 0) + amount;
            };

            entries.forEach((item) => {
              const amount = Number(item.amount || 0);
              const currency = item.currency || "N/A";
              addAmount(totals, currency, amount);
              if (item.paid_at) {
                return;
              }
              unpaidCount += 1;
              addAmount(unpaidTotals, currency, amount);
              if (isFinancialOverdue(item)) {
                overdueCount += 1;
                addAmount(overdueTotals, currency, amount);
              }
            });

            const formatTotals = (map) =>
              Object.entries(map)
                .map(([currency, amount]) => `${amount} ${currency}`)
                .join(", ");

            title =
              intent === READ_INTENTS.EXPLAIN_FINANCIAL_ENTRY_STATE
                ? "Read data — Financial status"
                : "Read data — Financial summary";
            summary =
              entries.length > 0
                ? `${entries.length} financial entry(ies) in scope`
                : "No financial entries found";
            details.push(
              `Entries: ${entries.length} total, ${unpaidCount} unpaid, ${overdueCount} overdue`,
            );
            details.push(
              `Totals: ${formatTotals(totals) || "N/A"}`,
            );
            details.push(
              `Unpaid: ${formatTotals(unpaidTotals) || "N/A"}`,
            );
            if (overdueCount > 0) {
              details.push(
                `Overdue: ${formatTotals(overdueTotals) || "N/A"}`,
              );
            }
            sources.push({
              sourceType: "system",
              reference: "tool:listFinancialEntries",
              note: "Financial summary",
            });
            data = entries;
            break;
          }

          const paymentStatus = entry.paid_at
            ? "paid"
            : isFinancialOverdue(entry)
              ? "overdue"
              : "unpaid";
          const historyResult = await this._callReadTool(
            "listHistoryEvents",
            { entityType: "financial_entry", entityId: entry.id, limit: 5 },
            policy,
          );
          const historyEvents = historyResult?.historyEvents || [];

          if (intent === READ_INTENTS.EXPLAIN_FINANCIAL_ENTRY_STATE) {
            title = "Read data — Financial status";
            summary = `${entry.reference || entry.title || "Financial entry"} (ID: ${entry.id})`;
            details.push(`Status: ${entry.status || "draft"}`);
            details.push(`Payment status: ${paymentStatus}`);
            details.push(
              `Amount: ${entry.amount ? `${entry.amount} ${entry.currency || ""}`.trim() : "N/A"}`,
            );
            details.push(`Due date: ${entry.due_date ? formatDate(entry.due_date) : "N/A"}`);
            details.push(
              `Relationships: client ${entry.client_id || "N/A"}, dossier ${entry.dossier_id || "N/A"}, case ${entry.lawsuit_id || "N/A"}`,
            );
            details.push(
              paymentStatus === "overdue"
                ? "Blocking: entry overdue"
                : "Blocking: none detected",
            );
            details.push("Explanation:");
            details.push(
              entry.paid_at
                ? `Paid on ${formatDate(entry.paid_at)}`
                : "No payment recorded yet",
            );
            sources.push({
              sourceType: "system",
              reference: "tool:getFinancialEntry",
              note: "Financial entry state",
            });
            data = entry;
            break;
          }

          title = "Read data — Financial summary";
          summary = `${entry.reference || entry.title || "Financial entry"} (ID: ${entry.id})`;
          const recentActivity = historyEvents.map((event) => {
            const when = event.created_at ? formatDateTime(event.created_at) : "unknown";
            return `${when} — ${event.action || "event"}`;
          });
          details.push(
            `Summary: status ${entry.status || "draft"}, payment ${paymentStatus}`,
          );
          details.push(
            `Amount: ${entry.amount ? `${entry.amount} ${entry.currency || ""}`.trim() : "N/A"}`,
          );
          details.push(
            `Recent activity: ${recentActivity.length > 0 ? recentActivity.join(" | ") : "none"}`,
          );
          details.push(
            `Key dates/risks: ${entry.due_date ? formatDate(entry.due_date) : "no due date"}${
              paymentStatus === "overdue" ? " (overdue)" : ""
            }`,
          );
          sources.push({
            sourceType: "system",
            reference: "tool:getFinancialEntry",
            note: "Financial entry summary",
          });
          data = entry;
          break;
        }

        case READ_INTENTS.READ_NOTIFICATION: {
          const hintId = entityHints.find((hint) => hint.type === "id")?.value;
          const hintName = entityHints.find((hint) => hint.type === "name")?.value;
          title = "Read data — Notification";

          if (hintId) {
            const result = await this._callReadTool(
              "getNotification",
              { notificationId: hintId },
              policy,
            );
            const notification = result?.notification;
            if (!notification) {
              summary = `No notification found for ID ${hintId}`;
              details.push("Try listing notifications to see available records.");
              break;
            }
            summary = `Notification: ${notification.template_key || notification.type || hintId}`;
            details.push(`Status: ${notification.status || "unread"}`);
            details.push(`Severity: ${notification.severity || "info"}`);
            details.push(`Entity: ${notification.entity_type || "N/A"} ${notification.entity_id || ""}`.trim());
            sources.push({
              sourceType: "system",
              reference: "tool:getNotification",
              note: "Notification lookup",
            });
            data = notification;
            break;
          }

          if (hintName) {
            const result = await this._callReadTool(
              "listNotifications",
              { query: hintName, limit: 10 },
              policy,
            );
            const notifications = result?.notifications || [];
            if (notifications.length === 0) {
              summary = `No notification found for "${hintName}"`;
              details.push("Try listing all notifications with: show me my notifications");
            } else if (notifications.length === 1) {
              const notification = notifications[0];
              summary = `Notification: ${notification.template_key || notification.type || "Notification"}`;
              details.push(`Status: ${notification.status || "unread"}`);
              details.push(`Severity: ${notification.severity || "info"}`);
              details.push(`Entity: ${notification.entity_type || "N/A"} ${notification.entity_id || ""}`.trim());
              sources.push({
                sourceType: "system",
                reference: "tool:listNotifications",
                note: "Notification lookup",
              });
              data = notification;
            } else {
              summary = `Multiple notifications match "${hintName}"`;
              notifications.forEach((n) => {
                const label = n.template_key || n.type || "Notification";
                details.push(`${label} (ID: ${n.id}) — ${n.status || "unread"}`);
              });
              details.push("Please specify which notification you mean.");
            }
            break;
          }

          summary = "Which notification?";
          details.push("Provide a notification ID.");
          break;
        }

        case READ_INTENTS.EXPLAIN_NOTIFICATION_STATE:
        case READ_INTENTS.SUMMARIZE_NOTIFICATION: {
          const hintId =
            getHintValue("id", "notification") || getHintValue("id");
          const hintName =
            getHintValue("name", "notification") || getHintValue("name");
          const scopedId = scope === "notification" ? context?.notificationId : null;
          const targetId = hintId || scopedId;

          let notification = null;
          if (targetId) {
            const result = await this._callReadTool(
              "getNotification",
              { notificationId: targetId },
              policy,
            );
            notification = result?.notification || null;
          } else if (hintName) {
            const result = await this._callReadTool(
              "listNotifications",
              { query: hintName, limit: 10 },
              policy,
            );
            const notifications = result?.notifications || [];
            if (notifications.length === 1) {
              notification = notifications[0];
            } else if (notifications.length > 1) {
              title =
                intent === READ_INTENTS.EXPLAIN_NOTIFICATION_STATE
                  ? "Read data — Notification reason"
                  : "Read data — Notification summary";
              summary = `Multiple notifications match "${hintName}"`;
              notifications.forEach((n) => {
                const label = n.template_key || n.type || "Notification";
                details.push(`${label} (ID: ${n.id}) — ${n.status || "unread"}`);
              });
              details.push("Please specify which notification you mean.");
              break;
            }
          }

          if (!notification) {
            summary = "Which notification?";
            details.push("Provide a notification ID.");
            break;
          }

          const payload = parsePayload(notification.payload);
          const reason =
            payload.reason ||
            payload.message ||
            payload.body ||
            payload.description ||
            payload.title ||
            payload.subject ||
            notification.template_key ||
            notification.type ||
            "N/A";

          if (intent === READ_INTENTS.EXPLAIN_NOTIFICATION_STATE) {
            title = "Read data — Notification reason";
            summary = `Notification: ${notification.template_key || notification.type || "Notification"}`;
            details.push(`Status: ${notification.status || "unread"}`);
            details.push(`Severity: ${notification.severity || "info"}`);
            details.push(
              `Entity: ${notification.entity_type || "N/A"} ${notification.entity_id || ""}`.trim(),
            );
            details.push("Explanation:");
            details.push(`Reason: ${reason}`);
            sources.push({
              sourceType: "system",
              reference: "tool:getNotification",
              note: "Notification reason",
            });
            data = notification;
            break;
          }

          title = "Read data — Notification summary";
          summary = `Notification: ${notification.template_key || notification.type || "Notification"}`;
          details.push(`Status: ${notification.status || "unread"}`);
          details.push(`Severity: ${notification.severity || "info"}`);
          details.push(`Reason: ${reason}`);
          sources.push({
            sourceType: "system",
            reference: "tool:getNotification",
            note: "Notification summary",
          });
          data = notification;
          break;
        }

        case READ_INTENTS.READ_HISTORY_EVENT: {
          const hintId = entityHints.find((hint) => hint.type === "id")?.value;
          title = "Read data — History event";

          if (hintId) {
            const result = await this._callReadTool(
              "getHistoryEvent",
              { historyEventId: hintId },
              policy,
            );
            const event = result?.historyEvent;
            if (!event) {
              summary = `No history event found for ID ${hintId}`;
              details.push("Try listing history events to see available records.");
              break;
            }
            summary = `History event: ${event.action || "event"}`;
            details.push(`Entity: ${event.entity_type || "N/A"} ${event.entity_id || ""}`.trim());
            details.push(`Description: ${event.description || "N/A"}`);
            if (event.actor) details.push(`Actor: ${event.actor}`);
            if (event.changed_fields) {
              const fields = Object.keys(event.changed_fields || {});
              if (fields.length > 0)
                details.push(`Changed fields: ${fields.join(", ")}`);
            }
            details.push(`Created at: ${event.created_at ? formatDateTime(event.created_at) : "N/A"}`);
            sources.push({
              sourceType: "system",
              reference: "tool:getHistoryEvent",
              note: "History event lookup",
            });
            data = event;
            break;
          }

          summary = "Which history event?";
          details.push("Provide a history event ID.");
          break;
        }

        case READ_INTENTS.EXPLAIN_HISTORY_STATE:
        case READ_INTENTS.SUMMARIZE_HISTORY: {
          const hintId =
            getHintValue("id", "history_event") || getHintValue("id");
          const hintName =
            getHintValue("name", "history_event") || getHintValue("name");

          let event = null;
          if (hintId) {
            const result = await this._callReadTool(
              "getHistoryEvent",
              { historyEventId: hintId },
              policy,
            );
            event = result?.historyEvent || null;
          } else if (hintName) {
            const result = await this._callReadTool(
              "listHistoryEvents",
              { query: hintName, limit: 10 },
              policy,
            );
            const events = result?.historyEvents || [];
            if (events.length === 1) {
              event = events[0];
            } else if (events.length > 1) {
              title =
                intent === READ_INTENTS.EXPLAIN_HISTORY_STATE
                  ? "Read data — History explanation"
                  : "Read data — History summary";
              summary = `Multiple history events match "${hintName}"`;
              events.forEach((e) => {
                const when = e.created_at ? formatDateTime(e.created_at) : "unknown";
                details.push(`${when} — ${e.action || "event"} (ID: ${e.id})`);
              });
              details.push("Please specify which history event you mean.");
              break;
            }
          }

          if (event) {
            const changedFields = event.changed_fields
              ? Object.keys(event.changed_fields)
              : [];
            if (intent === READ_INTENTS.EXPLAIN_HISTORY_STATE) {
              title = "Read data — History explanation";
              summary = `History event: ${event.action || "event"}`;
              details.push(
                `Entity: ${event.entity_type || "N/A"} ${event.entity_id || ""}`.trim(),
              );
              details.push(`Created at: ${event.created_at ? formatDateTime(event.created_at) : "N/A"}`);
              if (event.actor) details.push(`Actor: ${event.actor}`);
              if (event.description) details.push(`Description: ${event.description}`);
              if (changedFields.length > 0) {
                details.push(`Changed fields: ${changedFields.join(", ")}`);
              }
              details.push("Explanation:");
              details.push(
                event.description
                  ? `Reason: ${event.description}`
                  : "Reason: no description recorded",
              );
              sources.push({
                sourceType: "system",
                reference: "tool:getHistoryEvent",
                note: "History explanation",
              });
              data = event;
              break;
            }

            title = "Read data — History summary";
            summary = `History event: ${event.action || "event"}`;
            details.push(
              `Entity: ${event.entity_type || "N/A"} ${event.entity_id || ""}`.trim(),
            );
            details.push(`Description: ${event.description || "N/A"}`);
            details.push(`Created at: ${event.created_at ? formatDateTime(event.created_at) : "N/A"}`);
            sources.push({
              sourceType: "system",
              reference: "tool:getHistoryEvent",
              note: "History summary",
            });
            data = event;
            break;
          }

          if (intent === READ_INTENTS.SUMMARIZE_HISTORY) {
            // Fallback to recent history summary
            const result = await this._callReadTool(
              "listHistoryEvents",
              { limit: 10 },
              policy,
            );
            const events = result?.historyEvents || [];
            title = "Read data — History summary";
            summary =
              events.length > 0
                ? `Recent history (${events.length} event(s))`
                : "No history events found";
            events.forEach((e) => {
              const when = e.created_at ? formatDateTime(e.created_at) : "unknown";
              details.push(
                `${when} — ${e.action || "event"} (${e.entity_type || "entity"} ${e.entity_id || ""})`.trim(),
              );
            });
            sources.push({
              sourceType: "system",
              reference: "tool:listHistoryEvents",
              note: "History summary",
            });
            data = events;
            break;
          }

          summary = "Which history event?";
          details.push("Provide a history event ID.");
          break;
        }

        default:
          summary = "Query type not yet implemented";
          details.push(
            "This type of data query is recognized but not yet supported.",
          );
      }

      if (
        String(intent || "").startsWith("EXPLAIN_") &&
        !details.some(
          (detail) => String(detail).toLowerCase().startsWith("explanation"),
        )
      ) {
        details.unshift("Explanation:");
      }

      this.ledger.record({
        type: "read_intent_executed",
        intent,
        resultCount: Array.isArray(data) ? data.length : data ? 1 : 0,
        timestamp: new Date().toISOString(),
      });

      return {
        intent: "READ_DATA",
        agentVersion: policy.version,
        reasoner: "read-gate",
        output: {
          type: "explanation",
          entityId: `read:${intent.toLowerCase()}`,
          entityType: "query_result",
          title,
          summary,
          details: details.length > 0 ? details : ["No data available."],
          timestamp: new Date().toISOString(),
          confidence: 1,
          sources,
          status: "complete",
          source: "read-intent-gate",
          requires_validation: false,
        },
        isReadIntent: true,
      };
    } catch (err) {
      this.ledger.record({
        type: "read_intent_error",
        intent,
        error: err.message,
        timestamp: new Date().toISOString(),
      });

      return {
        intent: "READ_DATA",
        agentVersion: policy.version,
        reasoner: "read-gate",
        output: {
          type: "explanation",
          entityId: "read_error",
          entityType: "error",
          title: "Read data — Error",
          summary: `Unable to retrieve data: ${err.message}`,
          details: [
            "An error occurred while accessing the data.",
            "Please try again or rephrase your request.",
          ],
          timestamp: new Date().toISOString(),
          confidence: 1,
          sources: [{ sourceType: "system", reference: "read-intent-gate" }],
          status: "error",
          source: "read-intent-gate",
          requires_validation: false,
        },
        isReadIntent: true,
      };
    }
  }

  /**
   * Execute the tools mapped to a slash command
   *
   * CRITICAL: Domain access is checked BEFORE any database queries.
   * If the required domain is disabled, the command is BLOCKED.
   *
   * @param {Object} parsed - Parsed command from parseSlashCommand
   * @param {Object} context - Request context
   * @param {Object} policy - Current agent policy
   * @returns {Promise<Object>} Formatted result
   * @private
   */
  async _executeCommandTools(parsed, context, policy, message) {
    const { commandKey, args } = parsed;
    const argText = args.join(" ").trim();

    const buildHintFromArg = (arg) => {
      if (!arg) return [];
      const trimmed = String(arg).trim();
      if (!trimmed) return [];
      if (/^\d+$/.test(trimmed)) {
        return [{ type: "id", value: parseInt(trimmed, 10) }];
      }
      if (/^DOS-\d{4}-\d+$/i.test(trimmed)) {
        return [
          {
            type: "reference",
            value: trimmed.toUpperCase(),
            entityType: "dossier",
          },
        ];
      }
      if (/^PRO-\d{4}-\d+$/i.test(trimmed)) {
        return [
          {
            type: "reference",
            value: trimmed.toUpperCase(),
            entityType: "lawsuit",
          },
        ];
      }
      if (/^MIS-\d{4}-\d+$/i.test(trimmed)) {
        return [
          {
            type: "reference",
            value: trimmed.toUpperCase(),
            entityType: "mission",
          },
        ];
      }
      return [{ type: "name", value: trimmed }];
    };

    const readIntent = (() => {
      switch (commandKey) {
        case "clients":
          return { intent: READ_INTENTS.LIST_CLIENTS, requiresLocalData: true };
        case "client":
          return {
            intent: READ_INTENTS.READ_CLIENT,
            requiresLocalData: true,
            entityHints: buildHintFromArg(argText),
          };
        case "dossiers":
          return { intent: READ_INTENTS.LIST_DOSSIERS, requiresLocalData: true };
        case "dossier":
          return {
            intent: READ_INTENTS.READ_DOSSIER,
            requiresLocalData: true,
            entityHints: buildHintFromArg(argText),
          };
        case "lawsuits":
          return { intent: READ_INTENTS.LIST_LAWSUITS, requiresLocalData: true };
        case "lawsuit":
          return {
            intent: READ_INTENTS.READ_LAWSUIT,
            requiresLocalData: true,
            entityHints: buildHintFromArg(argText),
          };
        case "tasks":
          return { intent: READ_INTENTS.LIST_TASKS, requiresLocalData: true };
        case "tasks-overdue":
          return {
            intent: READ_INTENTS.LIST_OVERDUE_TASKS,
            requiresLocalData: true,
          };
        case "personal-tasks":
          return {
            intent: READ_INTENTS.LIST_PERSONAL_TASKS,
            requiresLocalData: true,
          };
        case "personal-task":
          return {
            intent: READ_INTENTS.READ_PERSONAL_TASK,
            requiresLocalData: true,
            entityHints: buildHintFromArg(argText),
          };
        case "sessions": {
          const normalized = argText.toLowerCase();
          if (["today", "this-week", "upcoming"].includes(normalized)) {
            return {
              intent: READ_INTENTS.LIST_UPCOMING_SESSIONS,
              requiresLocalData: true,
              filters: { timeframe: normalized },
            };
          }
          return { intent: READ_INTENTS.LIST_SESSIONS, requiresLocalData: true };
        }
        case "sessions-today":
          return {
            intent: READ_INTENTS.LIST_UPCOMING_SESSIONS,
            requiresLocalData: true,
            filters: { timeframe: "today" },
          };
        case "sessions-week":
          return {
            intent: READ_INTENTS.LIST_UPCOMING_SESSIONS,
            requiresLocalData: true,
            filters: { timeframe: "this-week" },
          };
        case "missions":
          return { intent: READ_INTENTS.LIST_MISSIONS, requiresLocalData: true };
        case "mission":
          return {
            intent: READ_INTENTS.READ_MISSION,
            requiresLocalData: true,
            entityHints: buildHintFromArg(argText),
          };
        case "accounting": {
          const normalized = argText.toLowerCase();
          const paymentStatus = ["unpaid", "paid", "overdue"].includes(normalized)
            ? normalized
            : null;
          return {
            intent: READ_INTENTS.LIST_FINANCIAL_ENTRIES,
            requiresLocalData: true,
            filters: { paymentStatus },
          };
        }
        case "accounting-unpaid":
          return {
            intent: READ_INTENTS.LIST_FINANCIAL_ENTRIES,
            requiresLocalData: true,
            filters: { paymentStatus: "unpaid" },
          };
        case "accounting-paid":
          return {
            intent: READ_INTENTS.LIST_FINANCIAL_ENTRIES,
            requiresLocalData: true,
            filters: { paymentStatus: "paid" },
          };
        case "accounting-overdue":
          return {
            intent: READ_INTENTS.LIST_FINANCIAL_ENTRIES,
            requiresLocalData: true,
            filters: { paymentStatus: "overdue" },
          };
        case "notifications": {
          const normalized = argText.toLowerCase();
          const status = ["unread", "read"].includes(normalized)
            ? normalized
            : null;
          return {
            intent: READ_INTENTS.LIST_NOTIFICATIONS,
            requiresLocalData: true,
            filters: { status },
          };
        }
        case "notifications-unread":
          return {
            intent: READ_INTENTS.LIST_NOTIFICATIONS,
            requiresLocalData: true,
            filters: { status: "unread" },
          };
        case "notifications-read":
          return {
            intent: READ_INTENTS.LIST_NOTIFICATIONS,
            requiresLocalData: true,
            filters: { status: "read" },
          };
        case "history":
          return {
            intent: READ_INTENTS.LIST_HISTORY_EVENTS,
            requiresLocalData: true,
            filters: { entityType: argText || null },
          };
        default:
          return null;
      }
    })();

    if (!readIntent) {
      throw new Error(`Command ${commandKey} not implemented`);
    }

    return this._executeReadIntent(
      readIntent,
      message || parsed.command,
      context,
      policy,
    );
  }

  /**
   * Resolve entity by name hint
   * Returns: { resolved: true, entity, type } or { resolved: false, reason, candidates }
   *
   * @param {Object} hint - Entity hint from detectDataRequirements
   * @param {Object} policy - Current agent policy
   * @returns {Promise<Object>} Resolution result
   * @private
   */
  async _resolveEntity(hint, policy) {
    const { type, nameHint, reference } = hint;

    const resolveFromList = async ({
      toolName,
      listKey,
      query,
      label,
      nameField,
    }) => {
      const result = await this._callReadTool(
        toolName,
        { query, limit: 10 },
        policy,
      );
      const items = result?.[listKey] || [];
      if (items.length === 0) {
        return {
          resolved: false,
          reason: "not_found",
          message: `No ${label} found matching "${query}"`,
        };
      }
      if (items.length === 1) {
        return { resolved: true, entity: items[0], type };
      }
      return {
        resolved: false,
        reason: "ambiguous",
        message: `Multiple ${label}s match "${query}". Please specify which one.`,
        candidates: items.map((item) => ({
          id: item.id,
          name: item[nameField] || item.reference || item.title || item.name,
        })),
      };
    };

    // Resolution by dossier reference (exact match)
    if (type === "dossier" && reference) {
      try {
        const result = await this._callReadTool(
          "getDossierByReference",
          { reference },
          policy,
        );
        if (result && result.dossier) {
          return { resolved: true, entity: result.dossier, type: "dossier" };
        }
        return {
          resolved: false,
          reason: "not_found",
          message: `No dossier found with reference ${reference}`,
        };
      } catch (err) {
        return { resolved: false, reason: "error", message: err.message };
      }
    }

    if (type === "dossier" && nameHint) {
      try {
        return await resolveFromList({
          toolName: "listDossiers",
          listKey: "dossiers",
          query: nameHint,
          label: "dossier",
          nameField: "title",
        });
      } catch (err) {
        return { resolved: false, reason: "error", message: err.message };
      }
    }

    // Resolution by client name (fuzzy match)
    if (type === "client" && nameHint) {
      try {
        const result = await this._callReadTool(
          "searchClientsByName",
          { nameHint },
          policy,
        );
        if (!result || !result.clients || result.clients.length === 0) {
          return {
            resolved: false,
            reason: "not_found",
            message: `No client found matching "${nameHint}"`,
          };
        }
        if (result.clients.length === 1) {
          return { resolved: true, entity: result.clients[0], type: "client" };
        }
        // Multiple matches - ambiguous
        return {
          resolved: false,
          reason: "ambiguous",
          message: `Multiple clients match "${nameHint}". Please specify which one.`,
          candidates: result.clients.map((c) => ({ id: c.id, name: c.name })),
        };
      } catch (err) {
        return { resolved: false, reason: "error", message: err.message };
      }
    }

    if (type === "lawsuit" && (reference || nameHint)) {
      try {
        return await resolveFromList({
          toolName: "listLawsuits",
          listKey: "lawsuits",
          query: reference || nameHint,
          label: "lawsuit",
          nameField: "title",
        });
      } catch (err) {
        return { resolved: false, reason: "error", message: err.message };
      }
    }

    if (type === "mission" && (reference || nameHint)) {
      try {
        return await resolveFromList({
          toolName: "listMissions",
          listKey: "missions",
          query: reference || nameHint,
          label: "mission",
          nameField: "title",
        });
      } catch (err) {
        return { resolved: false, reason: "error", message: err.message };
      }
    }

    if (type === "task" && nameHint) {
      try {
        return await resolveFromList({
          toolName: "listTasks",
          listKey: "tasks",
          query: nameHint,
          label: "task",
          nameField: "title",
        });
      } catch (err) {
        return { resolved: false, reason: "error", message: err.message };
      }
    }

    if (type === "personal_task" && nameHint) {
      try {
        return await resolveFromList({
          toolName: "listPersonalTasks",
          listKey: "personalTasks",
          query: nameHint,
          label: "personal task",
          nameField: "title",
        });
      } catch (err) {
        return { resolved: false, reason: "error", message: err.message };
      }
    }

    if (type === "session" && nameHint) {
      try {
        return await resolveFromList({
          toolName: "listSessions",
          listKey: "sessions",
          query: nameHint,
          label: "session",
          nameField: "title",
        });
      } catch (err) {
        return { resolved: false, reason: "error", message: err.message };
      }
    }

    if (type === "financial_entry" && (reference || nameHint)) {
      try {
        return await resolveFromList({
          toolName: "listFinancialEntries",
          listKey: "financialEntries",
          query: reference || nameHint,
          label: "financial entry",
          nameField: "title",
        });
      } catch (err) {
        return { resolved: false, reason: "error", message: err.message };
      }
    }

    if (type === "notification" && nameHint) {
      try {
        return await resolveFromList({
          toolName: "listNotifications",
          listKey: "notifications",
          query: nameHint,
          label: "notification",
          nameField: "template_key",
        });
      } catch (err) {
        return { resolved: false, reason: "error", message: err.message };
      }
    }

    if (type === "history_event" && nameHint) {
      try {
        return await resolveFromList({
          toolName: "listHistoryEvents",
          listKey: "historyEvents",
          query: nameHint,
          label: "history event",
          nameField: "action",
        });
      } catch (err) {
        return { resolved: false, reason: "error", message: err.message };
      }
    }

    return {
      resolved: false,
      reason: "unsupported",
      message: `Cannot resolve entity type: ${type}`,
    };
  }

  /**
   * Call a READ tool safely (wrapper for data fetching)
   *
   * @param {string} toolName - Name of the READ tool
   * @param {Object} params - Tool parameters
   * @param {Object} policy - Current agent policy
   * @returns {Promise<Object>} Tool result
   * @private
   */
  async _callReadTool(toolName, params, policy) {
    // Check if tool exists and is permitted
    const tool = this.toolRegistry.get(toolName);
    if (!tool) {
      const error = new Error(`Tool ${toolName} not found in registry`);
      error.status = 404;
      throw error;
    }

    // Verify tool category is 'read' and policy allows it
    if (tool.category !== "read") {
      const error = new Error(`Tool ${toolName} is not a READ tool`);
      error.status = 403;
      throw error;
    }

    if (!policy.allowedToolCategories.includes("read")) {
      const error = new Error(
        "READ tools not permitted for this agent version",
      );
      error.status = 403;
      throw error;
    }

    // Execute through standard callTool path
    const result = await this.callTool(toolName, params, policy, {
      confirmed: true,
    });
    return result.result;
  }

  /**
   * Built-in entity lookup for entity resolution (does not require registered tools)
   * Safe, read-only, minimal queries for context resolution
   *
   * @param {string} lookupType - Type of lookup
   * @param {Object} params - Lookup parameters
   * @returns {Promise<Object>} Lookup result
   * @private
   */
  async _builtinEntityLookup(lookupType, params) {
    const error = new Error(
      `Direct entity lookup is disabled. Use READ tools instead (attempted: ${lookupType}).`,
    );
    error.status = 400;
    throw error;
  }

  /**
   * Fetch required data based on detected requirements and context
   *
   * @param {Object} dataReqs - Data requirements from detectDataRequirements
   * @param {Object} context - Current context (scope, refs)
   * @param {Object} policy - Current agent policy
   * @returns {Promise<Object>} Fetched data: { entities: {}, lists: {}, resolution: {} }
   * @private
   */
  async _fetchRequiredData(dataReqs, context, policy) {
    const result = {
      entities: {},
      lists: {},
      resolution: {
        resolved: [],
        failed: [],
      },
    };

    // Step 1: Resolve entity hints (e.g., "Emma" → client ID)
    for (const hint of dataReqs.entityHints) {
      const resolution = await this._resolveEntity(hint, policy);
      if (resolution.resolved) {
        result.entities[resolution.type] = resolution.entity;
        result.resolution.resolved.push({
          hint,
          entity: resolution.entity,
        });
        // If client resolved and target is dossier, fetch client's dossiers
        if (resolution.type === "client" && hint.targetEntity === "dossier") {
          const dossiers = await this._callReadTool(
            "listDossiersForClient",
            {
              clientId: resolution.entity.id,
            },
            policy,
          );
          result.lists.dossiers = dossiers?.dossiers || [];
        }
      } else {
        result.resolution.failed.push({
          hint,
          reason: resolution.reason,
          message: resolution.message,
          candidates: resolution.candidates,
        });
      }
    }

    // Step 2: Fetch data based on explicit context refs
    if (context.clientId && !result.entities.client) {
      try {
        const clientResult = await this._callReadTool(
          "getClient",
          { clientId: context.clientId },
          policy,
        );
        if (clientResult?.client) {
          result.entities.client = clientResult.client;
        }
      } catch (err) {
        this.ledger.record({
          type: "data_fetch_error",
          tool: "getClient",
          error: err.message,
        });
      }
    }

    if (context.dossierId && !result.entities.dossier) {
      try {
        const dossierResult = await this._callReadTool(
          "getDossier",
          { dossierId: context.dossierId },
          policy,
        );
        if (dossierResult?.dossier) {
          result.entities.dossier = dossierResult.dossier;
        }
      } catch (err) {
        this.ledger.record({
          type: "data_fetch_error",
          tool: "getDossier",
          error: err.message,
        });
      }
    }

    // Step 3: Fetch lists based on detected needs
    if (dataReqs.needs.includes(DATA_REQUIREMENTS.OVERDUE_TASKS)) {
      try {
        const overdueResult = await this._callReadTool(
          "detectOverdueTasks",
          {
            dossierId: context.dossierId || null,
          },
          policy,
        );
        result.lists.overdueTasks = overdueResult?.overdueTasks || [];
        result.lists.overdueAnalysis = overdueResult?.analysis || {};
      } catch (err) {
        this.ledger.record({
          type: "data_fetch_error",
          tool: "detectOverdueTasks",
          error: err.message,
        });
      }
    }

    if (dataReqs.needs.includes(DATA_REQUIREMENTS.TASK)) {
      try {
        const tasksResult = await this._callReadTool(
          "listTasks",
          {
            dossierId: context.dossierId || null,
            limit: 20,
          },
          policy,
        );
        result.lists.tasks = tasksResult?.tasks || [];
      } catch (err) {
        this.ledger.record({
          type: "data_fetch_error",
          tool: "listTasks",
          error: err.message,
        });
      }
    }

    // Step 4: Fetch timeline if needed
    if (dataReqs.needs.includes(DATA_REQUIREMENTS.TIMELINE)) {
      try {
        const timelineParams = {};
        if (context.clientId) timelineParams.entityType = "client";
        if (context.dossierId) timelineParams.entityType = "dossier";
        if (context.clientId) timelineParams.entityId = context.clientId;
        if (context.dossierId) timelineParams.entityId = context.dossierId;

        if (timelineParams.entityType) {
          const timelineResult = await this._callReadTool(
            "getTimeline",
            timelineParams,
            policy,
          );
          result.lists.timeline = timelineResult?.events || [];
        }
      } catch (err) {
        this.ledger.record({
          type: "data_fetch_error",
          tool: "getTimeline",
          error: err.message,
        });
      }
    }

    return result;
  }

  /**
   * Build enriched context by merging original context with fetched data
   *
   * @param {Object} context - Original context
   * @param {Object} fetchedData - Data from _fetchRequiredData
   * @param {Object} dataReqs - Data requirements
   * @returns {Object} Enriched context for reasoner
   * @private
   */
  _buildEnrichedContext(context, fetchedData, dataReqs) {
    const enriched = { ...context };

    // Add fetched entities to context
    if (fetchedData.entities.client) {
      enriched.clientData = fetchedData.entities.client;
      enriched.entityId =
        enriched.entityId || String(fetchedData.entities.client.id);
      enriched.entityType = enriched.entityType || "client";
    }

    if (fetchedData.entities.dossier) {
      enriched.dossierData = fetchedData.entities.dossier;
      enriched.entityId =
        enriched.entityId || String(fetchedData.entities.dossier.id);
      enriched.entityType = enriched.entityType || "dossier";
      enriched.status = enriched.status || fetchedData.entities.dossier.status;
      enriched.owner =
        enriched.owner || fetchedData.entities.dossier.assigned_lawyer;
      enriched.lastUpdated =
        enriched.lastUpdated || fetchedData.entities.dossier.updated_at;
    }

    // Add fetched lists
    if (fetchedData.lists.tasks) {
      enriched.tasks = fetchedData.lists.tasks;
    }
    if (fetchedData.lists.overdueTasks) {
      enriched.overdueTasks = fetchedData.lists.overdueTasks;
      enriched.overdueAnalysis = fetchedData.lists.overdueAnalysis;
    }
    if (fetchedData.lists.dossiers) {
      enriched.dossiers = fetchedData.lists.dossiers;
    }
    if (fetchedData.lists.timeline) {
      enriched.timeline = fetchedData.lists.timeline;
    }

    // Add resolution metadata
    enriched._dataResolution = {
      resolved: fetchedData.resolution.resolved.length,
      failed: fetchedData.resolution.failed.length,
      failedDetails: fetchedData.resolution.failed,
    };

    // Flag for reasoner to know data was fetched
    enriched._dataEnriched = true;
    enriched._dataRequirements = dataReqs;

    return enriched;
  }

  // ========== FOLLOW-UP INTENT HANDLING ==========

  /**
   * Handle follow-up messages using conversation context
   *
   * RESOLUTION RULES:
   * 1. If valid context exists AND follow-up can be resolved safely → execute
   * 2. If valid context exists BUT follow-up is ambiguous → ask grounded clarification
   * 3. If no valid context exists → ask what user wants to act on
   *
   * NEVER guess silently. NEVER use stale context.
   *
   * @param {Object} followUpDetection - Follow-up detection result from detectFollowUp
   * @param {string} message - Original user message
   * @param {Object} context - Request context
   * @param {Object} policy - Current agent policy
   * @returns {Promise<Object|null>} Follow-up result or null to continue normal processing
   * @private
   */
  async _handleFollowUp(followUpDetection, message, context, policy) {
    const { type, modifier, filterWord, confidence } = followUpDetection;

    // Log follow-up detection
    this.ledger.record({
      type: "follow_up_detected",
      followUpType: type,
      confidence,
      hasModifier: !!modifier,
      timestamp: new Date().toISOString(),
    });

    // Get existing conversation context
    const convContext = this.contextStore.get(context);

    // RULE: No valid context → ask grounded clarification
    if (!convContext) {
      return this._generateNoContextClarification(
        followUpDetection,
        context,
        policy,
      );
    }

    // RULE: Check if context should be reset (entity type switch, explicit mention)
    const entityType = detectEntityType(message);
    const hasExplicit = hasExplicitEntityMention(message);
    if (
      this.contextStore.shouldReset(convContext, {
        entityType,
        hasExplicitEntity: hasExplicit,
      })
    ) {
      this.contextStore.clear(context);
      return null; // Continue to normal processing
    }

    // Handle different follow-up types
    switch (type) {
      case FOLLOW_UP_TYPES.FILTER_MODIFICATION:
        return this._handleFilterModification(
          convContext,
          modifier,
          filterWord,
          message,
          context,
          policy,
        );

      case FOLLOW_UP_TYPES.NEXT_ACTION:
        return this._handleNextAction(convContext, message, context, policy);

      case FOLLOW_UP_TYPES.REPEAT_ACTION:
        return this._handleRepeatAction(convContext, message, context, policy);

      case FOLLOW_UP_TYPES.CLARIFICATION_REQUEST:
        return this._handleClarificationRequest(
          convContext,
          message,
          context,
          policy,
        );

      case FOLLOW_UP_TYPES.SUBSET_REQUEST:
        // Subset requests with pronouns (e.g., "show them again") - treat as repeat
        return this._handleRepeatAction(convContext, message, context, policy);

      case FOLLOW_UP_TYPES.CONFIRMATION:
      case FOLLOW_UP_TYPES.NEGATION:
        // Confirmation/negation without pending action → explain
        return this._generateContextualResponse(
          convContext,
          type,
          context,
          policy,
        );

      default:
        // Unknown follow-up type → continue normal processing
        return null;
    }
  }

  /**
   * Handle filter modification follow-ups (e.g., "what about inactive ones?")
   *
   * @param {Object} convContext - Conversation context
   * @param {Object} modifier - Filter modifier
   * @param {string} filterWord - Original filter word
   * @param {string} message - Original message
   * @param {Object} context - Request context
   * @param {Object} policy - Current policy
   * @returns {Promise<Object>} Follow-up result
   * @private
   */
  async _handleFilterModification(
    convContext,
    modifier,
    filterWord,
    message,
    context,
    policy,
  ) {
    const { lastEntityType, lastIntent, lastResultSummary, lastActionType } =
      convContext;

    // Only allow filter modification on LIST actions
    // Note: Intent might be LIST_*, READ_DATA, or COMMAND - check actionType for accuracy
    const isListAction =
      lastActionType === ACTION_TYPES.LIST ||
      (lastIntent &&
        (lastIntent.startsWith("LIST_") ||
          lastIntent === "READ_DATA" ||
          lastIntent === "COMMAND"));

    if (!lastIntent || !isListAction) {
      return this._generateClarification(
        `I can apply filters to list results. Your last action was not a list query.`,
        `Would you like me to list your ${lastEntityType || "data"}?`,
        context,
        policy,
      );
    }

    // Build filter for re-query
    const filters = { ...lastResultSummary?.filters };
    if (modifier) {
      filters[modifier.field] = modifier.value;
    }

    // Map entity type to READ intent for re-query
    const intentMap = {
      client: "LIST_CLIENTS",
      dossier: "LIST_DOSSIERS",
      task: modifier?.value === "overdue" ? "LIST_OVERDUE_TASKS" : "LIST_TASKS",
      session: "LIST_SESSIONS",
      lawsuit: "LIST_LAWSUITS",
      mission: "LIST_MISSIONS",
      personal_task: "LIST_PERSONAL_TASKS",
      financial_entry: "LIST_FINANCIAL_ENTRIES",
      notification: "LIST_NOTIFICATIONS",
      history_event: "LIST_HISTORY_EVENTS",
    };

    const intent = intentMap[lastEntityType];
    if (!intent) {
      return this._generateClarification(
        `I'm not sure what to filter.`,
        `You were looking at ${lastEntityType || "data"}. What would you like to see?`,
        context,
        policy,
      );
    }

    // Log follow-up resolution
    this.ledger.record({
      type: "follow_up_resolved",
      resolutionType: "filter_modification",
      originalIntent: lastIntent,
      newFilter: filters,
      timestamp: new Date().toISOString(),
    });

    // Re-execute with new filter
    const readIntent = {
      intent,
      requiresLocalData: true,
      allowedTools: [],
      filters,
    };

    const result = await this._executeReadIntent(
      readIntent,
      message,
      context,
      policy,
    );

    // Update context with new result
    this._updateConversationContext(
      context,
      message,
      result,
      CONTEXT_SOURCES.FOLLOW_UP,
    );

    return result;
  }

  /**
   * Handle "and now?" / "what's next?" follow-ups
   *
   * @param {Object} convContext - Conversation context
   * @param {string} message - Original message
   * @param {Object} context - Request context
   * @param {Object} policy - Current policy
   * @returns {Promise<Object>} Follow-up result
   * @private
   */
  async _handleNextAction(convContext, message, context, policy) {
    const { lastEntityType, lastActionType, lastResultSummary, lastQuery } =
      convContext;
    const { count, emptyResult } = lastResultSummary || {};

    // Empty result → suggest next steps
    if (emptyResult || count === 0) {
      const suggestions = this._getSuggestionsForEmptyResult(lastEntityType);
      return this._generateClarification(
        `Your last query for ${lastEntityType || "data"} returned no results.`,
        suggestions,
        context,
        policy,
      );
    }

    // Has results → suggest actions based on entity type
    const suggestions = this._getSuggestionsForResults(lastEntityType, count);
    return this._generateClarification(
      `You were viewing ${count} ${lastEntityType || "item"}(s).`,
      suggestions,
      context,
      policy,
    );
  }

  /**
   * Handle repeat action follow-ups (e.g., "give it again", "repeat that")
   *
   * @param {Object} convContext - Conversation context
   * @param {string} message - Original message
   * @param {Object} context - Request context
   * @param {Object} policy - Current policy
   * @returns {Promise<Object>} Follow-up result
   * @private
   */
  async _handleRepeatAction(convContext, message, context, policy) {
    const { lastEntityType, lastIntent, lastResultSummary, lastQuery } =
      convContext;

    // Validate we have something to repeat
    if (!lastIntent || !lastEntityType) {
      return this._generateClarification(
        "I need to know what you want me to repeat.",
        [
          "You can ask me to:",
          '  • "Show my clients"',
          '  • "List my tasks"',
          '  • "Show my dossiers"',
          "",
          "Then you can ask me to repeat the results.",
        ],
        context,
        policy,
      );
    }

    // Map entity type to READ intent for re-query
    const intentMap = {
      client: "LIST_CLIENTS",
      dossier: "LIST_DOSSIERS",
      task: "LIST_TASKS",
      session: "LIST_SESSIONS",
      lawsuit: "LIST_LAWSUITS",
      mission: "LIST_MISSIONS",
      personal_task: "LIST_PERSONAL_TASKS",
      financial_entry: "LIST_FINANCIAL_ENTRIES",
      notification: "LIST_NOTIFICATIONS",
      history_event: "LIST_HISTORY_EVENTS",
    };

    const intent = intentMap[lastEntityType];
    if (!intent) {
      return this._generateClarification(
        `I can't repeat that action.`,
        `You were looking at ${lastEntityType || "data"}. What would you like to see?`,
        context,
        policy,
      );
    }

    // Log follow-up resolution
    this.ledger.record({
      type: "follow_up_resolved",
      resolutionType: "repeat_action",
      originalIntent: lastIntent,
      repeatedIntent: intent,
      timestamp: new Date().toISOString(),
    });

    // Re-execute the last query with same filters
    const readIntent = {
      intent,
      requiresLocalData: true,
      allowedTools: [],
      filters: lastResultSummary?.filters || {},
    };

    const result = await this._executeReadIntent(
      readIntent,
      message,
      context,
      policy,
    );

    // Update context with new result
    this._updateConversationContext(
      context,
      message,
      result,
      CONTEXT_SOURCES.FOLLOW_UP,
    );

    return result;
  }

  /**
   * Handle clarification request follow-ups (e.g., "why?")
   *
   * @param {Object} convContext - Conversation context
   * @param {string} message - Original message
   * @param {Object} context - Request context
   * @param {Object} policy - Current policy
   * @returns {Promise<Object>} Follow-up result
   * @private
   */
  async _handleClarificationRequest(convContext, message, context, policy) {
    const { lastEntityType, lastQuery, lastResultSummary } = convContext;

    return this._generateClarification(
      `You asked: "${lastQuery}"`,
      `This showed ${lastResultSummary?.count || 0} ${lastEntityType || "result"}(s). What would you like me to explain?`,
      context,
      policy,
    );
  }

  /**
   * Generate clarification when no context exists
   *
   * @param {Object} followUpDetection - Follow-up detection result
   * @param {Object} context - Request context
   * @param {Object} policy - Current policy
   * @returns {Object} Clarification response
   * @private
   */
  _generateNoContextClarification(followUpDetection, context, policy) {
    const { type } = followUpDetection;

    let summary, details;

    if (type === FOLLOW_UP_TYPES.FILTER_MODIFICATION) {
      summary = "I need to know what you want to filter.";
      details = [
        "You can ask me to:",
        '  • "Show my clients"',
        '  • "List my tasks"',
        '  • "Show overdue tasks"',
        '  • "List my dossiers"',
        "",
        "Then you can filter the results.",
      ];
    } else if (type === FOLLOW_UP_TYPES.NEXT_ACTION) {
      summary = "What would you like to do?";
      details = [
        "I can help you with:",
        "  • Viewing your clients, dossiers, tasks, or sessions",
        "  • Finding overdue tasks",
        "  • Checking upcoming sessions",
        "",
        "What would you like to see?",
      ];
    } else {
      summary = "I need more context to help you.";
      details = [
        "Please tell me what you would like to do.",
        "",
        "Examples:",
        '  • "Show my clients"',
        '  • "List overdue tasks"',
        '  • "Show today\'s sessions"',
      ];
    }

    this.ledger.record({
      type: "follow_up_no_context",
      followUpType: type,
      timestamp: new Date().toISOString(),
    });

    return {
      intent: "FOLLOW_UP_CLARIFICATION",
      agentVersion: policy.version,
      reasoner: "follow-up-gate",
      output: {
        type: "explanation",
        entityId: "follow_up_clarification",
        entityType: "clarification",
        summary,
        details,
        timestamp: new Date().toISOString(),
        confidence: 1,
        sources: [
          {
            sourceType: "context",
            reference: "conversation_context",
            note: "No prior context available",
          },
        ],
        status: "awaiting_input",
        source: "follow-up-handler",
        requires_validation: false,
      },
      isFollowUp: true,
      needsUserInput: true,
    };
  }

  /**
   * Generate a grounded clarification response
   *
   * @param {string} summary - Summary of the situation
   * @param {string|string[]} suggestion - Suggestion or list of suggestions
   * @param {Object} context - Request context
   * @param {Object} policy - Current policy
   * @returns {Object} Clarification response
   * @private
   */
  _generateClarification(summary, suggestion, context, policy) {
    const details = Array.isArray(suggestion) ? suggestion : [suggestion];

    return {
      intent: "FOLLOW_UP_CLARIFICATION",
      agentVersion: policy.version,
      reasoner: "follow-up-gate",
      output: {
        type: "explanation",
        entityId: "follow_up_clarification",
        entityType: "clarification",
        summary,
        details,
        timestamp: new Date().toISOString(),
        confidence: 1,
        sources: [
          {
            sourceType: "context",
            reference: "conversation_context",
            note: "Based on prior conversation context",
          },
        ],
        status: "awaiting_input",
        source: "follow-up-handler",
        requires_validation: false,
      },
      isFollowUp: true,
      needsUserInput: true,
    };
  }

  /**
   * Generate contextual response for confirmation/negation without pending action
   *
   * @param {Object} convContext - Conversation context
   * @param {string} type - Follow-up type
   * @param {Object} context - Request context
   * @param {Object} policy - Current policy
   * @returns {Object} Response
   * @private
   */
  _generateContextualResponse(convContext, type, context, policy) {
    const { lastEntityType, lastResultSummary } = convContext;

    if (type === FOLLOW_UP_TYPES.CONFIRMATION) {
      return this._generateClarification(
        "There is no pending action to confirm.",
        `You were viewing ${lastResultSummary?.count || 0} ${lastEntityType || "item"}(s). What would you like to do next?`,
        context,
        policy,
      );
    }

    // Negation
    this.contextStore.clear(context);
    return this._generateClarification(
      "Understood. Previous context cleared.",
      "What would you like to do?",
      context,
      policy,
    );
  }

  /**
   * Get suggestions for empty result scenarios
   *
   * @param {string} entityType - Entity type
   * @returns {string[]} List of suggestions
   * @private
   */
  _getSuggestionsForEmptyResult(entityType) {
    const suggestions = {
      client: [
        "No clients found.",
        "You can:",
        "  • Add a new client from the Clients screen",
        '  • Check if there are inactive clients: "show inactive clients"',
      ],
      dossier: [
        "No dossiers found.",
        "You can:",
        "  • Create a new dossier from the Dossiers screen",
        '  • Check closed dossiers: "show closed dossiers"',
      ],
      task: [
        "No tasks found.",
        "You can:",
        "  • Create a new task from the Tasks screen",
        '  • Check completed tasks: "show completed tasks"',
      ],
      session: [
        "No sessions found.",
        "You can:",
        "  • Schedule a new session from the Sessions screen",
        '  • Check past sessions: "show past sessions"',
      ],
    };

    return (
      suggestions[entityType] || ["No results found. Try a different query."]
    );
  }

  /**
   * Get suggestions for results scenarios
   *
   * @param {string} entityType - Entity type
   * @param {number} count - Number of results
   * @returns {string[]} List of suggestions
   * @private
   */
  _getSuggestionsForResults(entityType, count) {
    const suggestions = {
      client: [
        `You have ${count} client(s).`,
        "You can:",
        '  • Filter by status: "show inactive clients"',
        '  • Get details: "/client [name]"',
        '  • View their dossiers: "show dossiers for [client]"',
      ],
      dossier: [
        `You have ${count} dossier(s).`,
        "You can:",
        '  • Filter by status: "show open dossiers"',
        '  • Filter by priority: "show urgent dossiers"',
        '  • Get details: "/dossier [reference]"',
      ],
      task: [
        `You have ${count} task(s).`,
        "You can:",
        '  • Show overdue: "show overdue tasks"',
        '  • Show by priority: "show urgent tasks"',
        '  • Filter by status: "show pending tasks"',
      ],
      session: [
        `You have ${count} session(s).`,
        "You can:",
        '  • Show today: "show today\'s sessions"',
        '  • Show this week: "show this week\'s sessions"',
        '  • Show upcoming: "show upcoming sessions"',
      ],
    };

    return (
      suggestions[entityType] || [
        `${count} result(s) found. What would you like to do with them?`,
      ]
    );
  }

  /**
   * Update conversation context after a successful action
   *
   * @param {Object} requestContext - Request context
   * @param {string} query - User query
   * @param {Object} result - Action result
   * @param {string} source - Context source
   * @private
   */
  _updateConversationContext(requestContext, query, result, source) {
    if (!result || !result.output) return;

    const { intent, output } = result;

    // Determine entity type from intent, output.entityId, or query
    let entityType = null;

    // Try to extract from intent first
    if (intent) {
      if (intent.includes("CLIENT")) entityType = "client";
      else if (intent.includes("DOSSIER")) entityType = "dossier";
      else if (intent.includes("LAWSUIT")) entityType = "lawsuit";
      else if (intent.includes("TASK")) entityType = "task";
      else if (intent.includes("PERSONAL_TASK")) entityType = "personal_task";
      else if (intent.includes("SESSION")) entityType = "session";
      else if (intent.includes("MISSION")) entityType = "mission";
      else if (intent.includes("FINANCIAL_ENTRY"))
        entityType = "financial_entry";
      else if (intent.includes("NOTIFICATION")) entityType = "notification";
      else if (intent.includes("HISTORY")) entityType = "history_event";
    }

    // If not found in intent, try output.entityId (e.g., "read:list_clients", "command:clients")
    if (!entityType && output.entityId) {
      const entityIdLower = output.entityId.toLowerCase();
      if (entityIdLower.includes("client")) entityType = "client";
      else if (entityIdLower.includes("dossier")) entityType = "dossier";
      else if (entityIdLower.includes("lawsuit")) entityType = "lawsuit";
      else if (entityIdLower.includes("personal_task")) entityType = "personal_task";
      else if (entityIdLower.includes("task")) entityType = "task";
      else if (entityIdLower.includes("session")) entityType = "session";
      else if (entityIdLower.includes("mission")) entityType = "mission";
      else if (entityIdLower.includes("financial")) entityType = "financial_entry";
      else if (entityIdLower.includes("notification")) entityType = "notification";
      else if (entityIdLower.includes("history")) entityType = "history_event";
    }

    // If still not found, try the query itself
    if (!entityType && query) {
      const queryLower = query.toLowerCase();
      if (/\bclient/i.test(queryLower)) entityType = "client";
      else if (/\bdossier/i.test(queryLower)) entityType = "dossier";
      else if (/\blawsuit|case/i.test(queryLower)) entityType = "lawsuit";
      else if (/\bpersonal\s+task/i.test(queryLower)) entityType = "personal_task";
      else if (/\btask/i.test(queryLower)) entityType = "task";
      else if (/\bsession|hearing/i.test(queryLower)) entityType = "session";
      else if (/\bmission/i.test(queryLower)) entityType = "mission";
      else if (/\baccounting|financial|invoice|payment/i.test(queryLower))
        entityType = "financial_entry";
      else if (/\bnotification|alert/i.test(queryLower))
        entityType = "notification";
      else if (/\bhistory|audit/i.test(queryLower))
        entityType = "history_event";
    }

    // Determine action type
    let actionType = ACTION_TYPES.LIST;
    if (intent && intent.startsWith("READ_")) actionType = ACTION_TYPES.GET;
    if (
      intent &&
      (intent.startsWith("EXPLAIN_") || intent.startsWith("SUMMARIZE_"))
    )
      actionType = ACTION_TYPES.EXPLAIN;
    if (intent && intent.startsWith("LIST_")) actionType = ACTION_TYPES.LIST;
    if (intent === "COMMAND") actionType = ACTION_TYPES.LIST;
    if (intent === "READ_DATA" && output.entityId) {
      const derived = output.entityId.replace(/^read:/i, "").toUpperCase();
      if (derived.startsWith("LIST_")) actionType = ACTION_TYPES.LIST;
      else if (derived.startsWith("READ_")) actionType = ACTION_TYPES.GET;
      else if (
        derived.startsWith("EXPLAIN_") ||
        derived.startsWith("SUMMARIZE_")
      )
        actionType = ACTION_TYPES.EXPLAIN;
    }

    // Extract result count from output details
    let count = 0;
    let emptyResult = false;
    if (output.details && Array.isArray(output.details)) {
      // Count bullet points as results
      count = output.details.filter((d) => d.startsWith("•")).length;
    }
    if (output.summary) {
      // Try to extract count from summary
      const countMatch = output.summary.match(
        /(\d+)\s+(client|dossier|task|session|item)/i,
      );
      if (countMatch) count = parseInt(countMatch[1], 10);
      if (/no\s+(client|dossier|task|session|result)/i.test(output.summary)) {
        count = 0;
        emptyResult = true;
      }
    }

    // Update context store
    this.contextStore.update(requestContext, {
      intent,
      entityType,
      entityIds: [], // Could be populated from output data if needed
      actionType,
      resultSummary: {
        count,
        emptyResult,
        filters: {},
      },
      query,
      source,
    });

    this.ledger.record({
      type: "conversation_context_updated",
      intent,
      entityType,
      actionType,
      resultCount: count,
      source,
      timestamp: new Date().toISOString(),
    });
  }

  // ========== END FOLLOW-UP INTENT HANDLING ==========
}

module.exports = AgentEngine;
