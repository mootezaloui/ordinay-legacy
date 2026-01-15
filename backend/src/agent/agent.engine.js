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
} = require("./intent.classifier");
const { INTENTS } = require("./intents");

const agentV1Policy = require("./policies/agent.v1.policy");
const agentV2Policy = require("./policies/agent.v2.policy");
const agentV3Policy = require("./policies/agent.v3.policy");

const RuleReasoner = require("./reasoners/rule.reasoner");
const AgentLedgerService = require("./ledger/agent.ledger.service");
const { initializeToolRegistry } = require("./tools");
const ToolFirewall = require("./tools/tool.firewall");

const chatSchema = require("./schemas/chat.schema.json");
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
    if (output.type === 'chat') {
      responseData.chat = output;
    } else if (output.type === 'explanation') {
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

    // STEP: Check for slash commands BEFORE intent classification
    if (isSlashCommand(message)) {
      return this._executeSlashCommand(message, context, policy);
    }

    const intent = await classifyIntent(message, context);
    this._ensureIntentAllowed(intent, policy);

    // STEP: Detect data requirements and fetch local data if needed
    const dataReqs = detectDataRequirements(message, context);
    let enrichedContext = context;

    if (dataReqs.requiresData && policy.allowedToolCategories.includes('read')) {
      // Log data requirement detection
      this.ledger.record({
        type: 'data_requirements_detected',
        requiresData: true,
        needs: dataReqs.needs,
        entityHints: dataReqs.entityHints,
        timestamp: new Date().toISOString(),
      });

      // Check for entity resolution failures that require clarification
      const fetchedData = await this._fetchRequiredData(dataReqs, context, policy);

      // If there are ambiguous resolutions, return clarification request
      // This is returned as an explanation type to pass schema validation
      const ambiguousFailures = fetchedData.resolution.failed.filter(f => f.reason === 'ambiguous');
      if (ambiguousFailures.length > 0) {
        const clarification = ambiguousFailures[0];

        // Log clarification needed
        this.ledger.record({
          type: 'clarification_required',
          reason: 'ambiguous_entity',
          candidates: clarification.candidates,
          timestamp: new Date().toISOString(),
        });

        // Return as explanation type (passes schema validation)
        const clarificationOutput = {
          type: 'explanation',
          entityId: 'pending_clarification',
          entityType: 'query',
          summary: clarification.message,
          details: [
            'Multiple matches were found for your query.',
            'Please specify which one you mean:',
            ...clarification.candidates.map(c => `  - ${c.name} (ID: ${c.id})`),
          ],
          timestamp: new Date().toISOString(),
          confidence: 0,
          sources: [{
            sourceType: 'context',
            reference: 'entity_resolution',
            note: 'Awaiting user clarification',
          }],
          status: 'pending_clarification',
          source: 'rule-based',
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
          reasoner: 'rule',
          request: { message, context },
          response: clarificationOutput,
          needsClarification: true,
        });

        return {
          intent,
          agentVersion: policy.version,
          reasoner: 'rule',
          output: clarificationOutput,
          needsClarification: true,
        };
      }

      // Build enriched context with fetched data
      enrichedContext = this._buildEnrichedContext(context, fetchedData, dataReqs);

      // Log successful data enrichment
      this.ledger.record({
        type: 'context_enriched',
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
      type: 'slash_command_received',
      command: parsed.command,
      valid: parsed.valid,
      args: parsed.args,
      timestamp: new Date().toISOString(),
    });

    // Handle invalid commands
    if (!parsed.valid) {
      return {
        intent: 'COMMAND',
        agentVersion: policy.version,
        reasoner: 'command',
        output: {
          type: 'explanation',
          entityId: 'command_error',
          entityType: 'command',
          summary: parsed.error,
          details: parsed.suggestion
            ? [parsed.suggestion]
            : parsed.availableCommands
              ? ['Available commands:', ...parsed.availableCommands.map(c => `  ${c}`)]
              : [],
          timestamp: new Date().toISOString(),
          confidence: 1,
          sources: [{
            sourceType: 'system',
            reference: 'command_parser',
            note: 'Slash command validation',
          }],
          status: 'error',
          source: 'command-parser',
          requires_validation: false,
        },
        isCommand: true,
      };
    }

    // Handle /help command specially
    if (parsed.commandKey === 'help') {
      const commands = getAvailableCommands();
      const grouped = {};
      commands.forEach(cmd => {
        if (!grouped[cmd.category]) grouped[cmd.category] = [];
        grouped[cmd.category].push(cmd);
      });

      const details = ['Available commands:'];
      Object.entries(grouped).forEach(([category, cmds]) => {
        if (category !== 'help') {
          details.push('');
          details.push(`${category.charAt(0).toUpperCase() + category.slice(1)}:`);
          cmds.forEach(cmd => {
            details.push(`  ${cmd.usage} - ${cmd.description}`);
          });
        }
      });

      return {
        intent: 'COMMAND',
        agentVersion: policy.version,
        reasoner: 'command',
        output: {
          type: 'explanation',
          entityId: 'help',
          entityType: 'command',
          summary: 'Slash Command Reference',
          details,
          timestamp: new Date().toISOString(),
          confidence: 1,
          sources: [{
            sourceType: 'system',
            reference: 'command_registry',
            note: 'Available slash commands',
          }],
          status: 'complete',
          source: 'command-parser',
          requires_validation: false,
        },
        isCommand: true,
      };
    }

    // Execute command by fetching data
    try {
      const result = await this._executeCommandTools(parsed, context, policy);

      this.ledger.record({
        type: 'slash_command_executed',
        command: parsed.command,
        success: true,
        timestamp: new Date().toISOString(),
      });

      return {
        intent: 'COMMAND',
        agentVersion: policy.version,
        reasoner: 'command',
        output: result,
        isCommand: true,
      };
    } catch (err) {
      this.ledger.record({
        type: 'slash_command_error',
        command: parsed.command,
        error: err.message,
        timestamp: new Date().toISOString(),
      });

      return {
        intent: 'COMMAND',
        agentVersion: policy.version,
        reasoner: 'command',
        output: {
          type: 'explanation',
          entityId: 'command_error',
          entityType: 'command',
          summary: `Command failed: ${err.message}`,
          details: ['The command could not be executed.', 'Please try again or use /help for available commands.'],
          timestamp: new Date().toISOString(),
          confidence: 1,
          sources: [],
          status: 'error',
          source: 'command-parser',
          requires_validation: false,
        },
        isCommand: true,
      };
    }
  }

  /**
   * Execute the tools mapped to a slash command
   *
   * @param {Object} parsed - Parsed command from parseSlashCommand
   * @param {Object} context - Request context
   * @param {Object} policy - Current agent policy
   * @returns {Promise<Object>} Formatted result
   * @private
   */
  async _executeCommandTools(parsed, context, policy) {
    const { commandKey, args, toolMapping } = parsed;
    const db = require('../db/connection');

    let data = null;
    let summary = '';
    const details = [];
    const sources = [];

    switch (commandKey) {
      case 'clients': {
        const clients = db.prepare(
          `SELECT id, name, email, phone, status FROM clients WHERE deleted_at IS NULL ORDER BY name LIMIT 50`
        ).all();
        data = clients;
        summary = `Found ${clients.length} client(s)`;
        clients.forEach(c => {
          details.push(`• ${c.name} (ID: ${c.id}) - ${c.status || 'active'}${c.email ? ` - ${c.email}` : ''}`);
        });
        sources.push({ sourceType: 'database', reference: 'clients', note: 'Client list query' });
        break;
      }

      case 'client': {
        const arg = args.join(' ');
        const isId = /^\d+$/.test(arg);
        let client;
        if (isId) {
          client = db.prepare(
            `SELECT * FROM clients WHERE id = ? AND deleted_at IS NULL`
          ).get(parseInt(arg, 10));
        } else {
          const clients = db.prepare(
            `SELECT * FROM clients WHERE name LIKE ? COLLATE NOCASE AND deleted_at IS NULL LIMIT 10`
          ).all(`%${arg}%`);
          if (clients.length === 1) {
            client = clients[0];
          } else if (clients.length > 1) {
            summary = `Multiple clients match "${arg}"`;
            clients.forEach(c => {
              details.push(`• ${c.name} (ID: ${c.id}) - ${c.status || 'active'}`);
            });
            details.push('', 'Use /client <id> to select a specific client.');
            break;
          }
        }
        if (client) {
          summary = `Client: ${client.name}`;
          details.push(`ID: ${client.id}`);
          details.push(`Status: ${client.status || 'active'}`);
          if (client.email) details.push(`Email: ${client.email}`);
          if (client.phone) details.push(`Phone: ${client.phone}`);
          if (client.company) details.push(`Company: ${client.company}`);
          if (client.profession) details.push(`Profession: ${client.profession}`);
          sources.push({ sourceType: 'database', reference: `client:${client.id}`, note: 'Client lookup' });
        } else {
          summary = `No client found for "${arg}"`;
          details.push('Try /clients to see all available clients.');
        }
        break;
      }

      case 'dossiers': {
        const dossiers = db.prepare(
          `SELECT d.id, d.reference, d.title, d.status, d.priority, c.name as client_name
           FROM dossiers d
           LEFT JOIN clients c ON c.id = d.client_id
           WHERE d.deleted_at IS NULL
           ORDER BY d.updated_at DESC
           LIMIT 50`
        ).all();
        data = dossiers;
        summary = `Found ${dossiers.length} dossier(s)`;
        dossiers.forEach(d => {
          details.push(`• ${d.reference}: ${d.title} (${d.status}) - ${d.client_name || 'No client'}`);
        });
        sources.push({ sourceType: 'database', reference: 'dossiers', note: 'Dossier list query' });
        break;
      }

      case 'dossier': {
        const arg = args.join(' ');
        const isRef = /^DOS-\d{4}-\d+$/i.test(arg);
        const isId = /^\d+$/.test(arg);
        let dossier;
        if (isRef) {
          dossier = db.prepare(
            `SELECT d.*, c.name as client_name FROM dossiers d
             LEFT JOIN clients c ON c.id = d.client_id
             WHERE d.reference = ? COLLATE NOCASE AND d.deleted_at IS NULL`
          ).get(arg.toUpperCase());
        } else if (isId) {
          dossier = db.prepare(
            `SELECT d.*, c.name as client_name FROM dossiers d
             LEFT JOIN clients c ON c.id = d.client_id
             WHERE d.id = ? AND d.deleted_at IS NULL`
          ).get(parseInt(arg, 10));
        } else {
          const dossiers = db.prepare(
            `SELECT d.*, c.name as client_name FROM dossiers d
             LEFT JOIN clients c ON c.id = d.client_id
             WHERE d.title LIKE ? COLLATE NOCASE AND d.deleted_at IS NULL LIMIT 10`
          ).all(`%${arg}%`);
          if (dossiers.length === 1) {
            dossier = dossiers[0];
          } else if (dossiers.length > 1) {
            summary = `Multiple dossiers match "${arg}"`;
            dossiers.forEach(d => {
              details.push(`• ${d.reference}: ${d.title}`);
            });
            details.push('', 'Use /dossier <reference> to select a specific dossier.');
            break;
          }
        }
        if (dossier) {
          summary = `Dossier: ${dossier.reference}`;
          details.push(`Title: ${dossier.title}`);
          details.push(`Status: ${dossier.status || 'open'}`);
          details.push(`Priority: ${dossier.priority || 'medium'}`);
          details.push(`Client: ${dossier.client_name || 'None'}`);
          if (dossier.phase) details.push(`Phase: ${dossier.phase}`);
          if (dossier.assigned_lawyer) details.push(`Assigned: ${dossier.assigned_lawyer}`);
          if (dossier.next_deadline) details.push(`Next deadline: ${dossier.next_deadline}`);
          sources.push({ sourceType: 'database', reference: `dossier:${dossier.id}`, note: 'Dossier lookup' });
        } else {
          summary = `No dossier found for "${arg}"`;
          details.push('Try /dossiers to see all available dossiers.');
        }
        break;
      }

      case 'tasks': {
        const tasks = db.prepare(
          `SELECT t.id, t.title, t.status, t.priority, t.due_date, d.reference as dossier_ref
           FROM tasks t
           LEFT JOIN dossiers d ON d.id = t.dossier_id
           WHERE t.deleted_at IS NULL AND t.status NOT IN ('done', 'cancelled')
           ORDER BY t.priority DESC, t.due_date ASC
           LIMIT 30`
        ).all();
        data = tasks;
        summary = `Found ${tasks.length} active task(s)`;
        tasks.forEach(t => {
          const due = t.due_date ? ` (due: ${t.due_date})` : '';
          details.push(`• [${t.priority}] ${t.title}${due} - ${t.dossier_ref || 'No dossier'}`);
        });
        sources.push({ sourceType: 'database', reference: 'tasks', note: 'Task list query' });
        break;
      }

      case 'tasks-overdue': {
        const now = new Date().toISOString();
        const tasks = db.prepare(
          `SELECT t.id, t.title, t.status, t.priority, t.due_date, d.reference as dossier_ref,
                  julianday(?) - julianday(t.due_date) as days_overdue
           FROM tasks t
           LEFT JOIN dossiers d ON d.id = t.dossier_id
           WHERE t.deleted_at IS NULL
             AND t.status NOT IN ('done', 'cancelled')
             AND t.due_date IS NOT NULL
             AND t.due_date < ?
           ORDER BY t.due_date ASC`
        ).all(now, now);
        data = tasks;
        summary = tasks.length > 0
          ? `⚠ ${tasks.length} overdue task(s)`
          : '✓ No overdue tasks';
        tasks.forEach(t => {
          details.push(`• [${t.priority}] ${t.title} - ${Math.round(t.days_overdue)} days overdue (${t.dossier_ref || 'No dossier'})`);
        });
        sources.push({ sourceType: 'analysis', reference: 'overdue_tasks', note: 'Overdue task detection' });
        break;
      }

      case 'sessions': {
        const sessions = db.prepare(
          `SELECT s.id, s.session_type, s.status, s.scheduled_at, s.location
           FROM sessions s
           WHERE s.deleted_at IS NULL
           ORDER BY s.scheduled_at DESC
           LIMIT 30`
        ).all();
        data = sessions;
        summary = `Found ${sessions.length} session(s)`;
        sessions.forEach(s => {
          const when = s.scheduled_at ? new Date(s.scheduled_at).toLocaleString() : 'unscheduled';
          details.push(`• ${s.session_type} (${s.status}) - ${when}${s.location ? ` at ${s.location}` : ''}`);
        });
        sources.push({ sourceType: 'database', reference: 'sessions', note: 'Session list query' });
        break;
      }

      case 'sessions-today': {
        const today = new Date().toISOString().split('T')[0];
        const sessions = db.prepare(
          `SELECT s.id, s.session_type, s.status, s.scheduled_at, s.location
           FROM sessions s
           WHERE s.deleted_at IS NULL
             AND date(s.scheduled_at) = date(?)
           ORDER BY s.scheduled_at ASC`
        ).all(today);
        data = sessions;
        summary = sessions.length > 0
          ? `${sessions.length} session(s) scheduled for today`
          : 'No sessions scheduled for today';
        sessions.forEach(s => {
          const time = s.scheduled_at ? new Date(s.scheduled_at).toLocaleTimeString() : '';
          details.push(`• ${time} - ${s.session_type} (${s.status})${s.location ? ` at ${s.location}` : ''}`);
        });
        sources.push({ sourceType: 'database', reference: 'sessions_today', note: "Today's sessions" });
        break;
      }

      case 'sessions-week': {
        const today = new Date();
        const weekEnd = new Date(today);
        weekEnd.setDate(today.getDate() + 7);
        const sessions = db.prepare(
          `SELECT s.id, s.session_type, s.status, s.scheduled_at, s.location
           FROM sessions s
           WHERE s.deleted_at IS NULL
             AND date(s.scheduled_at) >= date(?)
             AND date(s.scheduled_at) <= date(?)
           ORDER BY s.scheduled_at ASC`
        ).all(today.toISOString(), weekEnd.toISOString());
        data = sessions;
        summary = sessions.length > 0
          ? `${sessions.length} session(s) scheduled this week`
          : 'No sessions scheduled for this week';
        sessions.forEach(s => {
          const when = s.scheduled_at ? new Date(s.scheduled_at).toLocaleString() : '';
          details.push(`• ${when} - ${s.session_type} (${s.status})${s.location ? ` at ${s.location}` : ''}`);
        });
        sources.push({ sourceType: 'database', reference: 'sessions_week', note: "This week's sessions" });
        break;
      }

      default:
        summary = `Command ${commandKey} not implemented`;
        details.push('This command is recognized but not yet implemented.');
    }

    return {
      type: 'explanation',
      entityId: `command:${commandKey}`,
      entityType: 'command_result',
      summary,
      details: details.length > 0 ? details : ['No results found.'],
      timestamp: new Date().toISOString(),
      confidence: 1,
      sources,
      status: 'complete',
      source: 'command-executor',
      requires_validation: false,
    };
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
    const { type, nameHint, reference, targetEntity } = hint;

    // Resolution by dossier reference (exact match)
    if (type === 'dossier' && reference) {
      try {
        const result = await this._callReadTool('getDossier', { reference }, policy);
        if (result && result.dossier) {
          return { resolved: true, entity: result.dossier, type: 'dossier' };
        }
        return { resolved: false, reason: 'not_found', message: `No dossier found with reference ${reference}` };
      } catch (err) {
        return { resolved: false, reason: 'error', message: err.message };
      }
    }

    // Resolution by client name (fuzzy match)
    if (type === 'client' && nameHint) {
      try {
        const result = await this._callReadTool('searchClientsByName', { nameHint }, policy);
        if (!result || !result.clients || result.clients.length === 0) {
          return { resolved: false, reason: 'not_found', message: `No client found matching "${nameHint}"` };
        }
        if (result.clients.length === 1) {
          return { resolved: true, entity: result.clients[0], type: 'client' };
        }
        // Multiple matches - ambiguous
        return {
          resolved: false,
          reason: 'ambiguous',
          message: `Multiple clients match "${nameHint}". Please specify which one.`,
          candidates: result.clients.map(c => ({ id: c.id, name: c.name })),
        };
      } catch (err) {
        return { resolved: false, reason: 'error', message: err.message };
      }
    }

    return { resolved: false, reason: 'unsupported', message: `Cannot resolve entity type: ${type}` };
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
      // Fallback to direct DB queries for entity resolution (built-in)
      return this._builtinEntityLookup(toolName, params);
    }

    // Verify tool category is 'read' and policy allows it
    if (tool.category !== 'read') {
      const error = new Error(`Tool ${toolName} is not a READ tool`);
      error.status = 403;
      throw error;
    }

    if (!policy.allowedToolCategories.includes('read')) {
      const error = new Error('READ tools not permitted for this agent version');
      error.status = 403;
      throw error;
    }

    // Execute through standard callTool path
    const result = await this.callTool(toolName, params, policy, { confirmed: true });
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
    // Lazy require to avoid circular dependencies
    const db = require('../db/connection');

    if (lookupType === 'searchClientsByName') {
      const { nameHint } = params;
      if (!nameHint || typeof nameHint !== 'string') {
        return { clients: [] };
      }
      // Sanitize input - only allow alphanumeric and spaces
      const sanitized = nameHint.replace(/[^a-zA-Z0-9\s]/g, '');
      if (!sanitized) {
        return { clients: [] };
      }
      const pattern = `%${sanitized}%`;
      const clients = db.prepare(
        `SELECT id, name, email, phone, status
         FROM clients
         WHERE deleted_at IS NULL
           AND (name LIKE ? COLLATE NOCASE)
         LIMIT 10`
      ).all(pattern);
      return { clients };
    }

    if (lookupType === 'getDossierByReference') {
      const { reference } = params;
      if (!reference || typeof reference !== 'string') {
        return { dossier: null };
      }
      // Validate reference format (DOS-YYYY-NNNNNN)
      if (!/^DOS-\d{4}-\d+$/i.test(reference)) {
        return { dossier: null };
      }
      const dossier = db.prepare(
        `SELECT d.*, c.name as client_name
         FROM dossiers d
         LEFT JOIN clients c ON c.id = d.client_id
         WHERE d.deleted_at IS NULL AND d.reference = ?`
      ).get(reference.toUpperCase());
      return { dossier: dossier || null };
    }

    if (lookupType === 'listDossiersForClient') {
      const { clientId } = params;
      if (!clientId || typeof clientId !== 'number' || clientId <= 0) {
        return { dossiers: [] };
      }
      const dossiers = db.prepare(
        `SELECT id, reference, title, status, priority, phase, next_deadline
         FROM dossiers
         WHERE deleted_at IS NULL AND client_id = ?
         ORDER BY updated_at DESC
         LIMIT 20`
      ).all(clientId);
      return { dossiers };
    }

    return null;
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
        if (resolution.type === 'client' && hint.targetEntity === 'dossier') {
          const dossiers = await this._callReadTool('listDossiersForClient', {
            clientId: resolution.entity.id,
          }, policy);
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
        const clientResult = await this._callReadTool('getClient', { clientId: context.clientId }, policy);
        if (clientResult?.client) {
          result.entities.client = clientResult.client;
        }
      } catch (err) {
        this.ledger.record({ type: 'data_fetch_error', tool: 'getClient', error: err.message });
      }
    }

    if (context.dossierId && !result.entities.dossier) {
      try {
        const dossierResult = await this._callReadTool('getDossier', { dossierId: context.dossierId }, policy);
        if (dossierResult?.dossier) {
          result.entities.dossier = dossierResult.dossier;
        }
      } catch (err) {
        this.ledger.record({ type: 'data_fetch_error', tool: 'getDossier', error: err.message });
      }
    }

    // Step 3: Fetch lists based on detected needs
    if (dataReqs.needs.includes(DATA_REQUIREMENTS.OVERDUE_TASKS)) {
      try {
        const overdueResult = await this._callReadTool('detectOverdueTasks', {
          dossierId: context.dossierId || null,
        }, policy);
        result.lists.overdueTasks = overdueResult?.overdueTasks || [];
        result.lists.overdueAnalysis = overdueResult?.analysis || {};
      } catch (err) {
        this.ledger.record({ type: 'data_fetch_error', tool: 'detectOverdueTasks', error: err.message });
      }
    }

    if (dataReqs.needs.includes(DATA_REQUIREMENTS.TASK)) {
      try {
        const tasksResult = await this._callReadTool('listTasks', {
          dossierId: context.dossierId || null,
          limit: 20,
        }, policy);
        result.lists.tasks = tasksResult?.tasks || [];
      } catch (err) {
        this.ledger.record({ type: 'data_fetch_error', tool: 'listTasks', error: err.message });
      }
    }

    // Step 4: Fetch timeline if needed
    if (dataReqs.needs.includes(DATA_REQUIREMENTS.TIMELINE)) {
      try {
        const timelineParams = {};
        if (context.clientId) timelineParams.entityType = 'client';
        if (context.dossierId) timelineParams.entityType = 'dossier';
        if (context.clientId) timelineParams.entityId = context.clientId;
        if (context.dossierId) timelineParams.entityId = context.dossierId;

        if (timelineParams.entityType) {
          const timelineResult = await this._callReadTool('getTimeline', timelineParams, policy);
          result.lists.timeline = timelineResult?.events || [];
        }
      } catch (err) {
        this.ledger.record({ type: 'data_fetch_error', tool: 'getTimeline', error: err.message });
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
      enriched.entityId = enriched.entityId || String(fetchedData.entities.client.id);
      enriched.entityType = enriched.entityType || 'client';
    }

    if (fetchedData.entities.dossier) {
      enriched.dossierData = fetchedData.entities.dossier;
      enriched.entityId = enriched.entityId || String(fetchedData.entities.dossier.id);
      enriched.entityType = enriched.entityType || 'dossier';
      enriched.status = enriched.status || fetchedData.entities.dossier.status;
      enriched.owner = enriched.owner || fetchedData.entities.dossier.assigned_lawyer;
      enriched.lastUpdated = enriched.lastUpdated || fetchedData.entities.dossier.updated_at;
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
}

module.exports = AgentEngine;
