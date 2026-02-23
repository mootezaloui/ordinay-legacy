"use strict";

const crypto = require("crypto");
const { ACTION_STATUS } = require("../contracts/actionProposal.contract");
const EXPLICIT_MUTATION_ACTIONS = new Set(["CREATE_ENTITY", "UPDATE_ENTITY", "EXECUTE_MUTATION_WORKFLOW"]);
const STAGE3_STRONG_INTENT_MUTATION_ACTIONS = new Set(["UPDATE_ENTITY", "EXECUTE_MUTATION_WORKFLOW"]);
const CONFIRM_DEBUG_ENABLED = ["1", "true", "yes", "on"].includes(
  String(process.env.AGENT_CHAT_MUTATION_DEBUG || "").toLowerCase(),
);
const ADAPTIVE_CONSTRAINTS_ENABLED = ["1", "true", "yes", "on"].includes(
  String(process.env.AGENT_ADAPTIVE_DOMAIN_CONSTRAINTS ?? "1").toLowerCase(),
);

function debugConfirm(event, payload = {}) {
  if (!CONFIRM_DEBUG_ENABLED) return;
  try {
    console.warn("[agent-confirm-debug]", event, payload);
  } catch (_) {}
}

async function maybeExecuteAdaptiveWorkflowFallback({
  proposal,
  contextSnapshot,
  universalOps,
  userId,
  sessionId,
}) {
  if (!ADAPTIVE_CONSTRAINTS_ENABLED) return null;
  if (String(proposal?.actionType || "").toUpperCase() !== "UPDATE_ENTITY") return null;
  if (String(contextSnapshot?.sourceRoute || "") !== "/agent/chat") return null;
  if (String(contextSnapshot?.proposalKind || "") !== "entity_mutation") return null;

  const params = proposal?.params || {};
  const entityType = String(params.entityType || "").toLowerCase();
  const entityId = Number(params.entityId || 0);
  const changes =
    params?.changes && typeof params.changes === "object" && !Array.isArray(params.changes)
      ? params.changes
      : null;
  if (!entityType || !Number.isInteger(entityId) || entityId <= 0 || !changes) return null;

  try {
    const { resolveAdaptiveMutationRemediation } = require("./agentMutationConstraintResolver");
    const resolverResult = resolveAdaptiveMutationRemediation({
      requestedMutation: {
        entityType,
        entityId,
        operation: "update",
        payload: changes,
      },
      executionMode: "confirm",
      existing: null,
      mode: "execution",
    });

    if (!resolverResult || !resolverResult.workflowProposalInput) return null;
    debugConfirm("confirm_adaptive_upgrade_attempt", {
      proposalId: proposal?.proposalId || null,
      originalActionType: proposal?.actionType || null,
      workflowType: resolverResult?.workflowProposalInput?.workflowType || null,
      route: resolverResult?.route || null,
      rootEntityType: entityType,
      rootEntityId: entityId,
    });

    const workflowResult = await universalOps.executeMutationWorkflow(
      { workflow: resolverResult.workflowProposalInput },
      { userId, sessionId, source: "agent" },
    );

    return {
      upgraded: true,
      workflowType: resolverResult.workflowProposalInput.workflowType || null,
      result: workflowResult,
    };
  } catch (upgradeError) {
    debugConfirm("confirm_adaptive_upgrade_failed", {
      proposalId: proposal?.proposalId || null,
      errorCode: upgradeError?.code || null,
      message: upgradeError?.message || null,
    });
    return null;
  }
}

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
async function confirmProposal({ proposalId, sessionId, userId, ackRisk = false }) {
  debugConfirm("confirm_received", {
    proposalId: proposalId || null,
    sessionId: sessionId || null,
    userId: userId || null,
    ackRisk: ackRisk === true,
  });
  const stored = proposalStore.get(proposalId);

  // Validation: proposal exists
  if (!stored) {
    debugConfirm("confirm_store_miss", { proposalId: proposalId || null });
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
  const isChatMutationProposal =
    contextSnapshot &&
    String(contextSnapshot.sourceRoute || "") === "/agent/chat" &&
    (String(contextSnapshot.proposalKind || "") === "entity_mutation" ||
      String(contextSnapshot.proposalKind || "") === "entity_mutation_workflow");
  const effectiveAckRisk =
    ackRisk === true ||
    (contextSnapshot &&
      contextSnapshot.requiresExtraConfirmation === true &&
      isChatMutationProposal);
  debugConfirm("confirm_loaded_proposal", {
    proposalId: proposal?.proposalId || proposalId || null,
    actionType: proposal?.actionType || null,
    proposalStatus: proposal?.status || null,
    posture: proposal?.posture || null,
    hasSnapshot: Boolean(proposal?.snapshot),
    snapshotScope: proposal?.snapshot?.scope || null,
    snapshotScopeId: proposal?.snapshot?.scopeId || null,
    proposalConfirmationKeys:
      proposal?.confirmation && typeof proposal.confirmation === "object"
        ? Object.keys(proposal.confirmation)
        : [],
    proposalExtraRiskAck: proposal?.confirmation?.extraRiskAck === true,
    contextProposalKind: contextSnapshot?.proposalKind || null,
    contextOrigin: contextSnapshot?.origin || null,
    contextExplicitMutationCommand: contextSnapshot?.explicitMutationCommand === true,
    contextStrongMutationIntent: contextSnapshot?.strongMutationIntent === true,
    contextRequiresExtraConfirmation: contextSnapshot?.requiresExtraConfirmation === true,
    contextRiskLevel: contextSnapshot?.riskLevel || null,
    isChatMutationProposal,
    effectiveAckRisk,
  });

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

  if (EXPLICIT_MUTATION_ACTIONS.has(String(proposal.actionType || ""))) {
    const proposalKind = String(contextSnapshot?.proposalKind || "");
    const fromExplicit =
      contextSnapshot &&
      contextSnapshot.explicitMutationCommand === true &&
      (proposalKind === "entity_mutation" || proposalKind === "entity_mutation_workflow");
    const fromStrongIntent =
      contextSnapshot &&
      contextSnapshot.strongMutationIntent === true &&
      String(contextSnapshot.origin || "") === "strong_mutation_intent" &&
      (proposalKind === "entity_mutation" || proposalKind === "entity_mutation_workflow") &&
      STAGE3_STRONG_INTENT_MUTATION_ACTIONS.has(String(proposal.actionType || ""));

    if (!fromExplicit && !fromStrongIntent) {
      debugConfirm("confirm_origin_rejected", {
        proposalId,
        actionType: proposal?.actionType || null,
        proposalKind,
        fromExplicit,
        fromStrongIntent,
      });
      return {
        type: "execution_result",
        proposalId,
        status: "failed",
        error: {
          code: "EXPLICIT_MUTATION_COMMAND_REQUIRED",
          message:
            "Create/update entity proposals must originate from explicit /mutate or approved strong-intent proposal flow",
          safeMessage:
            "This proposal cannot be executed because it was not created through an approved mutation proposal flow.",
          requiresReproposal: true,
        },
      };
    }
  }

  if (
    contextSnapshot &&
    contextSnapshot.requiresExtraConfirmation === true &&
    effectiveAckRisk !== true
  ) {
    debugConfirm("confirm_risk_ack_required", {
      proposalId,
      actionType: proposal?.actionType || null,
      ackRisk: ackRisk === true,
      effectiveAckRisk,
      contextRequiresExtraConfirmation: contextSnapshot?.requiresExtraConfirmation === true,
      proposalExtraRiskAck: proposal?.confirmation?.extraRiskAck === true,
      sourceRoute: contextSnapshot?.sourceRoute || null,
      proposalKind: contextSnapshot?.proposalKind || null,
    });
    return {
      type: "execution_result",
      proposalId,
      status: "failed",
      error: {
        code: "RISK_ACK_REQUIRED",
        message: "High-risk mutation proposals require ackRisk=true on confirmation",
        safeMessage:
          "This proposal is high-risk and requires an additional confirmation acknowledgement.",
        requiresReproposal: false,
      },
    };
  }
  if (
    contextSnapshot &&
    contextSnapshot.requiresExtraConfirmation === true &&
    ackRisk !== true &&
    effectiveAckRisk === true
  ) {
    debugConfirm("confirm_risk_ack_auto_satisfied", {
      proposalId,
      actionType: proposal?.actionType || null,
      sourceRoute: contextSnapshot?.sourceRoute || null,
      proposalKind: contextSnapshot?.proposalKind || null,
    });
  }

  // Validation: snapshot hash
  const currentHash = await this._computeSnapshotHash(proposal.snapshot);
  debugConfirm("confirm_snapshot_checked", {
    proposalId,
    expectedHash: proposal?.snapshot?.hash || null,
    actualHash: currentHash || null,
    matched: currentHash === proposal?.snapshot?.hash,
  });
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
    // Capture before-state for diff ledgering
    const beforeSnapshot = proposal.snapshot ? { ...proposal.snapshot } : null;

    debugConfirm("confirm_dispatch_start", {
      proposalId,
      actionType: proposal?.actionType || null,
      paramKeys: proposal?.params && typeof proposal.params === "object" ? Object.keys(proposal.params) : [],
    });
    // Dispatch to universal operation handlers based on action type
    switch (proposal.actionType) {
      case 'CREATE_ENTITY':
        result = await universalOps.executeCreateEntity(proposal.params, { userId, sessionId, source: "agent" });
        break;
      case 'UPDATE_ENTITY':
        result = await universalOps.executeUpdateEntity(proposal.params, { userId, sessionId, source: "agent" });
        break;
      case 'EXECUTE_MUTATION_WORKFLOW':
        result = await universalOps.executeMutationWorkflow(proposal.params, { userId, sessionId, source: "agent" });
        break;
      case 'DELETE_ENTITY':
        result = await universalOps.executeDeleteEntity(proposal.params, { userId, sessionId, source: "agent" });
        break;
      case 'LINK_ENTITIES':
        result = await universalOps.executeLinkEntities(proposal.params, { userId, sessionId, source: "agent" });
        break;
      case 'ATTACH_TO_ENTITY':
        result = await universalOps.executeAttachToEntity(proposal.params, { userId, sessionId, source: "agent" });
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

    // Compute after-state for diff ledgering
    let afterHash = null;
    if (beforeSnapshot && beforeSnapshot.scope && beforeSnapshot.scopeId) {
      try {
        afterHash = await this._computeSnapshotHash(beforeSnapshot);
      } catch (_) {
        afterHash = 'sha256:null';
      }
    }

    debugConfirm("confirm_dispatch_success", {
      proposalId,
      actionType: proposal?.actionType || null,
      resultOk: result?.ok === true,
      resultEntityType: result?.entityType || null,
      resultEntityId: result?.entityId || null,
      rowCount: Number.isFinite(Number(result?.rowCount)) ? Number(result.rowCount) : null,
      workflowType: result?.workflowType || null,
      goalReached: result?.goalReached,
      resultKeys: result && typeof result === "object" ? Object.keys(result) : [],
    });

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
      artifact: {
        proposalId,
        operation: proposal.actionType,
        params: proposal.params,
        result,
        posture: proposal.posture,
        version: proposal.version,
      },
      audit: {
        userId,
        sessionId,
        executedAt: new Date().toISOString(),
        snapshotValidation: {
          expected: proposal.snapshot.hash,
          actual: currentHash,
          matched: true,
        },
        diff: {
          before: beforeSnapshot ? { hash: beforeSnapshot.hash } : null,
          after: afterHash ? { hash: afterHash } : null,
        },
      },
    };

    // Update proposal status (mutate stored copy, not frozen proposal)
    stored.proposal = { ...proposal, status: ACTION_STATUS.EXECUTED };
    stored.executionResult = executionResult;

    // Log to ledger with before/after diffs
    this.ledger.record({
      type: "proposal_executed",
      proposalId,
      actionType: proposal.actionType,
      userId,
      sessionId,
      diff: {
        before: beforeSnapshot ? { hash: beforeSnapshot.hash, scope: beforeSnapshot.scope, scopeId: beforeSnapshot.scopeId } : null,
        after: afterHash ? { hash: afterHash, scope: beforeSnapshot.scope, scopeId: beforeSnapshot.scopeId } : null,
        params: proposal.params,
      },
      timestamp: new Date().toISOString(),
    });

    // Keep in store for idempotency (auto-expire after 1 hour)
    {
      const timer = setTimeout(() => proposalStore.delete(proposalId), 3600000);
      if (typeof timer?.unref === "function") timer.unref();
    }

    clearPendingMutationProposal.call(this, {
      sessionId: sessionId || contextSnapshot?.sessionId || proposal?.sessionId || null,
      userId: userId || contextSnapshot?.userId || null,
    });

    invalidateSnapshotsAfterMutation.call(this, {
      proposal,
      executionResult,
      sessionId: sessionId || contextSnapshot?.sessionId || proposal?.sessionId || null,
      userId: userId || contextSnapshot?.userId || null,
    });

    return executionResult;
  } catch (err) {
    const errorCode = err?.code || "EXECUTION_ERROR";
    if (errorCode === "DOMAIN_RULE_BLOCKED") {
      const upgraded = await maybeExecuteAdaptiveWorkflowFallback({
        proposal,
        contextSnapshot,
        universalOps,
        userId,
        sessionId,
      });
      if (upgraded?.upgraded === true) {
        debugConfirm("confirm_adaptive_upgrade_success", {
          proposalId,
          originalActionType: proposal?.actionType || null,
          workflowType: upgraded.workflowType || null,
          goalReached: upgraded?.result?.goalReached,
          stepsSucceeded: upgraded?.result?.stepsSucceeded,
        });

        let afterHash = null;
        const beforeSnapshot = proposal.snapshot ? { ...proposal.snapshot } : null;
        if (beforeSnapshot && beforeSnapshot.scope && beforeSnapshot.scopeId) {
          try {
            afterHash = await this._computeSnapshotHash(beforeSnapshot);
          } catch (_) {
            afterHash = "sha256:null";
          }
        }

        const executionResult = {
          type: "execution_result",
          proposalId,
          status: "success",
          executedActions: [
            {
              actionType: "EXECUTE_MUTATION_WORKFLOW",
              result: upgraded.result,
              executedAt: new Date().toISOString(),
            },
          ],
          artifact: {
            proposalId,
            operation: "EXECUTE_MUTATION_WORKFLOW",
            params: { workflowType: upgraded.workflowType || null },
            result: upgraded.result,
            posture: proposal.posture,
            version: proposal.version,
          },
          audit: {
            userId,
            sessionId,
            executedAt: new Date().toISOString(),
            snapshotValidation: {
              expected: proposal.snapshot.hash,
              actual: currentHash,
              matched: true,
            },
            diff: {
              before: beforeSnapshot ? { hash: beforeSnapshot.hash } : null,
              after: afterHash ? { hash: afterHash } : null,
            },
          },
        };

        stored.proposal = { ...proposal, status: ACTION_STATUS.EXECUTED };
        stored.executionResult = executionResult;

        this.ledger.record({
          type: "proposal_executed",
          proposalId,
          actionType: "EXECUTE_MUTATION_WORKFLOW",
          userId,
          sessionId,
          diff: {
            before: beforeSnapshot
              ? { hash: beforeSnapshot.hash, scope: beforeSnapshot.scope, scopeId: beforeSnapshot.scopeId }
              : null,
            after: afterHash
              ? { hash: afterHash, scope: beforeSnapshot.scope, scopeId: beforeSnapshot.scopeId }
              : null,
            params: proposal.params,
          },
          timestamp: new Date().toISOString(),
        });

        {
          const timer = setTimeout(() => proposalStore.delete(proposalId), 3600000);
          if (typeof timer?.unref === "function") timer.unref();
        }

        clearPendingMutationProposal.call(this, {
          sessionId: sessionId || contextSnapshot?.sessionId || proposal?.sessionId || null,
          userId: userId || contextSnapshot?.userId || null,
        });

        invalidateSnapshotsAfterMutation.call(this, {
          proposal,
          executionResult,
          sessionId: sessionId || contextSnapshot?.sessionId || proposal?.sessionId || null,
          userId: userId || contextSnapshot?.userId || null,
        });

        return executionResult;
      }
    }
    debugConfirm("confirm_dispatch_failed", {
      proposalId,
      actionType: proposal?.actionType || null,
      errorCode,
      message: err?.message || "Execution failed",
      stackTop: typeof err?.stack === "string" ? String(err.stack).split("\n").slice(0, 2).join(" | ") : null,
    });
    const safeMessageByCode = {
      PDF_RENDERER_UNAVAILABLE:
        "PDF generation is unavailable on this server. Install puppeteer dependencies and retry.",
      PDF_RENDERER_LAUNCH_FAILED:
        "PDF generation failed to start. Configure Chromium (PUPPETEER_EXECUTABLE_PATH) and retry.",
      DOCX_RENDERER_UNAVAILABLE:
        "DOCX generation is unavailable on this server. Install docx dependency and retry.",
      MISSING_REQUIRED_FIELDS:
        "Document data is incomplete. Please provide missing information and retry.",
      DOMAIN_RULE_BLOCKED:
        "This change cannot be completed yet because related records still need to be updated.",
    };
    const derivedDomainSafeMessage =
      errorCode === "DOMAIN_RULE_BLOCKED"
        ? String(
            err?.safeMessage ||
              err?.domainRule?.primaryBlocker?.userFacingFactText ||
              err?.domainRule?.evaluation?.blockers?.[0]?.userFacingFactText ||
              "",
          ).trim()
        : "";
    const finalSafeMessage =
      derivedDomainSafeMessage ||
      safeMessageByCode[errorCode] ||
      "The action could not be completed. Please try again.";

    // Log failure
    this.ledger.record({
      type: "proposal_execution_failed",
      proposalId,
      actionType: proposal.actionType,
      error: err?.message || "Execution failed",
      errorCode,
      timestamp: new Date().toISOString(),
    });

    return {
      type: "execution_result",
      proposalId,
      status: "failed",
      error: {
        code: errorCode,
        message: err?.message || "Execution failed",
        safeMessage: finalSafeMessage,
        requiresReproposal: false,
      },
    };
  }
}

function invalidateSnapshotsAfterMutation({
  proposal,
  executionResult,
  sessionId,
  userId,
} = {}) {
  const ctxStore = this?.contextStore;
  if (!ctxStore) return;

  const requestContext = {
    conversationId: sessionId || null,
    userId: userId || "default",
  };
  const reason = `mutation:${String(proposal?.actionType || "unknown").toLowerCase()}`;

  if (typeof ctxStore.markWorkSnapshotStale === "function" && requestContext.conversationId) {
    try {
      ctxStore.markWorkSnapshotStale(requestContext, reason);
      this?.ledger?.record?.({
        type: "work_snapshot_marked_stale",
        reason,
        conversationId: requestContext.conversationId,
        scope: proposal?.snapshot?.scope || null,
        scopeId: proposal?.snapshot?.scopeId || null,
        timestamp: new Date().toISOString(),
      });
    } catch (_) {}
  }

  const mutationResult = executionResult?.executedActions?.[0]?.result || null;
  const after = mutationResult?.after || mutationResult?.updatedRow || null;
  const params = proposal?.params || {};
  const dossierId =
    Number(after?.dossier_id || 0) ||
    (String(params.entityType || "").toLowerCase() === "dossier"
      ? Number(params.entityId || 0)
      : 0) ||
    Number(params?.changes?.dossier_id || 0) ||
    0;

  if (dossierId > 0 && typeof ctxStore.markWorkSnapshotsStaleByDossierId === "function") {
    try {
      ctxStore.markWorkSnapshotsStaleByDossierId(dossierId, reason);
    } catch (_) {}
  }
}

function clearPendingMutationProposal({ sessionId, userId }) {
  const operationalStore = this?.contextStore?._operationalStore;
  if (
    !operationalStore ||
    typeof operationalStore.update !== "function" ||
    !sessionId
  ) {
    return;
  }
  operationalStore.update(userId || "default", sessionId, {
    pendingMutationProposal: null,
    suppressMutationDetectionUntilResolved: false,
  });
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
  debugConfirm("proposal_stored", {
    proposalId: proposal?.proposalId || null,
    actionType: proposal?.actionType || null,
    requiresConfirmation: proposal?.requiresConfirmation === true,
    proposalExtraRiskAck: proposal?.confirmation?.extraRiskAck === true,
    contextProposalKind: contextSnapshot?.proposalKind || null,
    contextOrigin: contextSnapshot?.origin || null,
    contextRequiresExtraConfirmation: contextSnapshot?.requiresExtraConfirmation === true,
    contextRiskLevel: contextSnapshot?.riskLevel || null,
    sessionId: contextSnapshot?.sessionId || proposal?.sessionId || null,
  });

  // Auto-expire after 5 minutes
  const timer = setTimeout(() => {
    proposalStore.delete(proposal.proposalId);
  }, 300000);
  if (typeof timer?.unref === "function") timer.unref();

  // Log to ledger with snapshot state at proposal time
  this.ledger.record({
    type: "proposal_stored",
    proposalId: proposal.proposalId,
    actionType: proposal.actionType,
    snapshot: proposal.snapshot ? { hash: proposal.snapshot.hash, scope: proposal.snapshot.scope, scopeId: proposal.snapshot.scopeId } : null,
    params: proposal.params,
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
