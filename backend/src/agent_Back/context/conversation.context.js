'use strict';

/**
 * Conversation Context Store
 *
 * Engine-owned conversational context for follow-up intent handling.
 * This is NOT LLM memory. This is deterministic state tracking.
 *
 * DESIGN DECISIONS:
 *
 * 1. CONTEXT OBJECT SCHEMA
 *    Fields stored per conversation:
 *    - conversationId: Unique identifier for the conversation session
 *    - lastIntent: The last detected intent (e.g., 'LIST_CLIENTS', 'COMMAND')
 *    - lastEntityType: Entity type from last query ('client', 'dossier', 'task', 'session')
 *    - lastEntityIds: Array of entity IDs from last query result (for filtering)
 *    - lastActionType: Type of action ('list', 'get', 'filter', 'explain')
 *    - lastResultSummary: { count, emptyResult, filters }
 *    - activeEntityType: Promoted entity type used for deterministic follow-ups
 *    - activeEntityId: Promoted entity ID used for deterministic follow-ups
 *    - activeEntitySource: Origin of active entity ('user' | 'follow-up' | 'selection')
 *    - pendingSelection: { entityType, count } when multiple results require user choice
 *    - lastQuery: Original user query (for clarification reference)
 *    - source: How the context was created ('slash_command', 'read_intent', 'nlp')
 *    - updatedAt: ISO timestamp
 *
 *    WHY THESE FIELDS:
 *    - lastIntent + lastEntityType: Required to resolve "what about X?" follow-ups
 *    - lastEntityIds: Required to filter subsets ("show inactive ones")
 *    - lastResultSummary: Required to give grounded clarifications on empty results
 *    - lastQuery: Required to reference prior action in clarifications
 *    - source: Required to maintain consistency between slash/NLP paths
 *
 *    INTENTIONALLY EXCLUDED:
 *    - Full chat history: Too complex, not needed for v1 follow-ups
 *    - LLM response content: Not deterministic, not needed
 *    - User preferences: Separate concern, not conversation context
 *
 * 2. VALIDITY RULES
 *    - Time-based: 5 minutes expiration
 *    - WHY 5 MINUTES:
 *      - Long enough for multi-turn professional workflows
 *      - Short enough to prevent stale context confusion
 *      - Matches typical legal professional interaction patterns
 *      - Safe default that can be adjusted based on user feedback
 *
 * 3. RESET RULES (what invalidates context)
 *    - Slash commands: Reset context to new command's domain
 *    - Entity type switch: "list my tasks" after "list my clients" = reset
 *    - Time expiration: Context older than 5 minutes = invalid
 *    - Explicit new query with entity mentions: Starts fresh context
 *    - Screen navigation (scope change): Different contextScope = reset
 *
 *    WHY THESE RULES:
 *    - Deterministic and predictable
 *    - Prevents stale follow-ups
 *    - Matches user mental model of conversation boundaries
 */

const CONTEXT_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Valid action types for context tracking
 */
const ACTION_TYPES = Object.freeze({
  LIST: 'list',
  GET: 'get',
  FILTER: 'filter',
  EXPLAIN: 'explain',
  DRAFT: 'draft',
});

/**
 * Context sources
 */
const CONTEXT_SOURCES = Object.freeze({
  SLASH_COMMAND: 'slash_command',
  READ_INTENT: 'read_intent',
  NLP: 'nlp',
  FOLLOW_UP: 'follow_up',
});

function cloneWorkSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  try {
    return JSON.parse(JSON.stringify(snapshot));
  } catch (err) {
    return null;
  }
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  Object.values(value).forEach((item) => freezeDeep(item));
  return Object.freeze(value);
}

class ConversationContextStore {
  constructor(options = {}) {
    this._contexts = new Map();
    this._lifecycleEvents = new Map();
    this._ttlMs = options.ttlMs || CONTEXT_TTL_MS;
  }

  /**
   * Generate a conversation ID from user context
   * In v1, we use a simple approach: one context per user
   * Can be extended to per-screen or per-session contexts later
   *
   * @param {Object} requestContext - Request context with userId, scope, etc.
   * @returns {string} Conversation ID
   */
  _getConversationId(requestContext) {
    const explicitConversationId =
      requestContext?.conversationId ?? requestContext?.agentSessionId ?? null;
    if (
      explicitConversationId !== null &&
      explicitConversationId !== undefined &&
      String(explicitConversationId).trim().length > 0
    ) {
      return String(explicitConversationId).trim();
    }

    const userId = requestContext?.userId || 'default';
    const scope = requestContext?.scope || 'GLOBAL';
    // Include scope in conversation ID so different screens have different contexts
    return `conv:${userId}:${scope}`;
  }

  _recordLifecycleEvent(conversationId, event) {
    if (!conversationId || !event || typeof event !== 'object') return;
    this._lifecycleEvents.set(conversationId, Object.freeze({
      conversationId,
      ...event,
      at: event.at || new Date().toISOString(),
    }));
  }

  /**
   * Check if context is still valid (not expired)
   *
   * @param {Object} context - Stored context object
   * @returns {boolean} True if context is valid
   */
  _isValid(context) {
    if (!context || !context.updatedAt) return false;
    const age = Date.now() - new Date(context.updatedAt).getTime();
    return age < this._ttlMs;
  }

  /**
   * Get the current conversation context
   *
   * @param {Object} requestContext - Request context
   * @returns {Object|null} Context object or null if no valid context
   */
  get(requestContext) {
    const conversationId = this._getConversationId(requestContext);
    const context = this._contexts.get(conversationId);

    if (!context) return null;
    if (!this._isValid(context)) {
      this._contexts.delete(conversationId);
      this._recordLifecycleEvent(conversationId, {
        type: 'expired',
        reason: 'ttl_expired',
        previousUpdatedAt: context.updatedAt || null,
        ttlMs: this._ttlMs,
      });
      return null;
    }

    return { ...context };
  }

  _resolveNextWorkSnapshot(previousSnapshot, workSnapshotEvent) {
    const previous = cloneWorkSnapshot(previousSnapshot);
    if (!workSnapshotEvent || typeof workSnapshotEvent !== 'object') {
      return previous ? freezeDeep(previous) : null;
    }

    const action = String(workSnapshotEvent.action || '').toLowerCase();
    const now = new Date().toISOString();

    if (action === 'clear') {
      return null;
    }

    if (action === 'stale') {
      if (!previous) return null;
      const staleSnapshot = {
        ...previous,
        meta: {
          ...(previous.meta || {}),
          stale: true,
          staleReason: workSnapshotEvent.reason || 'mutation',
          staleAt: now,
        },
      };
      return freezeDeep(staleSnapshot);
    }

    if ((action === 'set' || action === 'refresh' || action === 'upsert') &&
      workSnapshotEvent.snapshot &&
      typeof workSnapshotEvent.snapshot === 'object') {
      const next = cloneWorkSnapshot(workSnapshotEvent.snapshot);
      if (!next) return previous ? freezeDeep(previous) : null;
      const inferredEntityId =
        next.entityId ??
        next.parent?.id ??
        next.scope?.dossierId ??
        null;
      const inferredEntityType = next.entityType || 'dossier';
      const normalized = {
        ...next,
        entityType: inferredEntityType,
        entityId: inferredEntityId,
        snapshotAt: next.snapshotAt || now,
        scope:
          next.scope && typeof next.scope === 'object'
            ? next.scope
            : {
                scopeType: inferredEntityType,
                dossierId: inferredEntityId,
              },
        meta: {
          ...(next.meta || {}),
          stale: false,
          refreshReason: workSnapshotEvent.reason || next.meta?.refreshReason || null,
          refreshedAt: now,
        },
      };
      return freezeDeep(normalized);
    }

    return previous ? freezeDeep(previous) : null;
  }

  /**
   * Update conversation context after a successful agent action
   *
   * @param {Object} requestContext - Request context (userId, scope, etc.)
   * @param {Object} actionResult - Result from agent action
   * @param {string} actionResult.intent - Detected intent
   * @param {string} actionResult.entityType - Entity type ('client', 'dossier', etc.)
   * @param {number[]} [actionResult.entityIds] - Entity IDs from result
   * @param {string} actionResult.actionType - Action type ('list', 'get', etc.)
   * @param {Object} actionResult.resultSummary - Result summary
   * @param {Object} [actionResult.activeEntity] - Promoted active entity metadata
   * @param {string} [actionResult.activeEntity.type] - Active entity type
   * @param {number|string} [actionResult.activeEntity.id] - Active entity id
   * @param {string} [actionResult.activeEntity.source] - Active entity source
   * @param {Object|null} [actionResult.pendingSelection] - Pending selection info
   * @param {string} actionResult.query - Original user query
   * @param {string} actionResult.source - Context source
   * @returns {Object} Updated context
   */
  update(requestContext, actionResult, posture) {
    const conversationId = this._getConversationId(requestContext);
    const previous = this._contexts.get(conversationId);

    // Posture transitions are observable, but do not implicitly reset context.
    // Context reset must be explicit (clear) or expiration-based.
    if (previous && previous.lastPosture && posture && previous.lastPosture !== posture.mode) {
      this._recordLifecycleEvent(conversationId, {
        type: 'posture_transition',
        reason: 'posture_changed_preserved_context',
        previousPosture: previous.lastPosture,
        nextPosture: posture.mode,
      });
    }

    const nextActiveEntityType =
      actionResult.activeEntity?.type ?? previous?.activeEntityType ?? null;
    const nextActiveEntityId =
      actionResult.activeEntity?.id ?? previous?.activeEntityId ?? null;
    const nextActiveEntitySource =
      actionResult.activeEntity?.source ?? previous?.activeEntitySource ?? null;
    const nextPendingSelection =
      actionResult.pendingSelection !== undefined
        ? actionResult.pendingSelection
        : previous?.pendingSelection ?? null;
    const nextWorkSnapshot = this._resolveNextWorkSnapshot(
      previous?.workSnapshot || null,
      actionResult.workSnapshotEvent,
    );

    const context = Object.freeze({
      conversationId,
      lastIntent: actionResult.intent,
      lastEntityType: actionResult.entityType || null,
      lastEntityIds: Array.isArray(actionResult.entityIds) ? [...actionResult.entityIds] : [],
      lastActionType: actionResult.actionType || ACTION_TYPES.LIST,
      lastResultSummary: Object.freeze({
        count: actionResult.resultSummary?.count ?? 0,
        emptyResult: actionResult.resultSummary?.emptyResult ?? false,
        filters: actionResult.resultSummary?.filters ? { ...actionResult.resultSummary.filters } : {},
      }),
      activeEntityType: nextActiveEntityType,
      activeEntityId: nextActiveEntityId,
      activeEntitySource: nextActiveEntitySource,
      pendingSelection: nextPendingSelection,
      workSnapshot: nextWorkSnapshot,
      lastQuery: actionResult.query || '',
      source: actionResult.source || CONTEXT_SOURCES.NLP,
      lastPosture: posture ? posture.mode : (previous?.lastPosture || null),
      updatedAt: new Date().toISOString(),
    });

    this._contexts.set(conversationId, context);
    return context;
  }

  markWorkSnapshotStale(requestContext, reason = 'mutation') {
    const conversationId = this._getConversationId(requestContext);
    const previous = this._contexts.get(conversationId);
    if (!previous || !previous.workSnapshot) return null;

    const nextWorkSnapshot = this._resolveNextWorkSnapshot(previous.workSnapshot, {
      action: 'stale',
      reason,
    });

    const updated = Object.freeze({
      ...previous,
      workSnapshot: nextWorkSnapshot,
      updatedAt: new Date().toISOString(),
    });
    this._contexts.set(conversationId, updated);
    return updated;
  }

  markWorkSnapshotsStaleByDossierId(dossierId, reason = 'mutation') {
    const normalizedId = Number(dossierId);
    for (const [conversationId, context] of this._contexts.entries()) {
      const snapshot = context?.workSnapshot;
      if (!snapshot || snapshot.entityType !== 'dossier') continue;
      const snapshotId = Number(snapshot.entityId ?? snapshot.scope?.dossierId ?? 0);
      if (normalizedId && snapshotId !== normalizedId) continue;
      const nextWorkSnapshot = this._resolveNextWorkSnapshot(snapshot, {
        action: 'stale',
        reason,
      });
      const updated = Object.freeze({
        ...context,
        workSnapshot: nextWorkSnapshot,
        updatedAt: new Date().toISOString(),
      });
      this._contexts.set(conversationId, updated);
    }
  }

  /**
   * Clear conversation context (explicit reset)
   *
   * @param {Object} requestContext - Request context
   */
  clear(requestContext) {
    const conversationId = this._getConversationId(requestContext);
    const hadContext = this._contexts.has(conversationId);
    this._contexts.delete(conversationId);
    if (hadContext) {
      this._recordLifecycleEvent(conversationId, {
        type: 'cleared',
        reason: 'explicit_clear',
      });
    }
  }

  /**
   * Check if context should be reset based on new message
   * Returns true if the new message indicates a context switch
   *
   * @param {Object} currentContext - Current stored context
   * @param {Object} newAction - New action being processed
   * @param {string} newAction.entityType - Entity type of new action
   * @param {boolean} newAction.hasExplicitEntity - Whether new query has explicit entity mention
   * @returns {boolean} True if context should be reset
   */
  shouldReset(currentContext, newAction) {
    if (!currentContext) return false;

    // Rule: Entity type switch resets context
    if (newAction.entityType && currentContext.lastEntityType &&
        newAction.entityType !== currentContext.lastEntityType) {
      return true;
    }

    // Rule: Explicit entity mention in new query resets context
    if (newAction.hasExplicitEntity) {
      return true;
    }

    return false;
  }

  /**
   * Get context for clarification message generation
   * Returns a safe subset of context for use in responses
   *
   * @param {Object} requestContext - Request context
   * @returns {Object|null} Safe context for clarification
   */
  getForClarification(requestContext) {
    const context = this.get(requestContext);
    if (!context) return null;

    return {
      entityType: context.lastEntityType,
      actionType: context.lastActionType,
      resultCount: context.lastResultSummary?.count ?? 0,
      wasEmpty: context.lastResultSummary?.emptyResult ?? false,
      lastQuery: context.lastQuery,
      filters: context.lastResultSummary?.filters || {},
    };
  }

  /**
   * Clean up expired contexts (housekeeping)
   * Call periodically to prevent memory leaks
   */
  cleanup() {
    const now = Date.now();
    for (const [id, context] of this._contexts.entries()) {
      if (!this._isValid(context)) {
        this._contexts.delete(id);
        this._recordLifecycleEvent(id, {
          type: 'expired',
          reason: 'ttl_cleanup',
          previousUpdatedAt: context.updatedAt || null,
          ttlMs: this._ttlMs,
        });
      }
    }
  }

  consumeLifecycleEvent(requestContext) {
    const conversationId = this._getConversationId(requestContext);
    const event = this._lifecycleEvents.get(conversationId) || null;
    if (!event) return null;
    this._lifecycleEvents.delete(conversationId);
    return { ...event };
  }
}

module.exports = ConversationContextStore;
module.exports.ACTION_TYPES = ACTION_TYPES;
module.exports.CONTEXT_SOURCES = CONTEXT_SOURCES;
module.exports.CONTEXT_TTL_MS = CONTEXT_TTL_MS;
