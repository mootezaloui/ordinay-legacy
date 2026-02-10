"use strict";

const crypto = require("crypto");
const { ACTION_STATUS } = require("../contracts/actionProposal.contract");

/**
 * In-memory proposal store
 * Structure: proposalId -> { proposal, contextSnapshot, createdAt, expiresAt, executionResult }
 * - Auto-expire proposals after 5 minutes
 * - Keep executed proposals for 1 hour (idempotency)
 */
const proposalStore = new Map();

/**
 * Confirm and execute a proposal (V3 only)
 *
 * Validates posture, snapshot, and permissions before executing
 * Ensures idempotency and audit logging
 *
 * @param {Object} options - { proposalId, sessionId, userId }
 * @returns {Promise<Object>} ExecutionResult
 */
async function confirmProposal({ proposalId, sessionId, userId }) {
  const stored = proposalStore.get(proposalId);

  // Validation: proposal exists
  if (!stored) {
    return {
      type: "execution_result",
      proposalId,
      status: "failed",
      error: {
        code: "PROPOSAL_NOT_FOUND",
        message: `Proposal ${proposalId} not found in store`,
        safeMessage: "This proposal has expired. Please try again.",
        requiresReproposal: true,
      },
    };
  }

  const { proposal, contextSnapshot } = stored;

  // Validation: posture is WORK
  if (proposal.posture !== "WORK") {
    return {
      type: "execution_result",
      proposalId,
      status: "failed",
      error: {
        code: "POSTURE_MISMATCH",
        message: `Posture must be WORK, got ${proposal.posture}`,
        safeMessage: "This action requires WORK mode",
        requiresReproposal: false,
      },
    };
  }

  // Validation: snapshot hash
  const currentHash = await this._computeSnapshotHash(proposal.snapshot);
  if (currentHash !== proposal.snapshot.hash) {
    proposalStore.delete(proposalId);
    return {
      type: "execution_result",
      proposalId,
      status: "snapshot_mismatch",
      error: {
        code: "SNAPSHOT_MISMATCH",
        message: `Snapshot hash mismatch: expected ${proposal.snapshot.hash}, got ${currentHash}`,
        safeMessage: "The data has changed since this proposal was created. Please try again.",
        requiresReproposal: true,
      },
    };
  }

  // Validation: idempotency (already confirmed?)
  if (proposal.status === ACTION_STATUS.EXECUTED) {
    return {
      ...stored.executionResult,
      idempotent: true,
    };
  }

  // Execute action via universal operation handlers (or fallback to tool registry for legacy tools)
  const universalOps = require('./universalOperations');

  let result;

  try {
    // Dispatch to universal operation handlers based on action type
    switch (proposal.actionType) {
      case 'CREATE_ENTITY':
        result = await universalOps.executeCreateEntity(proposal.params, { userId, sessionId });
        break;
      case 'UPDATE_ENTITY':
        result = await universalOps.executeUpdateEntity(proposal.params, { userId, sessionId });
        break;
      case 'LINK_ENTITIES':
        result = await universalOps.executeLinkEntities(proposal.params, { userId, sessionId });
        break;
      case 'ATTACH_TO_ENTITY':
        result = await universalOps.executeAttachToEntity(proposal.params, { userId, sessionId });
        break;
      default:
        // Fallback to tool registry for legacy tools (backward compatibility)
        const tool = this.toolRegistry.get(proposal.actionType);
        if (!tool) {
          return {
            type: "execution_result",
            proposalId,
            status: "failed",
            error: {
              code: "TOOL_NOT_FOUND",
              message: `Tool ${proposal.actionType} not found in registry`,
              safeMessage: "This action is not available",
              requiresReproposal: false,
            },
          };
        }
        result = await tool.handler(proposal.params, { userId, sessionId });
    }

    const executionResult = {
      type: "execution_result",
      proposalId,
      status: "success",
      executedActions: [
        {
          actionType: proposal.actionType,
          result,
          executedAt: new Date().toISOString(),
        },
      ],
      audit: {
        userId,
        sessionId,
        executedAt: new Date().toISOString(),
        snapshotValidation: {
          expected: proposal.snapshot.hash,
          actual: currentHash,
          matched: true,
        },
      },
    };

    // Update proposal status (mutate stored copy, not frozen proposal)
    stored.proposal = { ...proposal, status: ACTION_STATUS.EXECUTED };
    stored.executionResult = executionResult;

    // Log to ledger
    this.ledger.record({
      type: "proposal_executed",
      proposalId,
      actionType: proposal.actionType,
      userId,
      sessionId,
      timestamp: new Date().toISOString(),
    });

    // Keep in store for idempotency (auto-expire after 1 hour)
    setTimeout(() => proposalStore.delete(proposalId), 3600000);

    return executionResult;
  } catch (err) {
    // Log failure
    this.ledger.record({
      type: "proposal_execution_failed",
      proposalId,
      actionType: proposal.actionType,
      error: err.message,
      timestamp: new Date().toISOString(),
    });

    return {
      type: "execution_result",
      proposalId,
      status: "failed",
      error: {
        code: "EXECUTION_ERROR",
        message: err.message,
        safeMessage: "The action could not be completed. Please try again.",
        requiresReproposal: false,
      },
    };
  }
}

/**
 * Store a proposal for later confirmation
 *
 * @param {Object} proposal - ActionProposal
 * @param {Object} contextSnapshot - Context at proposal time
 */
function storeProposal(proposal, contextSnapshot = {}) {
  const expiresAt = new Date(Date.now() + 300000); // 5 minutes

  proposalStore.set(proposal.proposalId, {
    proposal,
    contextSnapshot,
    createdAt: new Date(),
    expiresAt,
  });

  // Auto-expire after 5 minutes
  setTimeout(() => {
    proposalStore.delete(proposal.proposalId);
  }, 300000);

  // Log to ledger
  this.ledger.record({
    type: "proposal_stored",
    proposalId: proposal.proposalId,
    actionType: proposal.actionType,
    expiresAt: expiresAt.toISOString(),
    timestamp: new Date().toISOString(),
  });
}

/**
 * Compute snapshot hash for validation
 *
 * Uses entity adapter registry to compute hash of relevant fields
 * Avoids false positives from timestamp changes
 *
 * @param {Object} snapshot - { scope, scopeId, timestamp }
 * @returns {Promise<string>} SHA256 hash (format: "sha256:abc123...")
 * @private
 */
async function _computeSnapshotHash(snapshot) {
  const { computeSnapshotHash } = require('./entityAdapters');

  try {
    // Use entity adapter's snapshot hash computation
    return computeSnapshotHash(snapshot.scope, snapshot.scopeId);
  } catch (err) {
    // Entity not found or error - return null hash
    console.error(`[confirmation] Failed to compute snapshot hash: ${err.message}`);
    return "sha256:null";
  }
}

module.exports = {
  confirmProposal,
  storeProposal,
  _computeSnapshotHash,
};
