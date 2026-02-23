"use strict";

const {
  createActionProposal,
  generateProposalId,
  ACTION_STATUS,
} = require("../contracts/actionProposal.contract");
const { computeSnapshotHash, validatePayload, getAllowedFields } = require("./entityAdapters");

const clientsService = require("../../services/clients.service");
const dossiersService = require("../../services/dossiers.service");
const lawsuitsService = require("../../services/lawsuits.service");
const tasksService = require("../../services/tasks.service");
const sessionsService = require("../../services/sessions.service");
const missionsService = require("../../services/missions.service");
const personalTasksService = require("../../services/personalTasks.service");
const financialService = require("../../services/financial.service");
const officersService = require("../../services/officers.service");
const documentsService = require("../../services/documents.service");
const notesService = require("../../services/notes.service");

const serviceMap = Object.freeze({
  client: clientsService,
  dossier: dossiersService,
  lawsuit: lawsuitsService,
  task: tasksService,
  session: sessionsService,
  mission: missionsService,
  personal_task: personalTasksService,
  financial_entry: financialService,
  officer: officersService,
  document: documentsService,
  note: notesService,
});

function _getService(entityType) {
  const service = serviceMap[String(entityType || "").toLowerCase()];
  if (!service) {
    const err = new Error(`Unsupported workflow root entity: ${entityType}`);
    err.code = "UNSUPPORTED_ENTITY_TYPE";
    err.status = 400;
    throw err;
  }
  return service;
}

function _assertAllowedFields(entityType, operation, payload) {
  const allowed = new Set(getAllowedFields(entityType, operation));
  const invalid = Object.keys(payload || {}).filter((key) => !allowed.has(key));
  if (invalid.length > 0) {
    const err = new Error(`Workflow step contains disallowed fields for ${entityType}: ${invalid.join(", ")}`);
    err.code = "FIELD_NOT_ALLOWED";
    err.status = 400;
    throw err;
  }
}

function _sanitizeReasoningSummary(value) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (!text) {
    const err = new Error("reasoningSummary is required");
    err.code = "REASONING_SUMMARY_REQUIRED";
    throw err;
  }
  if (text.length > 280) {
    const err = new Error("reasoningSummary must be 280 characters or fewer");
    err.code = "REASONING_SUMMARY_TOO_LONG";
    throw err;
  }
  return text;
}

function _validateWorkflowSteps(steps = []) {
  if (!Array.isArray(steps) || steps.length === 0) {
    const err = new Error("workflow.steps must be a non-empty array");
    err.code = "INVALID_WORKFLOW_STEPS";
    throw err;
  }
  for (const step of steps) {
    if (String(step?.actionType || "") !== "UPDATE_ENTITY") {
      const err = new Error("Only UPDATE_ENTITY workflow steps are supported");
      err.code = "UNSUPPORTED_WORKFLOW_STEP_ACTION";
      throw err;
    }
    const params = step?.params || {};
    const entityType = String(params.entityType || "").toLowerCase();
    const entityId = Number(params.entityId);
    if (!entityType || !Number.isInteger(entityId) || entityId <= 0) {
      const err = new Error("Workflow step UPDATE_ENTITY requires valid entityType and entityId");
      err.code = "INVALID_WORKFLOW_STEP";
      throw err;
    }
    const changes = params.changes;
    if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
      const err = new Error("Workflow step UPDATE_ENTITY requires changes object");
      err.code = "INVALID_WORKFLOW_STEP";
      throw err;
    }
    _assertAllowedFields(entityType, "update", changes);
    validatePayload(entityType, "update", changes);
  }
}

function _buildHumanSummary({ rootEntity, rootLabel, workflowType, canReachRequestedGoal }) {
  const rootType = String(rootEntity?.type || "entity").replace(/_/g, " ");
  const target =
    String(rootLabel || "").trim() ||
    `${rootType.charAt(0).toUpperCase()}${rootType.slice(1)} #${rootEntity?.id ?? "?"}`;
  if (String(workflowType || "") === "client_inactivation_cleanup") {
    return canReachRequestedGoal
      ? `Update ${target} after cleaning related records`
      : `Clean related records for ${target} (final status may remain blocked)`;
  }
  return canReachRequestedGoal
    ? `Apply related updates for ${target}`
    : `Apply related cleanup for ${target} (final change may remain blocked)`;
}

function buildWorkflowProposal(input = {}, executionContext = {}) {
  const workflowType = String(input.workflowType || "").trim();
  const rootEntity = input.rootEntity || {};
  const rootType = String(rootEntity.type || "").trim().toLowerCase();
  const rootId = Number(rootEntity.id);
  const requestedGoal = input.requestedGoal || null;
  const facts = input.facts && typeof input.facts === "object" ? input.facts : {};
  const steps = Array.isArray(input.steps) ? input.steps : [];
  const canReachRequestedGoal = input.canReachRequestedGoal !== false;
  const blockedTerminalStep =
    input.blockedTerminalStep && typeof input.blockedTerminalStep === "object"
      ? input.blockedTerminalStep
      : null;
  const reasoningSummary = _sanitizeReasoningSummary(input.reasoningSummary);
  const rootLabel = String(input.rootLabel || "").trim() || null;

  if (!workflowType) {
    const err = new Error("workflowType is required");
    err.code = "WORKFLOW_TYPE_REQUIRED";
    throw err;
  }
  if (!rootType || !Number.isInteger(rootId) || rootId <= 0) {
    const err = new Error("rootEntity { type, id } is required");
    err.code = "INVALID_ROOT_ENTITY";
    throw err;
  }

  const service = _getService(rootType);
  if (typeof service.get !== "function") {
    const err = new Error(`Root service for ${rootType} does not support get(id)`);
    err.code = "SERVICE_GET_UNAVAILABLE";
    throw err;
  }
  const existing = service.get(rootId);
  if (!existing) {
    const err = new Error(`${rootType} ${rootId} not found`);
    err.code = "ENTITY_NOT_FOUND";
    throw err;
  }

  _validateWorkflowSteps(steps);

  const snapshot = {
    scope: rootType,
    scopeId: rootId,
    hash: computeSnapshotHash(rootType, rootId),
    timestamp: new Date().toISOString(),
  };

  const proposalId = generateProposalId("EXECUTE_MUTATION_WORKFLOW", "v3");
  // Keep chat proposal cards focused: expose only the root entity at proposal level.
  const affectedEntities = [{ type: rootType, id: rootId, operation: "workflow" }];

  return createActionProposal({
    proposalId,
    actionType: "EXECUTE_MUTATION_WORKFLOW",
    toolCategory: "execute",
    params: {
      workflow: {
        workflowType,
        rootEntity: { type: rootType, id: rootId },
        rootLabel,
        requestedGoal,
        facts,
        steps,
        canReachRequestedGoal,
        blockedTerminalStep,
        reasoningSummary,
      },
    },
    reversible: false,
    requiresConfirmation: true,
    humanReadableSummary: _buildHumanSummary({
      rootEntity: { type: rootType, id: rootId },
      rootLabel,
      workflowType,
      canReachRequestedGoal,
    }),
    affectedEntities,
    status: ACTION_STATUS.PROPOSED,
    version: "v3",
    posture: "WORK",
    snapshot,
    sessionId: executionContext.sessionId || null,
  });
}

module.exports = {
  buildWorkflowProposal,
};
