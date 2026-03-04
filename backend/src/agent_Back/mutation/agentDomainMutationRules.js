"use strict";

/**
 * Agent Domain Mutation Rules
 *
 * Hard assertion layer: throws when a mutation violates domain rules.
 * Called after evaluateMutationConstraints() returns allowed=false
 * to produce a structured error for the caller.
 *
 * RECONSTRUCTED: Original file was deleted during pipeline migration.
 * Logic inferred from agentMutationProposal.service.js usage pattern.
 */

/**
 * Assert that a mutation is allowed under domain rules.
 * Throws if the mutation is blocked.
 *
 * @param {Object} params
 * @param {string} params.entityType
 * @param {string} params.operation
 * @param {number|string|null} params.entityId
 * @param {Object} params.payload
 * @param {Object|null} params.existing
 * @throws {Error} with code and status if mutation is blocked
 */
function assertDomainMutationAllowed({
  entityType,
  operation,
  entityId,
  payload,
  existing,
} = {}) {
  const type = String(entityType || "").trim().toLowerCase();
  const op = String(operation || "").trim().toLowerCase();

  const msg =
    `Domain rules block ${op} on ${type}` +
    (entityId != null ? ` #${entityId}` : "") +
    ". Use the proposed workflow to resolve dependencies first.";

  const err = new Error(msg);
  err.code = "DOMAIN_MUTATION_BLOCKED";
  err.status = 422;
  err.entityType = type;
  err.operation = op;
  err.entityId = entityId ?? null;
  throw err;
}

module.exports = { assertDomainMutationAllowed };
