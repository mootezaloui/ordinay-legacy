"use strict";

const classifyIntent = require("../intent.classifier");
const {
  detectDataRequirements,
  detectReadIntent,
  detectDraftIntent,
  detectFollowUp,
  isSlashCommand,
  READ_INTENTS,
} = require("../intent.classifier");
const { CONTEXT_SOURCES } = require("../context/conversation.context");
const { INTENTS } = require("../intents");
const {
  createAgentRequest,
  extractAgentContext,
} = require("../contracts/agentRequest.contract");
const {
  createAgentResponse,
  RESPONSE_STATUS,
} = require("../contracts/agentResponse.contract");
const {
  resolveEntityDisplayLabel,
  formatEntityTypeLabel,
} = require("../utils/entityDisplay");
const { resolveInteractionPosture, POSTURES } = require("../posture.resolver");

const EXTERNAL_SEARCH_INTENTS = new Set([
  READ_INTENTS.WEB_SEARCH,
  READ_INTENTS.DEEP_SEARCH,
]);

function isExternalSearchIntent(readIntent) {
  return Boolean(readIntent && EXTERNAL_SEARCH_INTENTS.has(readIntent.intent));
}

function normalizeWebSearchTrigger(rawTrigger, fallback = "explicit_language") {
  const normalized = String(rawTrigger || "").trim().toLowerCase();
  if (normalized === "button" || normalized === "user_confirmed") {
    return normalized;
  }
  return fallback;
}

function detectsExternalInfoNeed(message = "") {
  const normalized = String(message || "").toLowerCase();
  if (!normalized) return false;
  return /\b(latest|recent|current|up[-\s]?to[-\s]?date|today|new precedent|online precedent|recent case law)\b/i.test(
    normalized,
  );
}

function isWorkSnapshotRefreshRequest(message) {
  const normalized = String(message || "").toLowerCase();
  if (!normalized) return false;
  if (/\b(refresh|reload)\b/i.test(normalized)) return true;
  return /\bupdate\b\s+(?:the\s+)?(?:snapshot|work\s+snapshot|dossier\s+snapshot|dossier|work\s+mode)\b/i.test(
    normalized,
  );
}

function buildExternalSearchClarification({
  searchIntent,
  query,
  suggestedTrigger = "user_confirmed",
}) {
  return {
    type: "clarification",
    reason: {
      type: "EXTERNAL_SEARCH_CONFIRMATION_REQUIRED",
      entityType: "web_search",
    },
    signals: [
      {
        type: "CLARIFICATION_REQUIRED",
        reason: "EXTERNAL_SEARCH_CONFIRMATION_REQUIRED",
        entityType: "web_search",
      },
    ],
    options: [
      {
        action: "ENABLE_WEB_SEARCH",
        intent: searchIntent,
        filters: {
          query: query || null,
        },
      },
    ],
    prompt:
      "I may need to search the web for up-to-date external information. Would you like me to search the web?",
    searchRequest: {
      searchIntent,
      query: query || null,
      suggestedTrigger,
    },
    timestamp: new Date().toISOString(),
    status: "awaiting_input",
    source: "search-web-gate",
    requires_validation: false,
  };
}

function buildWorkSnapshotRefreshReadIntent(message, context, contextStore) {
  if (!isWorkSnapshotRefreshRequest(message)) return null;
  const storedContext =
    context && contextStore && typeof contextStore.get === "function"
      ? contextStore.get(context)
      : null;
  const workSnapshot = storedContext?.workSnapshot || null;
  if (
    !workSnapshot ||
    String(workSnapshot.entityType || "").toLowerCase() !== "dossier" ||
    !workSnapshot.entityId
  ) {
    return null;
  }

  return {
    intent: READ_INTENTS.READ_DOSSIER,
    requiresLocalData: true,
    allowedTools: ["getDossier", "getDossierByReference"],
    entityHints: [
      {
        type: "id",
        value: workSnapshot.entityId,
        entityType: "dossier",
      },
    ],
    filters: { _snapshotRefresh: true },
  };
}

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
  documentContext,
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
  const hasTurnDocumentContext = Boolean(
    documentContext &&
      Array.isArray(documentContext.documents) &&
      documentContext.documents.length > 0,
  );
  const turnDocumentCount = hasTurnDocumentContext
    ? documentContext.documents.length
    : Number(context?.documentCount || 0);
  const turnContext = hasTurnDocumentContext
    ? {
        ...(context || {}),
        _hasDocumentContext: true,
        hasDocuments: true,
        documentCount: turnDocumentCount,
        _turnDocumentContext: documentContext,
      }
    : { ...(context || {}) };
  const conversationContextSnapshot =
    turnContext && this.contextStore?.get
      ? this.contextStore.get(turnContext)
      : null;
  const followUpDetection = hasFollowUpIntent
    ? null
    : detectFollowUp(normalizedMessage, turnContext);
  const documentReadIntentCandidate =
    !hasFollowUpIntent && hasTurnDocumentContext
      ? detectReadIntent(normalizedMessage, turnContext)
      : null;
  const hasDocumentTurnBinding =
    hasTurnDocumentContext &&
    documentReadIntentCandidate?.intent === READ_INTENTS.SUMMARIZE_DOCUMENT;
  const postureResolutionContext = conversationContextSnapshot
    ? {
        ...(turnContext || {}),
        lastPosture: conversationContextSnapshot.lastPosture || null,
        lastIntent: conversationContextSnapshot.lastIntent || null,
        activeEntityType: conversationContextSnapshot.activeEntityType || null,
        activeEntityId: conversationContextSnapshot.activeEntityId || null,
      }
    : (turnContext || {});
  const resolvedPosture = await resolveInteractionPosture(
    normalizedMessage,
    postureResolutionContext,
  );

  const postureAuthority = {
    resolvedMode: resolvedPosture?.mode || POSTURES.ASSISTANT,
    finalMode: resolvedPosture?.mode || POSTURES.ASSISTANT,
    overrideRule: null,
    followUpSignal: followUpDetection?.type || null,
    followUpReason: followUpDetection?.reason || null,
    hasStructuredFollowUpIntent: hasFollowUpIntent,
    contextPosture: conversationContextSnapshot?.lastPosture || null,
    hasTurnDocumentContext,
    hasDocumentTurnBinding,
  };
  const inheritedContextPosture = String(
    conversationContextSnapshot?.lastPosture || "",
  ).toUpperCase();
  const hasGovernedContextPosture =
    inheritedContextPosture === POSTURES.WORK ||
    inheritedContextPosture === POSTURES.INSPECTION;
  const followUpHasStrongContextAnchor = Boolean(
    conversationContextSnapshot?.lastIntent ||
      conversationContextSnapshot?.activeEntityType ||
      conversationContextSnapshot?.pendingSelection,
  );
  const canInheritGovernedPosture =
    !hasFollowUpIntent &&
    followUpDetection?.isFollowUp === true &&
    hasGovernedContextPosture &&
    followUpHasStrongContextAnchor &&
    followUpDetection?.reason !== "vague_query";

  let finalPosture = resolvedPosture || {
    mode: POSTURES.ASSISTANT,
    confidence: 0.5,
    signals: ["posture_default"],
  };

  if (
    hasFollowUpIntent &&
    finalPosture.mode === POSTURES.ASSISTANT &&
    hasGovernedContextPosture
  ) {
    finalPosture = {
      ...finalPosture,
      mode: inheritedContextPosture,
      confidence: Math.max(finalPosture.confidence || 0, 0.85),
      signals: [
        ...(Array.isArray(finalPosture.signals) ? finalPosture.signals : []),
        "structured_follow_up_context_posture",
      ],
    };
    postureAuthority.overrideRule = "structured_follow_up_context_posture";
  } else if (
    finalPosture.mode === POSTURES.ASSISTANT &&
    canInheritGovernedPosture
  ) {
    finalPosture = {
      ...finalPosture,
      mode: inheritedContextPosture,
      confidence: Math.max(finalPosture.confidence || 0, 0.8),
      signals: [
        ...(Array.isArray(finalPosture.signals) ? finalPosture.signals : []),
        "follow_up_context_posture",
      ],
    };
    postureAuthority.overrideRule = "follow_up_context_posture";
  } else if (hasDocumentTurnBinding && finalPosture.mode === POSTURES.ASSISTANT) {
    finalPosture = {
      ...finalPosture,
      mode: POSTURES.INSPECTION,
      confidence: Math.max(finalPosture.confidence || 0, 0.9),
      signals: [
        ...(Array.isArray(finalPosture.signals) ? finalPosture.signals : []),
        "document_turn_binding",
      ],
    };
    postureAuthority.overrideRule = "document_turn_binding";
  }
  postureAuthority.finalMode = finalPosture.mode;
  const governedPosture = finalPosture?.mode !== POSTURES.ASSISTANT;
  this.ledger.record({
    type: "posture_arbitrated",
    resolvedMode: postureAuthority.resolvedMode,
    finalMode: postureAuthority.finalMode,
    overrideRule: postureAuthority.overrideRule,
    hasStructuredFollowUpIntent: hasFollowUpIntent,
    followUpType: followUpDetection?.type || null,
    followUpReason: followUpDetection?.reason || null,
    contextPosture: postureAuthority.contextPosture,
    timestamp: new Date().toISOString(),
  });

  const engineContext = {
    sessionId:
      turnContext?.sessionId ||
      turnContext?.conversationId ||
      turnContext?.session?.id ||
      null,
    userId: turnContext?.userId || turnContext?.user?.id || null,
    activeEntity: turnContext?.activeEntity || null,
    dataAccess: turnContext?.dataAccess || null,
    requestMetadata: turnContext?.requestMetadata || null,
    documentContext: documentContext || null,
    posture: finalPosture || null,
    postureAuthority,
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
    if (!governedPosture) {
      return {
        intent: "FOLLOW_UP_CLARIFICATION",
        agentVersion: policy.version,
        reasoner: "posture-arbitration",
        output: {
          type: "clarification",
          reason: {
            type: "FOLLOW_UP_REQUIRES_GOVERNED_POSTURE",
          },
          signals: [
            {
              type: "CLARIFICATION_REQUIRED",
              reason: "FOLLOW_UP_REQUIRES_GOVERNED_POSTURE",
            },
          ],
          options: [],
          timestamp: new Date().toISOString(),
          status: "awaiting_input",
          source: "posture-arbitration",
          requires_validation: false,
        },
        posture: engineContext.posture,
        postureAuthority: engineContext.postureAuthority,
        needsUserInput: true,
      };
    }
    this._ensureTurnGateAllowed(policy, {
      gate: "structured_follow_up",
      intent: followUpIntent?.intent || null,
      requiresRead: true,
    });
    engineContext.followUp = {
      type: "structured",
      intent: followUpIntent?.intent || null,
      origin: followUpIntent?.origin || null,
    };
    const result = await this._executeFollowUpIntent(
      followUpIntent,
      normalizedMessage,
      turnContext,
      policy,
      engineContext,
    );
    this._updateConversationContext(
      turnContext,
      normalizedMessage,
      result,
      CONTEXT_SOURCES.FOLLOW_UP,
      engineContext.posture,
    );
    return {
      ...result,
      posture: engineContext.posture,
      postureAuthority: engineContext.postureAuthority,
    };
  }
  // ========== END FOLLOW-UP INTENT ==========

  // STEP: Check for slash commands BEFORE intent classification
  if (governedPosture && isSlashCommand(normalizedMessage)) {
    this._ensureTurnGateAllowed(policy, {
      gate: "slash_command",
      intent: "COMMAND",
      requiresRead: true,
    });
    engineContext.intent = "COMMAND";
    const result = await this._executeSlashCommand(
      normalizedMessage,
      turnContext,
      policy,
      engineContext,
    );
    // Update conversation context after slash command
    this._updateConversationContext(
      turnContext,
      normalizedMessage,
      result,
      CONTEXT_SOURCES.SLASH_COMMAND,
      engineContext.posture,
    );
    return {
      ...result,
      posture: engineContext.posture,
      postureAuthority: engineContext.postureAuthority,
    };
  }

  // ========== FOLLOW-UP INTENT GATE ==========
  // Detect follow-up messages BEFORE regular intent classification
  if (governedPosture) {
    if (followUpDetection && followUpDetection.isFollowUp) {
      this._ensureTurnGateAllowed(policy, {
        gate: "follow_up_detected",
        intent: "FOLLOW_UP",
        requiresRead: true,
      });
      engineContext.followUp = {
        type: "detected",
        ...followUpDetection,
      };
      const followUpResult = await this._handleFollowUp(
        followUpDetection,
        normalizedMessage,
        turnContext,
        policy,
        engineContext,
      );
      if (followUpResult) {
        return {
          ...followUpResult,
          posture: engineContext.posture,
          postureAuthority: engineContext.postureAuthority,
        };
      }
      // If follow-up handling returns null, continue to regular processing
    }
  }
  // ========== END FOLLOW-UP INTENT GATE ==========

  const preDetectedDraftIntent = governedPosture
    ? detectDraftIntent(normalizedMessage, turnContext)
    : null;
  const preDetectedReadIntent = preDetectedDraftIntent
    ? null
    : hasDocumentTurnBinding
      ? documentReadIntentCandidate
      : detectReadIntent(normalizedMessage, turnContext);

  // ========== SEARCH_DEEP_WEB INTENT GATE ==========
  {
    const requestMetadata = turnContext?.requestMetadata || {};
    const metadataIntent = String(requestMetadata?.webSearchIntent || "").toUpperCase();
    const explicitDeepIntent =
      preDetectedReadIntent?.intent === READ_INTENTS.DEEP_SEARCH
        ? preDetectedReadIntent
        : null;
    const metadataDeepEnabled =
      requestMetadata?.webDeepSearchEnabled === true ||
      (requestMetadata?.webSearchEnabled === true &&
        metadataIntent === READ_INTENTS.DEEP_SEARCH);
    const metadataDeepIntent = metadataDeepEnabled
      ? {
          intent: READ_INTENTS.DEEP_SEARCH,
          requiresLocalData: true,
          filters: {
            query:
              requestMetadata?.webDeepSearchQuery ||
              requestMetadata?.webSearchQuery ||
              normalizedMessage,
          },
        }
      : null;
    const effectiveDeepSearchIntent = metadataDeepIntent || explicitDeepIntent;

    if (effectiveDeepSearchIntent) {
      this._ensureTurnGateAllowed(policy, {
        gate: "search_deep_web_intent",
        intent: effectiveDeepSearchIntent.intent,
        requiresRead: true,
      });

      if (!policy.allowExternalSearch) {
        return {
          ...this._generateDomainDeniedResponse(
            "legal",
            `External search is disabled by policy ${policy.version}.`,
            policy,
          ),
          posture: engineContext.posture,
          postureAuthority: engineContext.postureAuthority,
        };
      }

      const triggeredBy = metadataDeepEnabled
        ? normalizeWebSearchTrigger(
            requestMetadata?.webDeepSearchTrigger || requestMetadata?.webSearchTrigger,
            "button",
          )
        : "explicit_language";
      const query = String(
        requestMetadata?.webDeepSearchQuery ||
          requestMetadata?.webSearchQuery ||
          effectiveDeepSearchIntent?.filters?.query ||
          normalizedMessage ||
          "",
      ).trim();

      engineContext.intent = READ_INTENTS.DEEP_SEARCH;
      this.ledger.record({
        type: "search_deep_web_gate_triggered",
        searchIntent: READ_INTENTS.DEEP_SEARCH,
        triggeredBy,
        query,
        timestamp: new Date().toISOString(),
      });

      const deepSearchResult = await this._executeDeepSearchIntent(
        {
          ...effectiveDeepSearchIntent,
          filters: {
            ...(effectiveDeepSearchIntent.filters || {}),
            query,
          },
        },
        normalizedMessage,
        {
          ...(turnContext || {}),
          requestMetadata: {
            ...requestMetadata,
            webDeepSearchEnabled: true,
            webDeepSearchTrigger: triggeredBy,
            webDeepSearchQuery: query,
            webSearchEnabled: true,
            webSearchIntent: READ_INTENTS.DEEP_SEARCH,
            webSearchTrigger: triggeredBy,
            webSearchQuery: query,
          },
        },
        policy,
        engineContext,
      );
      this._updateConversationContext(
        turnContext,
        normalizedMessage,
        deepSearchResult,
        CONTEXT_SOURCES.READ_INTENT,
        engineContext.posture,
      );
      return {
        ...deepSearchResult,
        posture: engineContext.posture,
        postureAuthority: engineContext.postureAuthority,
      };
    }
  }
  // ========== END SEARCH_DEEP_WEB INTENT GATE ==========

  // ========== SEARCH_WEB INTENT GATE ==========
  {
    const requestMetadata = turnContext?.requestMetadata || {};
    const metadataIntent = String(requestMetadata?.webSearchIntent || "").toUpperCase();
    const metadataSearchEnabled =
      requestMetadata?.webSearchEnabled === true &&
      requestMetadata?.webDeepSearchEnabled !== true &&
      metadataIntent !== READ_INTENTS.DEEP_SEARCH;
    const explicitSearchIntent =
      preDetectedReadIntent?.intent === READ_INTENTS.WEB_SEARCH
        ? preDetectedReadIntent
        : null;
    const metadataSearchIntent = metadataSearchEnabled
      ? {
          intent: READ_INTENTS.WEB_SEARCH,
          requiresLocalData: true,
          filters: {
            query: requestMetadata?.webSearchQuery || normalizedMessage,
          },
        }
      : null;
    const effectiveSearchIntent = metadataSearchIntent || explicitSearchIntent;
    const shouldSuggestExternalSearch =
      !effectiveSearchIntent &&
      requestMetadata?.webDeepSearchEnabled !== true &&
      !metadataSearchEnabled &&
      policy.allowExternalSearch &&
      detectsExternalInfoNeed(normalizedMessage);

    if (shouldSuggestExternalSearch) {
      const inferredIntent = /\b(case\s+law|precedent|jurisprudence|statute|regulation)\b/i.test(
        normalizedMessage,
      )
        ? READ_INTENTS.DEEP_SEARCH
        : READ_INTENTS.WEB_SEARCH;
      const clarificationOutput = buildExternalSearchClarification({
        searchIntent: inferredIntent,
        query: normalizedMessage,
      });
      this.ledger.record({
        type: "search_web_confirmation_requested",
        searchIntent: inferredIntent,
        query: normalizedMessage,
        timestamp: new Date().toISOString(),
      });
      return {
        intent: "SEARCH_WEB_CONFIRMATION_REQUIRED",
        agentVersion: policy.version,
        reasoner: "search-web-gate",
        output: clarificationOutput,
        needsUserInput: true,
        posture: engineContext.posture,
        postureAuthority: engineContext.postureAuthority,
      };
    }

    if (effectiveSearchIntent) {
      this._ensureTurnGateAllowed(policy, {
        gate: "search_web_intent",
        intent: effectiveSearchIntent.intent,
        requiresRead: true,
      });

      if (!policy.allowExternalSearch) {
        return {
          ...this._generateDomainDeniedResponse(
            "web",
            `External search is disabled by policy ${policy.version}.`,
            policy,
          ),
          posture: engineContext.posture,
          postureAuthority: engineContext.postureAuthority,
        };
      }

      const triggeredBy = metadataSearchEnabled
        ? normalizeWebSearchTrigger(requestMetadata?.webSearchTrigger, "button")
        : "explicit_language";
      const query =
        String(
          requestMetadata?.webSearchQuery ||
            effectiveSearchIntent?.filters?.query ||
            normalizedMessage ||
            "",
        ).trim();

      engineContext.intent = effectiveSearchIntent.intent;
      this.ledger.record({
        type: "search_web_gate_triggered",
        searchIntent: effectiveSearchIntent.intent,
        triggeredBy,
        query,
        timestamp: new Date().toISOString(),
      });

      const searchResult = await this._executeSearchWebIntent(
        {
          ...effectiveSearchIntent,
          filters: {
            ...(effectiveSearchIntent.filters || {}),
            query,
          },
        },
        normalizedMessage,
        {
          ...(turnContext || {}),
          requestMetadata: {
            ...requestMetadata,
            webSearchEnabled: true,
            webSearchTrigger: triggeredBy,
            webSearchQuery: query,
            webSearchIntent: READ_INTENTS.WEB_SEARCH,
          },
        },
        policy,
        engineContext,
      );
      this._updateConversationContext(
        turnContext,
        normalizedMessage,
        searchResult,
        CONTEXT_SOURCES.READ_INTENT,
        engineContext.posture,
      );
      return {
        ...searchResult,
        posture: engineContext.posture,
        postureAuthority: engineContext.postureAuthority,
      };
    }
  }
  // ========== END SEARCH_WEB INTENT GATE ==========

  // ========== READ INTENT GATE ==========
  // Rule-based detection BEFORE LLM - ensures data questions always access local data
  if (governedPosture) {
    let readIntent = preDetectedReadIntent;
    if (!readIntent) {
      readIntent = buildWorkSnapshotRefreshReadIntent(
        normalizedMessage,
        turnContext,
        this.contextStore,
      );
    }
    // External search is routed exclusively through SEARCH_WEB / SEARCH_DEEP_WEB gates.
    if (isExternalSearchIntent(readIntent)) {
      readIntent = null;
    }
    if (
      readIntent &&
      readIntent.requiresLocalData &&
      policy.allowedToolCategories.includes("read")
    ) {
      this._ensureTurnGateAllowed(policy, {
        gate: "read_intent",
        intent: readIntent.intent,
        requiresRead: true,
      });
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
        turnContext,
        policy,
        engineContext,
      );
      // Update conversation context after read intent execution
      this._updateConversationContext(
        turnContext,
        normalizedMessage,
        readResult,
        CONTEXT_SOURCES.READ_INTENT,
        engineContext.posture,
      );
      return {
        ...readResult,
        posture: engineContext.posture,
        postureAuthority: engineContext.postureAuthority,
      };
    }
  }
  // ========== END READ INTENT GATE ==========

  // ========== DRAFT INTENT GATE ==========
  // Rule-based detection BEFORE LLM — ensures draft requests invoke genericDraft tool
  if (governedPosture) {
    const draftIntent = preDetectedDraftIntent;
    if (
      draftIntent &&
      policy.allowedToolCategories.includes("draft")
    ) {
      this._ensureTurnGateAllowed(policy, {
        gate: "draft_intent",
        intent: draftIntent.intent,
        requiresRead: false,
      });
      engineContext.intent = draftIntent.intent;
      this.ledger.record({
        type: "draft_intent_gate_triggered",
        intent: draftIntent.intent,
        draftType: draftIntent.draftType,
        entityHints: draftIntent.entityHints,
        timestamp: new Date().toISOString(),
      });

      const draftResult = await this._executeDraftIntent(
        draftIntent,
        normalizedMessage,
        turnContext,
        policy,
        engineContext,
      );
      this._updateConversationContext(
        turnContext,
        normalizedMessage,
        draftResult,
        CONTEXT_SOURCES.DRAFT_INTENT,
        engineContext.posture,
      );
      return {
        ...draftResult,
        posture: engineContext.posture,
        postureAuthority: engineContext.postureAuthority,
      };
    }
  }
  // ========== END DRAFT INTENT GATE ==========

  // ========== DOCUMENT-ONLY GATE ==========
  // When documents are present but the user has not provided an explicit
  // instruction, skip intent classification entirely and return a neutral
  // acknowledgment.  This prevents the classifier / planner from inferring
  // analytical intents that may be disallowed by the current agent version.
  const hasDocumentContext =
    engineContext.documentContext &&
    engineContext.documentContext.documents &&
    engineContext.documentContext.documents.length > 0;

  if (hasDocumentContext) {
    const stripped = normalizedMessage.replace(/\[follow-up\]/g, "").trim();
    const isFileOnlyMessage =
      !stripped ||
      /^(uploaded?|attached?|sent|added|here|file|document|image|photo|pdf|see attached)[\s.!]*$/i.test(
        stripped,
      );

    if (isFileOnlyMessage) {
      this._ensureTurnGateAllowed(policy, {
        gate: "document_only",
        intent: INTENTS.GENERAL_CHAT,
      });
      engineContext.intent = INTENTS.GENERAL_CHAT;

      const docs = engineContext.documentContext.documents;
      const docCount = docs.length;
      const fileDescriptions = docs
        .map((d) => {
          const name = d.title || d.original_filename || "unnamed file";
          const type = d.mime_type || "unknown type";
          return `"${name}" (${type})`;
        })
        .join(", ");
      const pronoun = docCount === 1 ? "it" : "them";
      const fileLabel = docCount === 1 ? "your file" : `your ${docCount} files`;

      const ackOutput = {
        type: "chat",
        message: `I've received ${fileLabel}: ${fileDescriptions}. What would you like me to do with ${pronoun}? For example, I can summarize the content or answer questions about ${pronoun}.`,
        timestamp: new Date().toISOString(),
        source: "rule-based",
      };

      this.ledger.record({
        type: "document_only_gate_triggered",
        documentCount: docCount,
        originalMessage: normalizedMessage,
        timestamp: new Date().toISOString(),
      });

      return {
        intent: INTENTS.GENERAL_CHAT,
        agentVersion: policy.version,
        reasoner: "rule",
        output: ackOutput,
        posture: engineContext.posture,
        postureAuthority: engineContext.postureAuthority,
      };
    }
  }
  // ========== END DOCUMENT-ONLY GATE ==========

  let intent;
  if (!governedPosture) {
    intent = INTENTS.GENERAL_CHAT;
  } else {
    intent = await classifyIntent(normalizedMessage, turnContext);
  }
  engineContext.intent = intent;
  engineContext._hasExplicitUserIntent = true;
  this._ensureTurnGateAllowed(policy, {
    gate: "intent_classification",
    intent,
  });

  // STEP: Detect data requirements and fetch local data if needed
  const dataReqs = governedPosture
    ? detectDataRequirements(normalizedMessage, turnContext)
    : { requiresData: false, needs: [], entityHints: [] };
  let enrichedContext = turnContext;

  if (dataReqs.requiresData && policy.allowedToolCategories.includes("read")) {
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
      turnContext,
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

      const clarificationType = clarification?.hint?.type || "record";
      const candidateDetails = Array.isArray(clarification.candidates)
        ? clarification.candidates.map((c) =>
            resolveEntityDisplayLabel(clarificationType, c, {
              fallback: formatEntityTypeLabel(clarificationType),
            }),
          )
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
        request: { message, context: turnContext },
        response: clarificationOutput,
        needsClarification: true,
      });

      return {
        intent,
        agentVersion: policy.version,
        reasoner: "rule",
        output: clarificationOutput,
        needsClarification: true,
        posture: engineContext.posture,
        postureAuthority: engineContext.postureAuthority,
      };
    }

    // Build enriched context with fetched data
    enrichedContext = this._buildEnrichedContext(
      turnContext,
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

  // ═══ PLANNING PHASE ═══
  const plan = this._buildPlan(
    intent,
    {
      message: normalizedMessage,
      context: enrichedContext,
      dataReqs,
    },
    policy,
    engineContext,
  );

  // ═══ EXECUTION PHASE ═══
  engineContext._enrichedContext = enrichedContext;
  const executionResult = await this._executePlan(plan, policy, engineContext);

  if (executionResult.hasFailed && !executionResult.lastOutput) {
    this.ledger.record({
      type: "governed_mode_failed",
      intent,
      errors: executionResult.stepResults.filter((s) => s.error).map((s) => s.error),
      timestamp: new Date().toISOString(),
    });

    const error = new Error(
      `Plan execution failed: ${executionResult.stepResults
        .filter((s) => s.error)
        .map((s) => s.error)
        .join("; ")}`,
    );
    error.status = 500;
    throw error;
  }

  const response = executionResult.lastOutput;

  // ═══ EXPLANATION PHASE ═══
  engineContext.executionExplanation = this._buildExecutionExplanation(plan);

  this._validateAgainstSchema(intent, response, engineContext.posture);

  const schemaKey = this._schemaKeyForIntent(intent);
  const reasoner = this._resolveReasoner(policy, preferredReasoner);
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
      context: turnContext,
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
    plan: {
      planId: plan.planId,
      executionMode: plan.executionMode,
      status: plan.status,
      stepCount: plan.steps.length,
      summary: plan.executionSummary,
    },
  });

  return {
    intent,
    agentVersion: policy.version,
    reasoner: reasoner.name,
    output: response,
    posture: engineContext.posture,
    postureAuthority: engineContext.postureAuthority,
    ledgerEntryId: ledgerEntry.id,
    plan: {
      planId: plan.planId,
      executionMode: plan.executionMode,
      status: plan.status,
      summary: plan.executionSummary,
    },
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

function _ensureTurnGateAllowed(
  policy,
  { gate = "unknown", intent = null, requiresRead = false } = {},
) {
  if (requiresRead && !policy.allowedToolCategories.includes("read")) {
    const error = new Error(
      `Gate ${gate} requires read capability, but agent version ${policy.version} does not allow read tools.`,
    );
    error.status = 403;
    throw error;
  }

  if (!intent) return;

  const normalizedIntent = String(intent).toUpperCase();
  const readIntentValues = new Set(Object.values(READ_INTENTS));

  if (normalizedIntent === "COMMAND" || normalizedIntent === "FOLLOW_UP") {
    return;
  }

  if (
    readIntentValues.has(normalizedIntent) ||
    normalizedIntent === "READ_DATA"
  ) {
    if (!policy.allowedToolCategories.includes("read")) {
      const error = new Error(
        `Intent ${normalizedIntent} requires read capability in policy ${policy.version}.`,
      );
      error.status = 403;
      throw error;
    }
    return;
  }

  this._ensureIntentAllowed(normalizedIntent, policy);
}

async function _executeIntent(intent, reasoner, payload) {
  const { message, context } = payload;
  switch (intent) {
    case INTENTS.GENERAL_CHAT:
      console.log(
        "[Pipeline] Routing to GENERAL_CHAT reasoner path",
        JSON.stringify({ intent }),
      );
      return reasoner.chat({ message, context });
    case INTENTS.EXPLAIN_ENTITY_STATE:
      return reasoner.explain({ message, context });
    case INTENTS.SUMMARIZE_SESSION:
      return reasoner.summarize({ message, context });
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
  _ensureTurnGateAllowed,
  _executeIntent,
};
