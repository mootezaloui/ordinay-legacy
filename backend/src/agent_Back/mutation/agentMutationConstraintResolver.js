"use strict";

const { evaluateMutationConstraints } = require("./agentDomainConstraintEvaluator");
const clientsService = require("../../services/clients.service");
const dossiersService = require("../../services/dossiers.service");
const lawsuitsService = require("../../services/lawsuits.service");

function _normalizeToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");
}

function _isClientInactiveMutation({ entityType, operation, payload }) {
  if (String(entityType || "").toLowerCase() !== "client") return false;
  if (String(operation || "").toLowerCase() !== "update") return false;
  const status = payload?.status;
  return (
    String(status || "") === "inActive" ||
    new Set(["inactive", "in_active", "not_active", "former_client"]).has(_normalizeToken(status))
  );
}

function _toDisplayName(entityType, existing, entityId) {
  const numericId = Number(entityId);
  const safeLookup = (service, pick) => {
    try {
      if (!service || typeof service.get !== "function" || !Number.isInteger(numericId) || numericId <= 0) {
        return null;
      }
      const row = service.get(numericId);
      return row ? pick(row) : null;
    } catch (_) {
      return null;
    }
  };
  if (entityType === "client") {
    return (
      existing?.name ||
      safeLookup(clientsService, (row) => row.name || row.reference || null) ||
      `Client #${entityId}`
    );
  }
  if (entityType === "dossier") {
    return (
      existing?.title ||
      safeLookup(dossiersService, (row) => row.title || row.reference || null) ||
      `Dossier #${entityId}`
    );
  }
  if (entityType === "lawsuit") {
    return (
      existing?.title ||
      safeLookup(lawsuitsService, (row) => row.title || row.lawsuit_number || row.reference || null) ||
      `Lawsuit #${entityId}`
    );
  }
  return `${entityType} #${entityId}`;
}

function _isClosedLike(value) {
  return new Set(["closed", "archive", "archived"]).has(_normalizeToken(value));
}

function _isDossierCloseMutation({ entityType, operation, payload, existing }) {
  if (String(entityType || "").toLowerCase() !== "dossier") return false;
  if (String(operation || "").toLowerCase() !== "update") return false;
  if (!payload || !Object.prototype.hasOwnProperty.call(payload, "status")) return false;
  if (!_isClosedLike(payload.status)) return false;
  return !_isClosedLike(existing?.status);
}

function _isLawsuitCloseMutation({ entityType, operation, payload, existing }) {
  if (String(entityType || "").toLowerCase() !== "lawsuit") return false;
  if (String(operation || "").toLowerCase() !== "update") return false;
  if (!payload || !Object.prototype.hasOwnProperty.call(payload, "status")) return false;
  if (!_isClosedLike(payload.status)) return false;
  return !_isClosedLike(existing?.status);
}

function _defaultOpenStatusForEntity(entityType) {
  if (entityType === "lawsuit") return "in_progress";
  return "open";
}

function _countFactItems(facts = {}) {
  const counts = {};
  for (const [key, value] of Object.entries(facts || {})) {
    counts[key] = Array.isArray(value) ? value.length : value;
  }
  return counts;
}

function _mkWorkflowStep(entityType, entityId, changes, reason, risk = "high") {
  return {
    stepId: `${entityType}_${entityId}_${Object.keys(changes || {}).join("_") || "update"}`,
    actionType: "UPDATE_ENTITY",
    params: {
      entityType,
      entityId: Number(entityId),
      changes: { ...(changes || {}) },
    },
    risk,
    reason,
  };
}

function _dedupeSteps(steps = []) {
  const seen = new Set();
  const out = [];
  for (const step of steps) {
    const key = JSON.stringify([step?.actionType, step?.params?.entityType, step?.params?.entityId, step?.params?.changes]);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(step);
  }
  return out;
}

function _buildLawsuitClosureWorkflow({ entityId, existing, evaluation, executionMode = "confirm" }) {
  const facts = evaluation?.blockers?.find((b) => b.code === "LAWSUIT_HAS_OPEN_CHILDREN")?.facts || {};
  const rootName = _toDisplayName("lawsuit", existing, entityId);
  const steps = [];
  for (const task of facts.openTasks || []) {
    steps.push(_mkWorkflowStep("task", task.id, { status: "cancelled" }, "Close lawsuit requires pending tasks to be closed first"));
  }
  for (const session of facts.openSessions || []) {
    steps.push(_mkWorkflowStep("session", session.id, { status: "cancelled" }, "Close lawsuit requires open hearings to be closed first"));
  }
  for (const mission of facts.openMissions || []) {
    steps.push(_mkWorkflowStep("mission", mission.id, { status: "cancelled" }, "Close lawsuit requires active missions to be closed first"));
  }
  steps.push(_mkWorkflowStep("lawsuit", entityId, { status: "closed" }, "Finalize requested lawsuit closure"));

  const counts = facts.counts || {
    openTasks: (facts.openTasks || []).length,
    openSessions: (facts.openSessions || []).length,
    openMissions: (facts.openMissions || []).length,
  };
  const parts = [];
  if (counts.openTasks) parts.push(`${counts.openTasks} open task${counts.openTasks > 1 ? "s" : ""}`);
  if (counts.openSessions) parts.push(`${counts.openSessions} open hearing${counts.openSessions > 1 ? "s" : ""}`);
  if (counts.openMissions) parts.push(`${counts.openMissions} active mission${counts.openMissions > 1 ? "s" : ""}`);
  const factSentence = parts.join(", ") || "open linked items";

  const risk = "high";
  const autoEligible = executionMode === "auto_execute" && risk === "low";
  return {
    route: autoEligible ? "auto_execute_workflow" : "propose_workflow",
    userFacingSummary: `${rootName} still has ${factSentence}. I will close or cancel those linked items first, then close the lawsuit. Do you want me to proceed?`,
    risk,
    requiresExtraConfirmation: true,
    facts: counts,
    workflowProposalInput: {
      workflowType: "lawsuit_closure_cleanup",
      rootEntity: { type: "lawsuit", id: Number(entityId) },
      rootLabel: rootName,
      requestedGoal: { entityType: "lawsuit", operation: "update", changes: { status: "closed" } },
      facts: counts,
      steps: _dedupeSteps(steps),
      canReachRequestedGoal: true,
      blockedTerminalStep: null,
      reasoningSummary: "User requested lawsuit closure; dependent records must be closed first.",
    },
  };
}

function _buildDossierClosureWorkflow({ entityId, existing, evaluation, executionMode = "confirm" }) {
  const facts = evaluation?.blockers?.find((b) => b.code === "DOSSIER_HAS_OPEN_CHILDREN")?.facts || {};
  const rootName = _toDisplayName("dossier", existing, entityId);
  const steps = [];
  for (const task of facts.openTasks || []) {
    steps.push(_mkWorkflowStep("task", task.id, { status: "cancelled" }, "Close dossier requires pending tasks to be closed first"));
  }
  for (const session of facts.openSessions || []) {
    steps.push(_mkWorkflowStep("session", session.id, { status: "cancelled" }, "Close dossier requires open hearings to be closed first"));
  }
  for (const mission of facts.openMissions || []) {
    steps.push(_mkWorkflowStep("mission", mission.id, { status: "cancelled" }, "Close dossier requires active missions to be closed first"));
  }
  for (const lawsuit of facts.openLawsuits || []) {
    steps.push(_mkWorkflowStep("lawsuit", lawsuit.id, { status: "closed" }, "Close dossier requires linked lawsuits to be closed first"));
  }
  steps.push(_mkWorkflowStep("dossier", entityId, { status: "closed" }, "Finalize requested dossier closure"));

  const counts = facts.counts || {
    openLawsuits: (facts.openLawsuits || []).length,
    openTasks: (facts.openTasks || []).length,
    openSessions: (facts.openSessions || []).length,
    openMissions: (facts.openMissions || []).length,
  };
  const parts = [];
  if (counts.openLawsuits) parts.push(`${counts.openLawsuits} open lawsuit${counts.openLawsuits > 1 ? "s" : ""}`);
  if (counts.openTasks) parts.push(`${counts.openTasks} open task${counts.openTasks > 1 ? "s" : ""}`);
  if (counts.openSessions) parts.push(`${counts.openSessions} open hearing${counts.openSessions > 1 ? "s" : ""}`);
  if (counts.openMissions) parts.push(`${counts.openMissions} active mission${counts.openMissions > 1 ? "s" : ""}`);
  const factSentence = parts.join(", ") || "open linked items";

  const risk = "high";
  const autoEligible = executionMode === "auto_execute" && risk === "low";
  return {
    route: autoEligible ? "auto_execute_workflow" : "propose_workflow",
    userFacingSummary: `${rootName} still has ${factSentence}. I will close or cancel those linked items first, then close the dossier. Do you want me to proceed?`,
    risk,
    requiresExtraConfirmation: true,
    facts: counts,
    workflowProposalInput: {
      workflowType: "dossier_closure_cleanup",
      rootEntity: { type: "dossier", id: Number(entityId) },
      rootLabel: rootName,
      requestedGoal: { entityType: "dossier", operation: "update", changes: { status: "closed" } },
      facts: counts,
      steps: _dedupeSteps(steps),
      canReachRequestedGoal: true,
      blockedTerminalStep: null,
      reasoningSummary: "User requested dossier closure; dependent records must be closed first.",
    },
  };
}

function _buildClosedParentChildUpdateWorkflow({
  requestedMutation,
  existing,
  evaluation,
  executionMode = "confirm",
}) {
  const entityType = String(requestedMutation?.entityType || "").toLowerCase();
  const operation = String(requestedMutation?.operation || "").toLowerCase();
  const entityId = Number(requestedMutation?.entityId);
  const payload = requestedMutation?.payload || {};
  if (operation !== "update") {
    return null;
  }

  const blockers = Array.isArray(evaluation?.blockers) ? evaluation.blockers : [];
  const parentDossierBlocker = blockers.find((b) => b.code === "PARENT_DOSSIER_CLOSED");
  const parentLawsuitBlocker = blockers.find((b) => b.code === "PARENT_LAWSUIT_CLOSED");
  if (!parentDossierBlocker && !parentLawsuitBlocker) return null;

  const steps = [];
  const closeBackSteps = [];
  const factParts = [];

  if (parentDossierBlocker?.facts?.parentId) {
    const dossierId = Number(parentDossierBlocker.facts.parentId);
    steps.push(
      _mkWorkflowStep("dossier", dossierId, { status: _defaultOpenStatusForEntity("dossier") }, `Temporarily reopen dossier #${dossierId} to apply the requested ${entityType.replace(/_/g, " ")} change`),
    );
    closeBackSteps.unshift(
      _mkWorkflowStep("dossier", dossierId, { status: "closed" }, `Restore dossier #${dossierId} to closed status after applying the requested change`),
    );
    factParts.push("the linked dossier is closed");
  }

  if (parentLawsuitBlocker?.facts?.parentId) {
    const lawsuitId = Number(parentLawsuitBlocker.facts.parentId);
    steps.push(
      _mkWorkflowStep("lawsuit", lawsuitId, { status: _defaultOpenStatusForEntity("lawsuit") }, `Temporarily reopen lawsuit #${lawsuitId} to apply the requested ${entityType.replace(/_/g, " ")} change`),
    );
    closeBackSteps.unshift(
      _mkWorkflowStep("lawsuit", lawsuitId, { status: "closed" }, `Restore lawsuit #${lawsuitId} to closed status after applying the requested change`),
    );
    factParts.push("the linked lawsuit is closed");
  }

  steps.push(
    _mkWorkflowStep(entityType, entityId, payload, `Apply the requested ${entityType.replace(/_/g, " ")} update`),
  );
  steps.push(...closeBackSteps);

  const rootName = _toDisplayName(entityType, existing, entityId);
  const factSentence = factParts.join(" and ");
  const risk = "high";
  const autoEligible = executionMode === "auto_execute" && risk === "low";

  return {
    route: autoEligible ? "auto_execute_workflow" : "propose_workflow",
    userFacingSummary: `${rootName} can’t be updated while ${factSentence}. I will temporarily reopen the parent record${factParts.length > 1 ? "s" : ""}, apply the change, then close it again. Do you want me to proceed?`,
    risk,
    requiresExtraConfirmation: true,
    facts: {
      parentDossierClosed: Boolean(parentDossierBlocker),
      parentLawsuitClosed: Boolean(parentLawsuitBlocker),
    },
    workflowProposalInput: {
      workflowType: "closed_parent_child_update",
      rootEntity: { type: entityType, id: Number(entityId) },
      rootLabel: rootName,
      requestedGoal: { entityType, operation: "update", changes: payload },
      facts: {
        parentDossierClosed: Boolean(parentDossierBlocker),
        parentLawsuitClosed: Boolean(parentLawsuitBlocker),
      },
      steps: _dedupeSteps(steps),
      canReachRequestedGoal: true,
      blockedTerminalStep: null,
      reasoningSummary: "Requested update is blocked by a closed parent; temporary reopen-and-restore workflow required.",
    },
  };
}

function _buildClientInactiveWorkflow({
  entityId,
  existing,
  evaluation,
  executionMode = "confirm",
  allowFinancialAutoCleanup = false,
}) {
  const facts = evaluation?.facts || {};
  const rootName = _toDisplayName("client", existing, entityId);
  const steps = [];

  const addUpdateSteps = (items, entityType, targetStatus, reasonPrefix) => {
    for (const item of items || []) {
      steps.push({
        stepId: `${entityType}_${item.id}_${String(targetStatus).toLowerCase()}`,
        actionType: "UPDATE_ENTITY",
        params: {
          entityType,
          entityId: Number(item.id),
          changes: { status: targetStatus },
        },
        risk: "high",
        reason: `${reasonPrefix} (${item.title || item.reference || item.id})`,
      });
    }
  };

  // Cleanup order: leaf-ish entities first, then parents, then client.
  addUpdateSteps(facts.pendingTasks, "task", "cancelled", "Pending task blocks client inactivation");
  addUpdateSteps(facts.openSessions, "session", "cancelled", "Open hearing blocks client inactivation");
  addUpdateSteps(facts.activeMissions, "mission", "cancelled", "Active mission blocks client inactivation");
  addUpdateSteps(facts.openLawsuits, "lawsuit", "closed", "Open lawsuit blocks client inactivation");
  addUpdateSteps(facts.openDossiers, "dossier", "closed", "Open dossier blocks client inactivation");

  const unpaidReceivables = facts.unpaidReceivables || { count: 0, totalAmount: 0, currency: null };
  const canReachRequestedGoal = unpaidReceivables.count === 0 || allowFinancialAutoCleanup === true;

  if (canReachRequestedGoal) {
    steps.push({
      stepId: `client_${entityId}_inactive`,
      actionType: "UPDATE_ENTITY",
      params: {
        entityType: "client",
        entityId: Number(entityId),
        changes: { status: "inActive" },
      },
      risk: "high",
      reason: "Finalize requested client inactivation",
    });
  }

  const factsSummary = {
    openDossiers: Number(facts.openDossiers?.length || 0),
    openLawsuits: Number(facts.openLawsuits?.length || 0),
    pendingTasks: Number(facts.pendingTasks?.length || 0),
    openSessions: Number(facts.openSessions?.length || 0),
    activeMissions: Number(facts.activeMissions?.length || 0),
    unpaidReceivables: {
      count: Number(unpaidReceivables.count || 0),
      totalAmount: Number(unpaidReceivables.totalAmount || 0),
      currency: unpaidReceivables.currency || null,
    },
  };

  const factParts = [];
  if (factsSummary.openDossiers) factParts.push(`${factsSummary.openDossiers} open dossier${factsSummary.openDossiers > 1 ? "s" : ""}`);
  if (factsSummary.pendingTasks) factParts.push(`${factsSummary.pendingTasks} pending task${factsSummary.pendingTasks > 1 ? "s" : ""}`);
  if (factsSummary.unpaidReceivables.count) factParts.push("unpaid receivables");
  const factSentence = factParts.length > 0 ? factParts.join(", ") : "linked open items";

  let userFacingSummary;
  let blockedTerminalStep = null;
  if (!canReachRequestedGoal) {
    blockedTerminalStep = {
      code: "UNPAID_RECEIVABLES",
      message: `${rootName} still has unpaid receivables and cannot be marked inactive yet.`,
    };
    userFacingSummary = `${rootName} still has ${factSentence}. I will clean up the open items I can safely update, but the unpaid receivables must be handled separately before I can mark the client inactive. Do you want me to proceed?`;
  } else {
    userFacingSummary = `${rootName} still has ${factSentence}. I will clean up the open items and then mark the client inactive. Do you want me to proceed?`;
  }

  const risk = "high";
  const autoEligible = executionMode === "auto_execute" && risk === "low";

  return {
    route: autoEligible ? "auto_execute_workflow" : "propose_workflow",
    userFacingSummary,
    risk,
    facts: factsSummary,
    workflowProposalInput: {
      workflowType: "client_inactivation_cleanup",
      rootEntity: { type: "client", id: Number(entityId) },
      rootLabel: rootName,
      requestedGoal: {
        entityType: "client",
        operation: "update",
        changes: { status: "inActive" },
      },
      facts: factsSummary,
      steps,
      canReachRequestedGoal,
      blockedTerminalStep,
      reasoningSummary: `User requested client inactivation; cleanup workflow required before final status update.`,
    },
  };
}

function resolveAdaptiveMutationRemediation({
  requestedMutation,
  executionMode = "confirm",
  existing = null,
  allowFinancialAutoCleanup = false,
  mode = "proposal_preflight",
  evaluation: precomputedEvaluation = null,
}) {
  const entityType = String(requestedMutation?.entityType || "").toLowerCase();
  const operation = String(requestedMutation?.operation || "").toLowerCase();
  const entityId = requestedMutation?.entityId == null ? null : Number(requestedMutation.entityId);
  const payload = requestedMutation?.payload || {};

  const evaluation =
    precomputedEvaluation && typeof precomputedEvaluation === "object"
      ? precomputedEvaluation
      : evaluateMutationConstraints({
          entityType,
          operation,
          entityId,
          payload,
          existing,
          mode,
        });

  if (evaluation.allowed) {
    return {
      route: "execute_original",
      userFacingSummary: "",
      facts: evaluation.facts || null,
      risk: evaluation.requiresExtraConfirmation ? "high" : "low",
      warnings: evaluation.warnings || [],
      requiresExtraConfirmation: evaluation.requiresExtraConfirmation === true,
      impactSummary: evaluation.impactSummary || [],
      evaluation,
    };
  }

  if (_isClientInactiveMutation({ entityType, operation, payload })) {
    return {
      ..._buildClientInactiveWorkflow({
        entityId,
        existing,
        evaluation,
        executionMode,
        allowFinancialAutoCleanup,
      }),
      evaluation,
    };
  }

  if (_isLawsuitCloseMutation({ entityType, operation, payload, existing })) {
    return {
      ..._buildLawsuitClosureWorkflow({
        entityId,
        existing,
        evaluation,
        executionMode,
      }),
      warnings: evaluation.warnings || [],
      impactSummary: evaluation.impactSummary || [],
      evaluation,
    };
  }

  if (_isDossierCloseMutation({ entityType, operation, payload, existing })) {
    return {
      ..._buildDossierClosureWorkflow({
        entityId,
        existing,
        evaluation,
        executionMode,
      }),
      warnings: evaluation.warnings || [],
      impactSummary: evaluation.impactSummary || [],
      evaluation,
    };
  }

  const closedParentWorkflow = _buildClosedParentChildUpdateWorkflow({
    requestedMutation: { entityType, entityId, operation, payload },
    existing,
    evaluation,
    executionMode,
  });
  if (closedParentWorkflow) {
    return {
      ...closedParentWorkflow,
      warnings: evaluation.warnings || [],
      impactSummary: evaluation.impactSummary || [],
      evaluation,
    };
  }

  const primary = evaluation.blockers?.[0] || null;
  return {
    route: "blocked",
    userFacingSummary:
      primary?.userFacingFactText ||
      "I can’t apply that change right now because related records need to be updated first.",
    blocked: {
      safeMessage:
        primary?.userFacingFactText ||
        "I can’t apply that change right now because related records need to be updated first.",
    },
    facts: evaluation.facts || null,
    risk: evaluation.requiresExtraConfirmation ? "high" : "high",
    warnings: evaluation.warnings || [],
    requiresExtraConfirmation: evaluation.requiresExtraConfirmation === true,
    impactSummary: evaluation.impactSummary || [],
    evaluation,
  };
}

module.exports = {
  resolveAdaptiveMutationRemediation,
};
