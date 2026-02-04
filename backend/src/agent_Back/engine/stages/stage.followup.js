"use strict";

const {
  FOLLOW_UP_TYPES,
  READ_INTENTS,
  detectEntityType,
  hasExplicitEntityMention,
} = require("../../intent.classifier");
const { ACTION_TYPES, CONTEXT_SOURCES } = require("../../context/conversation.context");

async function _executeFollowUpIntent(
  followUpIntent,
  message,
  context,
  policy,
  engineContext,
) {
  this._validateFollowUpIntent(followUpIntent, policy, context);

  const normalizedIntent = String(followUpIntent.intent || "").toUpperCase();
  const originType = this._normalizeFollowUpEntityType(
    followUpIntent.origin?.entity || followUpIntent.entityType,
  );
  const originId =
    followUpIntent.origin?.entityId ?? followUpIntent.entityId ?? null;
  const scope = followUpIntent.scope || {};

  this.ledger.record({
    type: "follow_up_intent_received",
    intent: normalizedIntent,
    originType,
    originId,
    scope,
    timestamp: new Date().toISOString(),
  });

  const scopedContext = {
    ...(context || {}),
    ...scope,
    scope: this._resolveScopeTypeForFollowUp(scope, originType, normalizedIntent),
    _followUpExecution: true,
    _activeEntitySource: "follow-up",
  };

  const readIntent = {
    intent: normalizedIntent,
    requiresLocalData: true,
    allowedTools: [],
  };

  if (followUpIntent.filters && typeof followUpIntent.filters === "object") {
    readIntent.filters = { ...followUpIntent.filters };
  }

  if (normalizedIntent === READ_INTENTS.LIST_HISTORY_EVENTS) {
    readIntent.filters = {
      ...(readIntent.filters || {}),
      entityType: originType,
      entityId: originId,
    };
  }

  if (this._intentRequiresEntityHint(normalizedIntent)) {
    const targetType = this._resolveReadEntityType(normalizedIntent);
    const targetId = this._getScopeIdForType(scope, targetType);
    if (!targetId) {
      const error = new Error(
        `Follow-up intent requires ${targetType} scope.`,
      );
      error.status = 400;
      throw error;
    }
    readIntent.entityHints = [
      { type: "id", value: targetId, entityType: targetType },
    ];
  }

  const result = await this._executeReadIntent(
    readIntent,
    message,
    scopedContext,
    policy,
    engineContext,
  );

  return {
    ...result,
    isFollowUpIntent: true,
    followUpIntent: {
      intent: normalizedIntent,
      originType,
      originId,
    },
  };
}


function _validateFollowUpIntent(followUpIntent, policy, requestContext) {
  this._validateContract("follow_up_intent", followUpIntent, {
    intent: "FOLLOW_UP_INTENT",
  });

  if (!policy.allowedToolCategories.includes("read")) {
    const error = new Error("Follow-up intents require read access.");
    error.status = 403;
    throw error;
  }

  const normalizedIntent = String(followUpIntent.intent || "").toUpperCase();
  const allowedIntents = Object.values(READ_INTENTS);
  if (!allowedIntents.includes(normalizedIntent)) {
    const error = new Error(
      `Unsupported follow-up intent: ${followUpIntent.intent}`,
    );
    error.status = 400;
    throw error;
  }

  const activeContext = requestContext
    ? this.contextStore.get(requestContext)
    : null;
  const activeType = this._normalizeFollowUpEntityType(
    activeContext?.activeEntityType,
  );
  const activeId = activeContext?.activeEntityId ?? null;

  const targetType = this._resolveReadEntityType(normalizedIntent);
  const isList = normalizedIntent.startsWith("LIST_");
  const isRead =
    normalizedIntent.startsWith("READ_") ||
    normalizedIntent.startsWith("EXPLAIN_") ||
    normalizedIntent.startsWith("SUMMARIZE_");
  const pendingType = this._normalizeFollowUpEntityType(
    activeContext?.pendingSelection?.entityType,
  );
  const scopeTargetId = this._getScopeIdForType(
    followUpIntent.scope,
    targetType,
  );
  const allowWithoutActiveContext =
    pendingType && pendingType === targetType && (isList || scopeTargetId);

  if (
    (!activeType || activeId === null || activeId === undefined) &&
    !allowWithoutActiveContext
  ) {
    const error = new Error("NO_ENTITY_CONTEXT");
    error.status = 409;
    error.code = "NO_ENTITY_CONTEXT";
    throw error;
  }

  const originType = this._normalizeFollowUpEntityType(
    followUpIntent.origin?.entity || followUpIntent.entityType,
  );
  const originId =
    followUpIntent.origin?.entityId ?? followUpIntent.entityId ?? null;

  const entityType = this._normalizeFollowUpEntityType(
    followUpIntent.entityType,
  );
  if (entityType && originType && entityType !== originType) {
    const error = new Error(
      `Follow-up origin mismatch: ${entityType} vs ${originType}`,
    );
    error.status = 400;
    throw error;
  }

  if (
    followUpIntent.entityId !== undefined &&
    originId !== null &&
    String(followUpIntent.entityId) !== String(originId)
  ) {
    const error = new Error(
      "Follow-up origin ID mismatch between entityId and origin.entityId.",
    );
    error.status = 400;
    throw error;
  }

  if (originType && activeType && originType !== activeType) {
    const error = new Error(
      `Follow-up origin does not match active context (${activeType}).`,
    );
    error.status = 409;
    throw error;
  }

  if (
    originId !== null &&
    activeId !== null &&
    String(originId) !== String(activeId)
  ) {
    const error = new Error(
      "Follow-up origin ID does not match active context.",
    );
    error.status = 409;
    throw error;
  }

  const relations = {
    client: { children: ["dossier", "financial_entry"], parents: [] },
    dossier: {
      children: ["task", "session", "lawsuit", "financial_entry"],
      parents: ["client"],
    },
    lawsuit: { children: ["session", "task"], parents: ["dossier"] },
    task: { children: [], parents: ["dossier", "lawsuit"] },
    personal_task: { children: [], parents: [] },
    session: { children: [], parents: ["dossier", "lawsuit"] },
    mission: { children: [], parents: ["dossier"] },
    financial_entry: { children: [], parents: ["client", "dossier"] },
  };

  if (pendingType && targetType === pendingType) {
    if (!isList && !scopeTargetId) {
      const error = new Error("PENDING_SELECTION");
      error.status = 409;
      error.code = "PENDING_SELECTION";
      throw error;
    }
  }

  const originTypeForValidation = activeType || originType;
  const originIdForValidation = activeId ?? originId;

  if (normalizedIntent === READ_INTENTS.LIST_HISTORY_EVENTS) {
    this._assertScopeForFollowUp(
      followUpIntent.scope,
      originTypeForValidation,
      originIdForValidation,
    );
    return;
  }

  if (isList) {
    const isSameEntity = targetType === originTypeForValidation;
    const allowSameEntityList =
      isSameEntity && (followUpIntent.filters || pendingType === targetType);
    if (allowSameEntityList) {
      return;
    }

    if (isSameEntity) {
      const error = new Error(
        `Follow-up cannot list the same entity class (${targetType}).`,
      );
      error.status = 400;
      throw error;
    }

    const allowedChildren = relations[originTypeForValidation]?.children || [];
    if (!allowedChildren.includes(targetType)) {
      const error = new Error(
        `Follow-up intent ${normalizedIntent} is not valid for ${originTypeForValidation}.`,
      );
      error.status = 400;
      throw error;
    }

    this._assertScopeForFollowUp(
      followUpIntent.scope,
      originTypeForValidation,
      originIdForValidation,
    );
    return;
  }

  if (isRead) {
    const allowedParents = relations[originTypeForValidation]?.parents || [];
    const isSelf = targetType === originTypeForValidation;
    if (!isSelf && !allowedParents.includes(targetType)) {
      const error = new Error(
        `Follow-up intent ${normalizedIntent} is not valid for ${originTypeForValidation}.`,
      );
      error.status = 400;
      throw error;
    }

    const requiredScopeType = isSelf ? originTypeForValidation : targetType;
    this._assertScopeForFollowUp(
      followUpIntent.scope,
      requiredScopeType,
      isSelf ? originIdForValidation : null,
    );
    return;
  }

  const error = new Error(
    `Unsupported follow-up intent type: ${normalizedIntent}`,
  );
  error.status = 400;
  throw error;
}


function _assertScopeForFollowUp(scope, requiredType, expectedId = null) {
  if (!scope || typeof scope !== "object") {
    const error = new Error("Follow-up intent is missing scope.");
    error.status = 400;
    throw error;
  }

  const requiredKey = this._scopeKeyForType(requiredType);
  if (requiredKey && !scope[requiredKey]) {
    const error = new Error(
      `Follow-up intent requires ${requiredKey} scope.`,
    );
    error.status = 400;
    throw error;
  }

  if (
    requiredKey &&
    expectedId !== null &&
    scope[requiredKey] &&
    String(scope[requiredKey]) !== String(expectedId)
  ) {
    const error = new Error(
      `Follow-up scope mismatch for ${requiredKey}.`,
    );
    error.status = 400;
    throw error;
  }
}


function _normalizeFollowUpEntityType(value) {
  if (!value) return null;
  const normalized = String(value).toLowerCase();
  const map = {
    client: "client",
    dossier: "dossier",
    lawsuit: "lawsuit",
    case: "lawsuit",
    task: "task",
    personal_task: "personal_task",
    personaltask: "personal_task",
    session: "session",
    mission: "mission",
    financial_entry: "financial_entry",
    financialentry: "financial_entry",
  };
  const upperMap = {
    CLIENT: "client",
    DOSSIER: "dossier",
    LAWSUIT: "lawsuit",
    TASK: "task",
    PERSONAL_TASK: "personal_task",
    SESSION: "session",
    MISSION: "mission",
    FINANCIAL_ENTRY: "financial_entry",
  };

  if (upperMap[value]) return upperMap[value];
  return map[normalized] || normalized;
}


function _scopeKeyForType(entityType) {
  const map = {
    client: "clientId",
    dossier: "dossierId",
    lawsuit: "lawsuitId",
    task: "taskId",
    personal_task: "personalTaskId",
    session: "sessionId",
    mission: "missionId",
    financial_entry: "financialEntryId",
  };
  return map[entityType] || null;
}


function _getScopeIdForType(scope, entityType) {
  const key = this._scopeKeyForType(entityType);
  if (!key) return null;
  return scope?.[key] || null;
}


function _resolveScopeTypeForFollowUp(scope, originType, intent) {
  if (!scope || typeof scope !== "object") return originType || "global";

  const scopeMap = {
    clientId: "client",
    dossierId: "dossier",
    lawsuitId: "lawsuit",
    sessionId: "session",
    taskId: "task",
    missionId: "mission",
    personalTaskId: "personal_task",
    financialEntryId: "financial_entry",
  };

  for (const [key, value] of Object.entries(scopeMap)) {
    if (scope[key]) return value;
  }

  return originType || "global";
}


function _intentRequiresEntityHint(intent) {
  return (
    intent.startsWith("READ_") ||
    intent.startsWith("EXPLAIN_") ||
    intent.startsWith("SUMMARIZE_")
  );
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

async function _handleFollowUp(
  followUpDetection,
  message,
  context,
  policy,
  engineContext,
) {
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
        engineContext,
      );

    case FOLLOW_UP_TYPES.NEXT_ACTION:
      return this._handleNextAction(
        convContext,
        message,
        context,
        policy,
        engineContext,
      );

    case FOLLOW_UP_TYPES.REPEAT_ACTION:
      return this._handleRepeatAction(
        convContext,
        message,
        context,
        policy,
        engineContext,
      );

    case FOLLOW_UP_TYPES.CLARIFICATION_REQUEST:
      return this._handleClarificationRequest(
        convContext,
        message,
        context,
        policy,
        engineContext,
      );

    case FOLLOW_UP_TYPES.SUBSET_REQUEST:
      // Subset requests with pronouns (e.g., "show them again") - treat as repeat
      return this._handleRepeatAction(
        convContext,
        message,
        context,
        policy,
        engineContext,
      );

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

async function _handleFilterModification(
  convContext,
  modifier,
  filterWord,
  message,
  context,
  policy,
  engineContext,
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
      {
        type: "FILTER_WITHOUT_LIST",
        entityType: lastEntityType || null,
      },
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
      {
        type: "UNKNOWN_FILTER_TARGET",
        entityType: lastEntityType || null,
      },
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
    engineContext,
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

async function _handleNextAction(
  convContext,
  message,
  context,
  policy,
  engineContext,
) {
  const { lastEntityType, lastActionType, lastResultSummary, lastQuery } =
    convContext;
  const { count, emptyResult } = lastResultSummary || {};

  // Empty result → suggest next steps
    if (emptyResult || count === 0) {
      return this._generateClarification(
        {
          type: "EMPTY_RESULT",
          entityType: lastEntityType || null,
          resultCount: 0,
        },
        context,
        policy,
      );
    }

    // Has results → suggest actions based on entity type
    return this._generateClarification(
      {
        type: "RESULTS_AVAILABLE",
        entityType: lastEntityType || null,
        resultCount: count,
      },
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

async function _handleRepeatAction(
  convContext,
  message,
  context,
  policy,
  engineContext,
) {
  const { lastEntityType, lastIntent, lastResultSummary, lastQuery } =
    convContext;

  // Validate we have something to repeat
    if (!lastIntent || !lastEntityType) {
      return this._generateClarification(
        {
          type: "REPEAT_WITHOUT_CONTEXT",
        },
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
        {
          type: "REPEAT_UNSUPPORTED",
          entityType: lastEntityType || null,
        },
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
    engineContext,
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

async function _handleClarificationRequest(
  convContext,
  message,
  context,
  policy,
  engineContext,
) {
  const { lastEntityType, lastQuery, lastResultSummary } = convContext;

  return this._generateClarification(
    {
      type: "CLARIFICATION_REQUEST",
      entityType: lastEntityType || null,
      resultCount: lastResultSummary?.count || 0,
      lastQuery,
    },
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

function _generateNoContextClarification(followUpDetection, context, policy) {
  const { type } = followUpDetection;
  let reasonType = "MISSING_CONTEXT";

  if (type === FOLLOW_UP_TYPES.FILTER_MODIFICATION) {
    reasonType = "FILTER_WITHOUT_CONTEXT";
  } else if (type === FOLLOW_UP_TYPES.NEXT_ACTION) {
    reasonType = "NEXT_ACTION_WITHOUT_CONTEXT";
  } else if (
    type === FOLLOW_UP_TYPES.REPEAT_ACTION ||
    type === FOLLOW_UP_TYPES.SUBSET_REQUEST
  ) {
    reasonType = "REPEAT_WITHOUT_CONTEXT";
  } else if (type === FOLLOW_UP_TYPES.CONFIRMATION) {
    reasonType = "NO_PENDING_ACTION";
  } else if (type === FOLLOW_UP_TYPES.NEGATION) {
    reasonType = "CONTEXT_CLEARED";
  }

  this.ledger.record({
    type: "follow_up_no_context",
    followUpType: type,
    timestamp: new Date().toISOString(),
  });

  return this._generateClarification(
    {
      type: reasonType,
    },
    context,
    policy,
  );
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

function _generateClarification(reason, context, policy, options = []) {
  const signal = {
    type: "CLARIFICATION_REQUIRED",
    reason: reason?.type || "UNKNOWN",
    entityType: reason?.entityType,
    resultCount: reason?.resultCount,
  };

  return {
    intent: "FOLLOW_UP_CLARIFICATION",
    agentVersion: policy.version,
    reasoner: "follow-up-gate",
    output: {
      type: "clarification",
      reason,
      signals: [signal],
      options,
      timestamp: new Date().toISOString(),
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

function _generateContextualResponse(convContext, type, context, policy) {
  const { lastEntityType, lastResultSummary } = convContext;

  if (type === FOLLOW_UP_TYPES.CONFIRMATION) {
    return this._generateClarification(
      {
        type: "NO_PENDING_ACTION",
        entityType: lastEntityType || null,
        resultCount: lastResultSummary?.count || 0,
      },
      context,
      policy,
    );
  }

  // Negation
  this.contextStore.clear(context);
  return this._generateClarification(
    {
      type: "CONTEXT_CLEARED",
    },
    context,
    policy,
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

module.exports = {
  _executeFollowUpIntent,
  _validateFollowUpIntent,
  _assertScopeForFollowUp,
  _normalizeFollowUpEntityType,
  _scopeKeyForType,
  _getScopeIdForType,
  _resolveScopeTypeForFollowUp,
  _intentRequiresEntityHint,
  _handleFollowUp,
  _handleFilterModification,
  _handleNextAction,
  _handleRepeatAction,
  _handleClarificationRequest,
  _generateNoContextClarification,
  _generateClarification,
  _generateContextualResponse,
};
