'use strict';

/**
 * Agent Request Contract
 *
 * CRITICAL: This contract defines what the UI can send to the Agent.
 *
 * The UI is a CONSUMER, not a CONTROLLER.
 * The UI cannot:
 * - Send raw tool instructions
 * - Request execution directly
 * - Override agent version
 * - Bypass intent classification
 *
 * All UI requests MUST pass through this validation boundary.
 */

const { INTENTS } = require('../intents');

/**
 * Context Scope (ENUM)
 *
 * Defines the scope of the agent request.
 * Determines which entities are relevant for the request.
 */
const CONTEXT_SCOPE = Object.freeze({
  /**
   * GLOBAL
   * No specific entity context (e.g., general query, system status)
   */
  GLOBAL: 'GLOBAL',

  /**
   * CLIENT
   * Request scoped to a specific client
   */
  CLIENT: 'CLIENT',

  /**
   * DOSSIER
   * Request scoped to a specific dossier
   */
  DOSSIER: 'DOSSIER',

  /**
   * LAWSUIT
   * Request scoped to a specific lawsuit
   */
  LAWSUIT: 'LAWSUIT',

  /**
   * SESSION
   * Request scoped to a specific session
   */
  SESSION: 'SESSION',

  /**
   * TASK
   * Request scoped to a specific task
   */
  TASK: 'TASK',
});

/**
 * Validate context scope
 * @param {string} scope - Context scope
 * @throws {Error} If scope is invalid
 */
function validateContextScope(scope) {
  const validScopes = Object.values(CONTEXT_SCOPE);
  if (!validScopes.includes(scope)) {
    throw new Error(
      `Invalid context scope: "${scope}". Must be one of: ${validScopes.join(', ')}`
    );
  }
}

/**
 * Validate intent
 * @param {string} intent - Intent from intent taxonomy
 * @throws {Error} If intent is invalid
 */
function validateIntent(intent) {
  const validIntents = Object.values(INTENTS);
  if (!validIntents.includes(intent)) {
    throw new Error(
      `Invalid intent: "${intent}". Must be one of: ${validIntents.join(', ')}`
    );
  }
}

/**
 * Validate context references
 * @param {Object} contextRefs - Context references
 * @param {string} contextScope - Context scope
 * @throws {Error} If context refs are invalid for scope
 */
function validateContextRefs(contextRefs, contextScope) {
  if (!contextRefs || typeof contextRefs !== 'object') {
    throw new Error('contextRefs must be an object');
  }

  // Validate required refs based on scope
  switch (contextScope) {
    case CONTEXT_SCOPE.CLIENT:
      if (!contextRefs.clientId || typeof contextRefs.clientId !== 'number') {
        throw new Error('CLIENT scope requires contextRefs.clientId (number)');
      }
      break;

    case CONTEXT_SCOPE.DOSSIER:
      if (!contextRefs.dossierId || typeof contextRefs.dossierId !== 'number') {
        throw new Error('DOSSIER scope requires contextRefs.dossierId (number)');
      }
      break;

    case CONTEXT_SCOPE.LAWSUIT:
      if (!contextRefs.lawsuitId || typeof contextRefs.lawsuitId !== 'number') {
        throw new Error('LAWSUIT scope requires contextRefs.lawsuitId (number)');
      }
      break;

    case CONTEXT_SCOPE.SESSION:
      if (!contextRefs.sessionId || typeof contextRefs.sessionId !== 'number') {
        throw new Error('SESSION scope requires contextRefs.sessionId (number)');
      }
      break;

    case CONTEXT_SCOPE.TASK:
      if (!contextRefs.taskId || typeof contextRefs.taskId !== 'number') {
        throw new Error('TASK scope requires contextRefs.taskId (number)');
      }
      break;

    case CONTEXT_SCOPE.GLOBAL:
      // No specific refs required for GLOBAL
      break;

    default:
      throw new Error(`Unknown context scope: ${contextScope}`);
  }
}

/**
 * Validate language code
 * @param {string} language - ISO 639-1 language code
 * @throws {Error} If language code is invalid
 */
function validateLanguage(language) {
  if (!language || typeof language !== 'string') {
    throw new Error('language is required and must be a string');
  }

  // Basic ISO 639-1 format check (2 lowercase letters)
  if (!/^[a-z]{2}$/.test(language)) {
    throw new Error('language must be a 2-letter ISO 639-1 code (e.g., "en", "fr")');
  }
}

/**
 * Generate a unique request ID
 * @param {number} userId - User ID
 * @returns {string} Unique request ID
 */
function generateRequestId(userId) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `req-u${userId}-${timestamp}-${random}`;
}

/**
 * Create an agent request with validation
 *
 * This is the ONLY way the UI can send requests to the Agent.
 *
 * @param {Object} request - Request data
 * @param {number} request.userId - User ID (required)
 * @param {string} request.agentVersion - Agent version (v1 | v2 | v3)
 * @param {string} request.intent - Intent from intent taxonomy
 * @param {string} request.contextScope - Context scope (GLOBAL | CLIENT | DOSSIER | LAWSUIT | SESSION | TASK)
 * @param {Object} request.contextRefs - Context references (validated based on scope)
 * @param {string} request.userMessage - User message (required, non-empty)
 * @param {string} request.language - ISO 639-1 language code (e.g., 'en', 'fr')
 * @param {string} [request.requestId] - Optional request ID (generated if not provided)
 * @returns {Object} Validated agent request
 * @throws {Error} If validation fails
 */
function createAgentRequest({
  userId,
  agentVersion,
  intent,
  contextScope,
  contextRefs,
  userMessage,
  language,
  requestId,
}) {
  // Validate userId
  if (!userId || typeof userId !== 'number' || userId <= 0) {
    throw new Error('userId is required and must be a positive number');
  }

  // Validate agentVersion
  const validVersions = ['v1', 'v2', 'v3'];
  if (!validVersions.includes(agentVersion)) {
    throw new Error(
      `agentVersion must be one of: ${validVersions.join(', ')}`
    );
  }

  // Validate intent
  validateIntent(intent);

  // Validate context scope
  validateContextScope(contextScope);

  // Validate context refs
  validateContextRefs(contextRefs, contextScope);

  // Validate user message
  if (!userMessage || typeof userMessage !== 'string' || userMessage.trim().length === 0) {
    throw new Error('userMessage is required and must be a non-empty string');
  }

  // Validate language
  validateLanguage(language);

  // NO FORBIDDEN FIELDS ALLOWED
  // UI cannot send these fields (they are agent-controlled)
  const forbiddenFields = [
    'execute',           // UI cannot request execution
    'toolName',          // UI cannot specify tools
    'toolParams',        // UI cannot specify tool parameters
    'requestedTools',    // UI cannot request specific tools
    'bypassValidation',  // UI cannot bypass validation
    'overridePolicy',    // UI cannot override policy
    'rawQuery',          // UI cannot send raw queries
    'directExecution',   // UI cannot execute directly
  ];

  forbiddenFields.forEach(field => {
    if (field in arguments[0]) {
      throw new Error(
        `AgentRequest must not contain "${field}". UI cannot send raw tool instructions or override agent authority.`
      );
    }
  });

  // Generate request ID if not provided
  const finalRequestId = requestId || generateRequestId(userId);

  return Object.freeze({
    requestId: finalRequestId,
    userId,
    agentVersion,
    intent,
    contextScope,
    contextRefs: Object.freeze({ ...contextRefs }),
    userMessage: userMessage.trim(),
    language,
    requestedAt: new Date().toISOString(),
  });
}

/**
 * Validate that a request object conforms to the contract
 * @param {Object} request - Request to validate
 * @returns {boolean} true if valid
 * @throws {Error} If validation fails
 */
function validateAgentRequest(request) {
  if (!request || typeof request !== 'object') {
    throw new Error('Request must be an object');
  }

  // Use createAgentRequest to validate (it will throw if invalid)
  createAgentRequest(request);

  return true;
}

/**
 * Extract context for Agent Engine from AgentRequest
 * @param {Object} agentRequest - Validated agent request
 * @returns {Object} Context object for Agent Engine
 */
function extractAgentContext(agentRequest) {
  // Build context object based on scope
  const context = {
    ...agentRequest.contextRefs,
  };

  // Add scope metadata
  context.scope = agentRequest.contextScope;

  // Add any additional context fields based on intent
  // (This can be extended as needed)

  return context;
}

module.exports = {
  CONTEXT_SCOPE,
  validateContextScope,
  validateIntent,
  validateContextRefs,
  validateLanguage,
  generateRequestId,
  createAgentRequest,
  validateAgentRequest,
  extractAgentContext,
};

