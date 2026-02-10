'use strict';

/**
 * Operational Work Context Store
 *
 * CRITICAL DESIGN: NO TTL EXPIRATION
 *
 * Lawyers work on the same matters for months/years.
 * The agent must NOT "forget" operational context due to time.
 *
 * This stores MINIMAL STRUCTURED STATE for deterministic continuity:
 * - activeEntity {type, id}: Currently focused entity
 * - workMode {type, id}: Work mode (e.g., dossier focus)
 * - posture: Interaction mode (WORK, ASSISTANT, INSPECTION)
 * - pendingSelection: Unresolved multi-result state
 * - lastSnapshot: {scope, timestamp, hash} for snapshot validation
 *
 * PERSISTENCE RULES:
 * - NO time-based expiration
 * - Only cleared by explicit reset or user actions
 * - Survives hours/days of inactivity
 * - Follow-ups must work after long gaps
 *
 * SEPARATION OF CONCERNS:
 * - Operational Context (this file): Tiny, structured, persistent
 * - Transcript Context (separate): Text-heavy, bounded by length, compacted
 */

/**
 * Operational context schema
 */
function createOperationalContext({
  sessionId,
  userId,
  activeEntity = null,
  workMode = null,
  posture = null,
  pendingSelection = null,
  lastSnapshot = null,
  lastIntent = null,
  lastEntityType = null,
  createdAt = null,
  updatedAt = null,
}) {
  return Object.freeze({
    sessionId,
    userId,
    activeEntity: activeEntity ? Object.freeze({ ...activeEntity }) : null,
    workMode: workMode ? Object.freeze({ ...workMode }) : null,
    posture: posture || null,
    pendingSelection: pendingSelection ? Object.freeze({ ...pendingSelection }) : null,
    lastSnapshot: lastSnapshot ? Object.freeze({ ...lastSnapshot }) : null,
    lastIntent: lastIntent || null,
    lastEntityType: lastEntityType || null,
    createdAt: createdAt || new Date().toISOString(),
    updatedAt: updatedAt || new Date().toISOString(),
  });
}

class OperationalContextStore {
  constructor() {
    // In-memory storage keyed by (userId, sessionId)
    // In production, this should be persisted to database
    this._contexts = new Map();
  }

  /**
   * Generate context key from userId + sessionId
   * @param {string} userId - User ID
   * @param {string} sessionId - Session ID
   * @returns {string} Context key
   */
  _getKey(userId, sessionId) {
    const normalizedUserId = String(userId || 'default');
    const normalizedSessionId = String(sessionId || 'global');
    return `${normalizedUserId}:${normalizedSessionId}`;
  }

  /**
   * Get operational context (NO TTL CHECK)
   * @param {string} userId - User ID
   * @param {string} sessionId - Session ID
   * @returns {Object|null} Operational context or null
   */
  get(userId, sessionId) {
    const key = this._getKey(userId, sessionId);
    const context = this._contexts.get(key);
    return context ? { ...context } : null;
  }

  /**
   * Update operational context
   * @param {string} userId - User ID
   * @param {string} sessionId - Session ID
   * @param {Object} updates - Fields to update
   * @returns {Object} Updated context
   */
  update(userId, sessionId, updates) {
    const key = this._getKey(userId, sessionId);
    const existing = this._contexts.get(key);

    const updated = createOperationalContext({
      sessionId,
      userId,
      activeEntity: updates.activeEntity !== undefined ? updates.activeEntity : existing?.activeEntity,
      workMode: updates.workMode !== undefined ? updates.workMode : existing?.workMode,
      posture: updates.posture !== undefined ? updates.posture : existing?.posture,
      pendingSelection: updates.pendingSelection !== undefined ? updates.pendingSelection : existing?.pendingSelection,
      lastSnapshot: updates.lastSnapshot !== undefined ? updates.lastSnapshot : existing?.lastSnapshot,
      lastIntent: updates.lastIntent !== undefined ? updates.lastIntent : existing?.lastIntent,
      lastEntityType: updates.lastEntityType !== undefined ? updates.lastEntityType : existing?.lastEntityType,
      createdAt: existing?.createdAt,
      updatedAt: new Date().toISOString(),
    });

    this._contexts.set(key, updated);
    return updated;
  }

  /**
   * Clear operational context (explicit reset only)
   * @param {string} userId - User ID
   * @param {string} sessionId - Session ID
   */
  clear(userId, sessionId) {
    const key = this._getKey(userId, sessionId);
    this._contexts.delete(key);
  }

  /**
   * Mark snapshot as stale
   * @param {string} userId - User ID
   * @param {string} sessionId - Session ID
   * @param {string} reason - Stale reason
   * @returns {Object|null} Updated context
   */
  markSnapshotStale(userId, sessionId, reason = 'mutation') {
    const context = this.get(userId, sessionId);
    if (!context || !context.lastSnapshot) return null;

    const staleSnapshot = {
      ...context.lastSnapshot,
      stale: true,
      staleReason: reason,
      staleAt: new Date().toISOString(),
    };

    return this.update(userId, sessionId, { lastSnapshot: staleSnapshot });
  }

  /**
   * Get all contexts for a user (for cleanup/debugging)
   * @param {string} userId - User ID
   * @returns {Array} Array of contexts
   */
  getAllForUser(userId) {
    const normalizedUserId = String(userId || 'default');
    const results = [];

    for (const [key, context] of this._contexts.entries()) {
      if (key.startsWith(`${normalizedUserId}:`)) {
        results.push({ ...context });
      }
    }

    return results;
  }
}

module.exports = OperationalContextStore;
module.exports.createOperationalContext = createOperationalContext;
