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

function _toTitleCase(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function _formatEntityLabel(entityType, entityId) {
  const typeLabel = _toTitleCase(String(entityType || "item")).trim() || "Item";
  return `${typeLabel} #${entityId ?? "?"}`;
}

function _readFieldCaseInsensitive(record, field) {
  if (!record || typeof record !== "object" || !field) return undefined;
  if (Object.prototype.hasOwnProperty.call(record, field)) return record[field];
  const lower = String(field).toLowerCase();
  const key = Object.keys(record).find((k) => String(k).toLowerCase() === lower);
  return key ? record[key] : undefined;
}

function _entityPreviewLabel(entityType, entityId, entity) {
  const type = String(entityType || "").toLowerCase();
  const item = entity && typeof entity === "object" ? entity : null;
  if (!item) return _formatEntityLabel(type, entityId);

  if (type === "client") return String(item.name || item.reference || _formatEntityLabel(type, entityId));
  if (type === "task") return String(item.title || _formatEntityLabel(type, entityId));
  if (type === "session") return String(item.title || item.type || _formatEntityLabel(type, entityId));
  if (type === "lawsuit") return String(item.title || item.lawsuitNumber || _formatEntityLabel(type, entityId));
  if (type === "dossier") return String(item.title || item.lawsuitNumber || _formatEntityLabel(type, entityId));
  if (type === "mission") return String(item.title || item.missionNumber || _formatEntityLabel(type, entityId));
  if (type === "financial_entry") {
    return String(item.title || item.description || _formatEntityLabel(type, entityId));
  }

  return String(item.title || item.name || item.reference || _formatEntityLabel(type, entityId));
}

function _loadEntityForPreview(entityType, entityId) {
  try {
    const service = _getService(entityType);
    if (typeof service?.get !== "function") return null;
    return service.get(entityId) || null;
  } catch (_) {
    return null;
  }
}

function _normalizePreviewValue(value) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

function _buildConfirmationPreview({
  rootType,
  rootId,
  rootLabel,
  rootExisting,
  requestedGoal,
  steps,
  reasoningSummary,
  reversible,
}) {
  const rootEntityType = String(rootType || "").toLowerCase();
  const rootEntityId = Number(rootId);
  const rootEntityLabel =
    String(rootLabel || "").trim() || _entityPreviewLabel(rootEntityType, rootEntityId, rootExisting);

  const primaryChanges = [];
  const requestedChanges =
    requestedGoal && typeof requestedGoal === "object" && requestedGoal.changes && typeof requestedGoal.changes === "object"
      ? requestedGoal.changes
      : null;
  if (requestedChanges && !Array.isArray(requestedChanges)) {
    for (const [field, value] of Object.entries(requestedChanges)) {
      if (!field) continue;
      let fromValue = null;
      let toValue = value;
      if (value && typeof value === "object" && !Array.isArray(value) && ("to" in value || "from" in value)) {
        fromValue = _normalizePreviewValue(value.from);
        toValue = value.to;
      }
      if (fromValue === null && rootExisting) {
        fromValue = _normalizePreviewValue(_readFieldCaseInsensitive(rootExisting, field));
      }
      primaryChanges.push({
        entityType: rootEntityType,
        entityId: rootEntityId,
        entityLabel: rootEntityLabel,
        field,
        from: _normalizePreviewValue(fromValue),
        to: _normalizePreviewValue(toValue),
      });
    }
  }

  const grouped = new Map();
  for (const step of Array.isArray(steps) ? steps : []) {
    if (String(step?.actionType || "") !== "UPDATE_ENTITY") continue;
    const params = step?.params || {};
    const entityType = String(params.entityType || "").toLowerCase();
    const entityId = Number(params.entityId);
    const changes = params.changes && typeof params.changes === "object" && !Array.isArray(params.changes) ? params.changes : {};
    const changeKeys = Object.keys(changes);
    if (!entityType || !Number.isInteger(entityId) || entityId <= 0 || changeKeys.length === 0) continue;
    if (entityType === rootEntityType && entityId === rootEntityId) continue;

    const stepExisting = _loadEntityForPreview(entityType, entityId);
    const stepEntityLabel = _entityPreviewLabel(entityType, entityId, stepExisting);

    if (!grouped.has(entityType)) {
      grouped.set(entityType, {
        entityType,
        totalCount: 0,
        changedFields: new Set(),
        examples: [],
      });
    }
    const bucket = grouped.get(entityType);
    bucket.totalCount += 1;
    for (const field of changeKeys) {
      bucket.changedFields.add(field);
      if (bucket.examples.length >= 3) continue;
      const raw = changes[field];
      let fromValue = null;
      let toValue = raw;
      if (raw && typeof raw === "object" && !Array.isArray(raw) && ("to" in raw || "from" in raw)) {
        fromValue = raw.from;
        toValue = raw.to;
      }
      if ((fromValue === null || fromValue === undefined) && stepExisting) {
        fromValue = _readFieldCaseInsensitive(stepExisting, field);
      }
      bucket.examples.push({
        entityType,
        entityId,
        entityLabel: stepEntityLabel,
        field,
        from: _normalizePreviewValue(fromValue),
        to: _normalizePreviewValue(toValue),
      });
    }
  }

  const cascadeSummary = Array.from(grouped.values()).map((bucket) => ({
    entityType: bucket.entityType,
    totalCount: bucket.totalCount,
    changedFields: Array.from(bucket.changedFields),
    examples: bucket.examples,
  }));

  const effects = [];
  if (reasoningSummary) effects.push(String(reasoningSummary));

  return {
    version: "v1",
    scope: "workflow",
    root: {
      type: rootEntityType,
      id: rootEntityId,
      label: rootEntityLabel,
      operation: String(requestedGoal?.operation || "update").toLowerCase() || "update",
    },
    primaryChanges,
    cascadeSummary,
    effects,
    reversibility: reversible === false ? "not_reversible" : reversible === true ? "reversible" : "unknown",
  };
}

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
    confirmation: {
      mode: "explicit",
      impactSummary: reasoningSummary ? [reasoningSummary] : [],
      preview: _buildConfirmationPreview({
        rootType,
        rootId,
        rootLabel,
        rootExisting: existing,
        requestedGoal,
        steps,
        reasoningSummary,
        reversible: false,
      }),
    },
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
  _internal: {
    _buildConfirmationPreview,
  },
};
