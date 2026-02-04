"use strict";

const classifyIntent = require("../intent.classifier");
const {
  detectDataRequirements,
  detectReadIntent,
  detectFollowUp,
  isSlashCommand,
} = require("../intent.classifier");
const { CONTEXT_SOURCES } = require("../context/conversation.context");
const { INTENTS } = require("../intents");
const { createAgentRequest, extractAgentContext } = require("../contracts/agentRequest.contract");
const { createAgentResponse, RESPONSE_STATUS } = require("../contracts/agentResponse.contract");

async function processUIRequest(uiRequest) {
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

  async function run({
    message,
    context = {},
    agentVersion = "v1",
    reasoner: preferredReasoner,
    followUpIntent,
  } = {}) {
  const hasFollowUpIntent = Boolean(followUpIntent);
  const normalizedMessage =
    typeof message === "string" && message.trim()
      ? message
      : hasFollowUpIntent
        ? "[follow-up]"
        : "";
  if (!normalizedMessage) {
    const error = new Error("message is required");
    error.status = 400;
    throw error;
  }

  const policy = this._resolvePolicy(agentVersion);
  this._assertExecutionIntent(context, policy);

  const engineContext = {
    sessionId:
      context?.sessionId ||
      context?.conversationId ||
      context?.session?.id ||
      null,
    userId: context?.userId || context?.user?.id || null,
    activeEntity: context?.activeEntity || null,
    dataAccess: context?.dataAccess || null,
    request: {
      message: normalizedMessage,
      agentVersion: policy.version,
      reasoner: preferredReasoner || policy.defaultReasoner,
    },
    intent: null,
    followUp: null,
    artifacts: [],
    timings: {},
  };

  // ========== FOLLOW-UP INTENT (STRUCTURED) ==========
  if (hasFollowUpIntent) {
    engineContext.followUp = {
      type: "structured",
      intent: followUpIntent?.intent || null,
      origin: followUpIntent?.origin || null,
    };
    const result = await this._executeFollowUpIntent(
      followUpIntent,
      normalizedMessage,
      context,
      policy,
      engineContext,
    );
    this._updateConversationContext(
      context,
      normalizedMessage,
      result,
      CONTEXT_SOURCES.FOLLOW_UP,
    );
    return result;
  }
  // ========== END FOLLOW-UP INTENT ==========

  // STEP: Check for slash commands BEFORE intent classification
  if (isSlashCommand(normalizedMessage)) {
    engineContext.intent = "COMMAND";
    const result = await this._executeSlashCommand(
      normalizedMessage,
      context,
      policy,
      engineContext,
    );
    // Update conversation context after slash command
    this._updateConversationContext(
      context,
      normalizedMessage,
      result,
      CONTEXT_SOURCES.SLASH_COMMAND,
    );
    return result;
  }

  // ========== FOLLOW-UP INTENT GATE ==========
  // Detect follow-up messages BEFORE regular intent classification
  const followUpDetection = detectFollowUp(normalizedMessage, context);
  if (followUpDetection && followUpDetection.isFollowUp) {
    engineContext.followUp = {
      type: "detected",
      ...followUpDetection,
    };
    const followUpResult = await this._handleFollowUp(
      followUpDetection,
      normalizedMessage,
      context,
      policy,
      engineContext,
    );
    if (followUpResult) {
      return followUpResult;
    }
    // If follow-up handling returns null, continue to regular processing
  }
  // ========== END FOLLOW-UP INTENT GATE ==========

  // ========== READ INTENT GATE ==========
  // Rule-based detection BEFORE LLM - ensures data questions always access local data
  const readIntent = detectReadIntent(normalizedMessage, context);
  if (
    readIntent &&
    readIntent.requiresLocalData &&
    policy.allowedToolCategories.includes("read")
  ) {
    engineContext.intent = readIntent.intent;
    this.ledger.record({
      type: "read_intent_gate_triggered",
      intent: readIntent.intent,
      allowedTools: readIntent.allowedTools,
      timestamp: new Date().toISOString(),
    });

      const readResult = await this._executeReadIntent(
        readIntent,
        normalizedMessage,
        context,
        policy,
        engineContext,
      );
    // Update conversation context after read intent execution
    this._updateConversationContext(
      context,
      normalizedMessage,
      readResult,
      CONTEXT_SOURCES.READ_INTENT,
    );
    return readResult;
  }
  // ========== END READ INTENT GATE ==========

  const intent = await classifyIntent(normalizedMessage, context);
  engineContext.intent = intent;
  this._ensureIntentAllowed(intent, policy);

  // STEP: Detect data requirements and fetch local data if needed
  const dataReqs = detectDataRequirements(normalizedMessage, context);
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

      const candidateDetails = Array.isArray(clarification.candidates)
        ? clarification.candidates.map((c) => `${c.name} (ID: ${c.id})`)
        : [];

      // Return as explanation type (passes schema validation)
      const clarificationOutput = {
        type: "explanation",
        entityId: "pending_clarification",
        entityType: "query",
        summary: clarification.message,
        details: candidateDetails,
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
    message: normalizedMessage,
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


function _resolvePolicy(agentVersion) {
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


function _resolveReasoner(policy, preferredReasoner) {
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


function _assertExecutionIntent(context, policy) {
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


function _ensureIntentAllowed(intent, policy) {
  if (!policy.allowedIntents.includes(intent)) {
    const error = new Error(
      `Intent ${intent} is not permitted for agent version ${policy.version}.`,
    );
    error.status = 400;
    throw error;
  }
}


async function _executeIntent(intent, reasoner, payload) {
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

module.exports = {
  processUIRequest,
  run,
  _resolvePolicy,
  _resolveReasoner,
  _assertExecutionIntent,
  _ensureIntentAllowed,
  _executeIntent,
};
