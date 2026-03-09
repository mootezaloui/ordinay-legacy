'use strict';

/**
 * Conversation Context Store
 *
 * ARCHITECTURE CHANGE (2026-02):
 * - Separated Operational Context (no TTL, persistent) from Transcript (length-based compaction)
 * - Lawyers work on matters for months/years - agent must NOT forget operational context due to time
 * - Two distinct concepts:
 *   1) Operational Work Context: activeEntity, workMode, posture, pendingSelection (NO TTL)
 *   2) Transcript Context: message history, bounded by length, compacted for LLM injection
 *
 * OPERATIONAL CONTEXT (managed by OperationalContextStore):
 * - activeEntity {type, id}: Currently focused entity
 * - workMode {type, id}: Work mode (e.g., dossier focus)
 * - posture: Interaction mode (WORK, ASSISTANT, INSPECTION)
 * - pendingSelection: Unresolved multi-result state
 * - lastSnapshot: {scope, timestamp, hash} for snapshot validation
 * - NO TIME-BASED EXPIRATION - only cleared by explicit reset or user actions
 *
 * TRANSCRIPT CONTEXT (managed by TranscriptStore):
 * - Full conversation transcript for audit
 * - Length-based compaction when exceeds budget
 * - Compaction creates: narrativeSummary + structuredSummary + evidenceRefs
 * - LLM injection: recent turns + compaction summary + operational context
 *
 * LEGACY COMPATIBILITY:
 * - This class now wraps both stores for backward compatibility
 * - Old TTL-based fields (lastIntent, lastEntityIds, etc.) kept for transition
 * - New code should use operational context directly
 */

const OperationalContextStore = require('./operational.context');
const TranscriptStore = require('./transcript.store');

const CONTEXT_TTL_MS = 5 * 60 * 1000; // DEPRECATED: Only for legacy fields

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
  DRAFT_INTENT: 'draft_intent',
  NLP: 'nlp',
  FOLLOW_UP: 'follow_up',
});

function _toCompactJson(value) {
  if (!value || typeof value !== 'object') return '';
  try {
    return JSON.stringify(value);
  } catch (_) {
    return '';
  }
}

function _buildEntityContextLines(historyContext = {}) {
  const lines = [];
  const activeScope = historyContext?.conversationScope?.activeScope || null;
  const activeEntity = historyContext?.activeEntity || null;
  const scopeCandidates = [activeScope, activeEntity].filter(Boolean);
  const seen = new Set();
  for (const entry of scopeCandidates) {
    const entityType = String(entry?.entityType || entry?.type || '').trim();
    const entityId = entry?.entityId ?? entry?.id ?? null;
    if (!entityType || !entityId) continue;
    const key = `${entityType}:${entityId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const label = `${entityType.charAt(0).toUpperCase()}${entityType.slice(1)}`;
    const confidence =
      entry?.confidence !== undefined && entry?.confidence !== null
        ? `, confidence ${entry.confidence}`
        : '';
    lines.push(`${label}: ${entityId}${confidence}`);
  }
  const evidenceEntities = Array.isArray(historyContext?.evidenceRefs?.entities)
    ? historyContext.evidenceRefs.entities.slice(0, 3)
    : [];
  for (const ref of evidenceEntities) {
    const entityType = String(ref?.type || '').trim();
    const entityId = ref?.id ?? null;
    if (!entityType || !entityId) continue;
    const key = `${entityType}:${entityId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const label = `${entityType.charAt(0).toUpperCase()}${entityType.slice(1)}`;
    lines.push(`${label}: ${entityId}`);
  }
  return lines;
}

function buildScopeBlock(historyContext = {}) {
  if (!historyContext || typeof historyContext !== 'object') return '';
  const lines = ['--- ACTIVE CONTEXT ---'];
  const entityLines = _buildEntityContextLines(historyContext);
  if (entityLines.length > 0) {
    lines.push(...entityLines);
  }
  if (historyContext.compactionSummary) {
    lines.push(`Summary: ${String(historyContext.compactionSummary).slice(0, 240)}`);
  }
  const structured = historyContext.structuredSummary;
  if (structured && typeof structured === 'object') {
    const recentParts = [];
    if (Array.isArray(structured.intents) && structured.intents.length > 0) {
      recentParts.push(`intents ${structured.intents.slice(0, 4).join(', ')}`);
    }
    if (Array.isArray(structured.artifacts) && structured.artifacts.length > 0) {
      recentParts.push(
        `artifacts ${structured.artifacts
          .slice(0, 3)
          .map((artifact) => String(artifact?.type || 'unknown'))
          .join(', ')}`,
      );
    }
    if (recentParts.length > 0) {
      lines.push(`Recent: ${recentParts.join(' | ')}`);
    }
  }
  if (entityLines.length === 0 && !historyContext.compactionSummary && !structured) {
    const fallback = _toCompactJson({
      activeEntity: historyContext.activeEntity || null,
      conversationScope: historyContext.conversationScope || null,
    });
    if (fallback) lines.push(`Summary: ${fallback.slice(0, 240)}`);
  }
  lines.push('----------------------');
  return lines.join('\n');
}

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

    // New architecture: Separate operational and transcript stores
    this._operationalStore = new OperationalContextStore();
    this._transcriptStore = new TranscriptStore();
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
   * DEPRECATED: TTL-based validation removed.
   * Context is now session-bound and persists until explicit clear.
   *
   * @param {Object} context - Stored context object
   * @returns {boolean} Always returns true (no TTL check)
   */
  _isValid(context) {
    return Boolean(context && context.updatedAt);
  }

  /**
   * Get the current conversation context
   *
   * @param {Object} requestContext - Request context
   * @returns {Object|null} Context object or null if no valid context
   */
  get(requestContext) {
    const conversationId = this._getConversationId(requestContext);
    const userId = requestContext?.userId || 'default';

    // NEW: Try operational store first (NO TTL CHECK)
    const operational = this._operationalStore.get(userId, conversationId);
    if (operational) {
      // Need to get lastOutput from legacy map since operational store doesn't have it yet
      const legacy = this._contexts.get(conversationId);
      // Convert operational context to legacy format for backward compatibility
      return {
        conversationId,
        activeEntityType: operational.activeEntity?.type || null,
        activeEntityId: operational.activeEntity?.id || null,
        activeEntitySource: operational.activeEntity?.source || null,
        workSnapshot: operational.lastSnapshot,
        pendingSelection: operational.pendingSelection,
        pendingOperation: operational.pendingOperation || null,
        lastPosture: operational.posture,
        lastIntent: operational.lastIntent,
        lastEntityType: operational.lastEntityType,
        lastEntityIds: operational.lastEntityIds || [],
        lastActionType: operational.lastActionType || null,
        lastResultSummary: operational.lastResultSummary || { count: 0, emptyResult: false, filters: {} },
        lastQuery: operational.lastQuery || '',
        source: operational.source || 'nlp',
        updatedAt: operational.updatedAt,
        lastOutput: legacy?.lastOutput || null, // For pending resolution detection
      };
    }

    // LEGACY: Fall back to old map-based storage (NO TTL validation)
    const context = this._contexts.get(conversationId);
    if (!context) return null;

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
    const nextPendingOperation =
      actionResult.pendingOperation !== undefined
        ? actionResult.pendingOperation
        : previous?.pendingOperation ?? null;
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
      pendingOperation: nextPendingOperation,
      workSnapshot: nextWorkSnapshot,
      lastQuery: actionResult.query || '',
      source: actionResult.source || CONTEXT_SOURCES.NLP,
      lastPosture: posture ? posture.mode : (previous?.lastPosture || null),
      lastOutput: actionResult.lastOutput || null, // For pending resolution detection
      updatedAt: new Date().toISOString(),
    });

    // NEW: Update operational store (NO TTL)
    const userId = requestContext?.userId || 'default';
    this._operationalStore.update(userId, conversationId, {
      activeEntity: nextActiveEntityType && nextActiveEntityId
        ? { type: nextActiveEntityType, id: nextActiveEntityId, source: nextActiveEntitySource }
        : null,
      workMode: null, // TODO: Extract from actionResult if available
      posture: posture ? posture.mode : null,
      pendingSelection: nextPendingSelection,
      pendingOperation: nextPendingOperation,
      lastSnapshot: nextWorkSnapshot,
      lastIntent: actionResult.intent,
      lastEntityType: actionResult.entityType || null,
      lastEntityIds: Array.isArray(actionResult.entityIds) ? [...actionResult.entityIds] : [],
      lastActionType: actionResult.actionType || ACTION_TYPES.LIST,
      lastResultSummary: {
        count: actionResult.resultSummary?.count ?? 0,
        emptyResult: actionResult.resultSummary?.emptyResult ?? false,
        filters: actionResult.resultSummary?.filters ? { ...actionResult.resultSummary.filters } : {},
      },
      lastQuery: actionResult.query || '',
      source: actionResult.source || CONTEXT_SOURCES.NLP,
    });

    // NEW: Update or add transcript turn
    // Use updateOrAddTurn to update existing turn (added at start of /agent/stream)
    // or create new one if doesn't exist (e.g., for non-streaming endpoints)
    this._transcriptStore.updateOrAddTurn(conversationId, userId, {
      userMessage: actionResult.query || '',
      agentIntent: actionResult.intent,
      agentOutput: actionResult.output || null,
      artifactType: actionResult.output?.type || null,
      artifactId: actionResult.output?.entityId || null,
      entityRefs: Array.isArray(actionResult.entityIds)
        ? actionResult.entityIds.map(id => ({ type: actionResult.entityType, id }))
        : [],
      documentRefs: [],
      executionRefs: [],
    });

    // LEGACY: Keep map-based storage for backward compatibility
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
    const userId = requestContext?.userId || 'default';
    const hadContext = this._contexts.has(conversationId);

    // NEW: Clear both stores
    this._operationalStore.clear(userId, conversationId);
    this._transcriptStore.clear(conversationId);

    // LEGACY: Clear map-based storage
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
   * DEPRECATED: TTL-based cleanup removed.
   * Context is now session-bound and persists until explicit clear.
   * This method is kept for backward compatibility but does nothing.
   */
  cleanup() {
    // No-op: contexts persist until explicit clear
  }

  consumeLifecycleEvent(requestContext) {
    const conversationId = this._getConversationId(requestContext);
    const event = this._lifecycleEvents.get(conversationId) || null;
    if (!event) return null;
    this._lifecycleEvents.delete(conversationId);
    return { ...event };
  }

  /**
   * Get context for LLM injection
   * Returns: recent turns + compaction summary + operational context
   * This is used to inject conversation history into LLM prompts
   *
   * @param {Object} requestContext - Request context
   * @returns {Object} Context for LLM injection
   */
  getContextForLLMInjection(requestContext) {
    const conversationId = this._getConversationId(requestContext);
    const userId = requestContext?.userId || 'default';

    // Get transcript context (recent turns + compaction)
    const transcriptContext = this._transcriptStore.getContextForInjection(conversationId);

    // Get operational context (persistent work state)
    const operational = this._operationalStore.get(userId, conversationId);

    return {
      // Transcript data
      recentTurns: transcriptContext.recentTurns,
      compactionSummary: transcriptContext.compactionSummary,
      structuredSummary: transcriptContext.structuredSummary,
      evidenceRefs: transcriptContext.evidenceRefs,
      hasCompaction: transcriptContext.hasCompaction,

      // Operational context (persistent work state)
      activeEntity: operational?.activeEntity || null,
      conversationScope: operational?.conversationScope || null,
      workMode: operational?.workMode || null,
      posture: operational?.posture || null,
      pendingSelection: operational?.pendingSelection || null,
      pendingOperation: operational?.pendingOperation || null,
      lastSnapshot: operational?.lastSnapshot || null,

      // Legacy fields for backward compatibility
      lastIntent: operational?.lastIntent || null,
      lastEntityType: operational?.lastEntityType || null,
      lastQuery: operational?.lastQuery || '',
    };
  }
}

module.exports = ConversationContextStore;
module.exports.ACTION_TYPES = ACTION_TYPES;
module.exports.CONTEXT_SOURCES = CONTEXT_SOURCES;
module.exports.CONTEXT_TTL_MS = CONTEXT_TTL_MS;
module.exports.buildScopeBlock = buildScopeBlock;
