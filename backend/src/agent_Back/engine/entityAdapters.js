'use strict';

/**
 * Entity Adapter Registry
 *
 * Central registry for entity adapters.
 * Provides snapshot hash computation, validation, and field schemas.
 */

const adapters = require('../entities/adapters');
const { getEntityIdentityPolicy } = require("../mutation/entityIdentityPolicies");

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

function getFieldAliases(entityType, operation = "update") {
  const adapter = getAdapter(entityType);
  const aliases = adapter.fieldAliases;
  if (!aliases || typeof aliases !== "object") return {};
  if (aliases[operation] && typeof aliases[operation] === "object") {
    return aliases[operation];
  }
  return aliases;
}

function getFieldTypes(entityType, operation = "update") {
  const adapter = getAdapter(entityType);
  const meta = adapter.fieldTypes;
  if (!meta || typeof meta !== "object") return {};
  if (meta[operation] && typeof meta[operation] === "object") return meta[operation];
  return meta;
}

function getValueParsers(entityType, operation = "update") {
  const adapter = getAdapter(entityType);
  const meta = adapter.valueParsers;
  if (!meta || typeof meta !== "object") return {};
  if (meta[operation] && typeof meta[operation] === "object") return meta[operation];
  return meta;
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

function getIdentityPolicy(entityType) {
  return getEntityIdentityPolicy(entityType);
}

module.exports = {
  getAdapter,
  computeSnapshotHash,
  validatePayload,
  getAllowedFields,
  getFieldAliases,
  getFieldTypes,
  getValueParsers,
  getReversibilityRules,
  getIdentityPolicy,
};
