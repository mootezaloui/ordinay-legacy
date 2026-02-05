'use strict';

/**
 * Agent Permission & Trust System
 *
 * Ensures the agent:
 * - Never oversteps its bounds
 * - Earns trust progressively
 * - Escalates permissions explicitly
 *
 * COMPONENTS:
 * - Permission Model: Fine-grained permission scopes
 * - Trust Tiers: Progressive capability levels
 * - Confirmation Hooks: UI integration for user approval
 * - Execution Gate: Central action gating
 */

const {
  PERMISSION_SCOPES,
  PERMISSION_CATEGORIES,
  PermissionGrant,
  PermissionSet,
  getCategoryFromScope,
  requiresConfirmation,
  hasSideEffects,
  getScopeRiskLevel,
  getAllScopes,
} = require('./permission.model');

const {
  TRUST_TIERS,
  TrustScore,
  TrustManager,
  getTierPermissions,
} = require('./trust.tiers');

const {
  CONFIRMATION_TYPES,
  CONFIRMATION_PRIORITY,
  ConfirmationRequest,
  ConfirmationManager,
  ConfirmationPayloads,
} = require('./confirmation.hooks');

const {
  GATE_RESULT,
  BLOCK_REASON,
  ExecutionGate,
  createExecutionGate,
} = require('./execution.gate');

module.exports = {
  // Permission Model
  PERMISSION_SCOPES,
  PERMISSION_CATEGORIES,
  PermissionGrant,
  PermissionSet,
  getCategoryFromScope,
  requiresConfirmation,
  hasSideEffects,
  getScopeRiskLevel,
  getAllScopes,

  // Trust Tiers
  TRUST_TIERS,
  TrustScore,
  TrustManager,
  getTierPermissions,

  // Confirmation Hooks
  CONFIRMATION_TYPES,
  CONFIRMATION_PRIORITY,
  ConfirmationRequest,
  ConfirmationManager,
  ConfirmationPayloads,

  // Execution Gate
  GATE_RESULT,
  BLOCK_REASON,
  ExecutionGate,
  createExecutionGate,
};
