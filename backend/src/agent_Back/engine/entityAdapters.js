'use strict';

/**
 * Entity Adapter Registry
 *
 * Central registry for entity adapters.
 * Provides snapshot hash computation, validation, and field schemas.
 */

const adapters = require('../entities/adapters');

/**
 * Get adapter for entity type
 * @param {string} entityType - Entity type
 * @returns {Object} Adapter
 */
function getAdapter(entityType) {
  const adapter = adapters.get(entityType);
  if (!adapter) {
    throw new Error(`No adapter found for entity type: ${entityType}`);
  }
  return adapter;
}

/**
 * Compute snapshot hash for entity
 * @param {string} entityType - Entity type
 * @param {number} entityId - Entity ID
 * @returns {string} SHA256 hash (format: "sha256:abc123...")
 */
function computeSnapshotHash(entityType, entityId) {
  const adapter = getAdapter(entityType);
  return adapter.computeSnapshotHash(entityId);
}

/**
 * Validate payload for operation
 * @param {string} entityType - Entity type
 * @param {string} operation - Operation type ('create', 'update', 'delete')
 * @param {Object} payload - Payload to validate
 * @returns {boolean} True if valid
 * @throws {Error} If validation fails
 */
function validatePayload(entityType, operation, payload) {
  const adapter = getAdapter(entityType);
  return adapter.validate(operation, payload);
}

/**
 * Get allowed fields for entity type
 * @param {string} entityType - Entity type
 * @param {string} operation - Operation type ('create', 'update')
 * @returns {Array<string>} Allowed fields
 */
function getAllowedFields(entityType, operation) {
  const adapter = getAdapter(entityType);
  if (operation === 'create') {
    return adapter.allowedFields;
  } else if (operation === 'update') {
    return adapter.allowedUpdateFields;
  }
  return [];
}

/**
 * Get reversibility rules for entity type
 * @param {string} entityType - Entity type
 * @returns {Object} Reversibility rules
 */
function getReversibilityRules(entityType) {
  const adapter = getAdapter(entityType);
  return adapter.getReversibilityRules();
}

module.exports = {
  getAdapter,
  computeSnapshotHash,
  validatePayload,
  getAllowedFields,
  getReversibilityRules,
};
