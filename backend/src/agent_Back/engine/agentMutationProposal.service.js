"use strict";

const {
  createActionProposal,
  generateProposalId,
  ACTION_STATUS,
} = require("../contracts/actionProposal.contract");
const {
  validatePayload,
  getAllowedFields,
  computeSnapshotHash,
  getReversibilityRules,
} = require("./entityAdapters");
const { evaluateMutationConstraints } = require("./agentDomainConstraintEvaluator");
const { assertDomainMutationAllowed } = require("./agentDomainMutationRules");
const { ENTITY_TYPE_DOMAIN_MAP } = require("../tools/tool.firewall");

const tasksService = require("../../services/tasks.service");
const clientsService = require("../../services/clients.service");
const dossiersService = require("../../services/dossiers.service");
const sessionsService = require("../../services/sessions.service");
const personalTasksService = require("../../services/personalTasks.service");
const missionsService = require("../../services/missions.service");
const lawsuitsService = require("../../services/lawsuits.service");
const financialService = require("../../services/financial.service");
const notificationsService = require("../../services/notifications.service");
const officersService = require("../../services/officers.service");
const notesService = require("../../services/notes.service");
const documentsService = require("../../services/documents.service");

const MAX_REASONING_SUMMARY_LEN = 280;
const CREATE_SENTINEL = "new";

const ENTITY_TYPE_ALIASES = Object.freeze({
  financialentry: "financial_entry",
  financialEntry: "financial_entry",
  personaltask: "personal_task",
  personalTask: "personal_task",
});

const serviceMap = Object.freeze({
  task: tasksService,
  client: clientsService,
  dossier: dossiersService,
  session: sessionsService,
  personal_task: personalTasksService,
  mission: missionsService,
  lawsuit: lawsuitsService,
  financial_entry: financialService,
  notification: notificationsService,
  document: documentsService,
  officer: officersService,
  note: notesService,
});

function normalizeEntityType(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (ENTITY_TYPE_ALIASES[raw]) return ENTITY_TYPE_ALIASES[raw];
  const lowered = raw.toLowerCase();
  return ENTITY_TYPE_ALIASES[lowered] || lowered;
}

function normalizeOperation(value) {
  return String(value || "").trim().toLowerCase();
}

function toSnakeCaseKey(key) {
  return String(key || "").replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function normalizePayloadKeys(payload = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  const normalized = {};
  for (const [key, value] of Object.entries(payload)) {
    normalized[toSnakeCaseKey(key)] = value;
  }
  return normalized;
}

function getService(entityType) {
  const service = serviceMap[entityType];
  if (!service) {
    const err = new Error(`Unsupported entity type for agent mutation proposal: ${entityType}`);
    err.code = "UNSUPPORTED_ENTITY_TYPE";
    err.status = 400;
    throw err;
  }
  return service;
}

function sanitizeReasoningSummary(value) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (!text) {
    const err = new Error("reasoningSummary is required");
    err.code = "REASONING_SUMMARY_REQUIRED";
    err.status = 400;
    throw err;
  }
  if (text.length > MAX_REASONING_SUMMARY_LEN) {
    const err = new Error(
      `reasoningSummary must be ${MAX_REASONING_SUMMARY_LEN} characters or fewer`,
    );
    err.code = "REASONING_SUMMARY_TOO_LONG";
    err.status = 400;
    throw err;
  }
  return text;
}

function assertPayloadWhitelist(entityType, operation, payload) {
  const allowed = new Set(getAllowedFields(entityType, operation));
  const keys = Object.keys(payload || {});
  const invalid = keys.filter((key) => !allowed.has(key));
  if (invalid.length > 0) {
    const err = new Error(
      `Fields not allowed for ${operation} ${entityType}: ${invalid.join(", ")}`,
    );
    err.code = "FIELD_NOT_ALLOWED";
    err.status = 400;
    throw err;
  }
}

function verifyPermission(entityType, operation, executionContext = {}) {
  const domain = ENTITY_TYPE_DOMAIN_MAP[entityType];
  if (
    domain &&
    executionContext.dataAccess &&
    executionContext.dataAccess[domain] === false
  ) {
    const err = new Error(`Access to ${domain} is disabled for ${operation} ${entityType}`);
    err.code = "DOMAIN_ACCESS_DENIED";
    err.status = 403;
    throw err;
  }

  if (typeof executionContext.verifyEntityMutationPermission === "function") {
    const result = executionContext.verifyEntityMutationPermission({
      entityType,
      operation,
      executionContext,
    });
    if (result === false || (result && result.allowed === false)) {
      const err = new Error(result?.message || "Mutation permission denied");
      err.code = result?.code || "MUTATION_PERMISSION_DENIED";
      err.status = 403;
      throw err;
    }
  }

  return true;
}

function buildCreateSnapshot(entityType) {
  return {
    scope: entityType,
    scopeId: CREATE_SENTINEL,
    hash: "sha256:null",
    timestamp: new Date().toISOString(),
  };
}

function buildUpdateSnapshot(entityType, entityId) {
  return {
    scope: entityType,
    scopeId: entityId,
    hash: computeSnapshotHash(entityType, entityId),
    timestamp: new Date().toISOString(),
  };
}

function buildHumanSummary({ operation, entityType, entityId, payload, reasoningSummary }) {
  if (operation === "create") {
    return `Create ${entityType} (reason: ${reasoningSummary})`;
  }
  const fieldList = Object.keys(payload || {}).join(", ");
  const fieldPart = fieldList ? ` fields [${fieldList}]` : " fields";
  return `Update ${entityType} #${entityId}${fieldPart} (reason: ${reasoningSummary})`;
}

function buildProposal(input = {}, executionContext = {}) {
  const entityType = normalizeEntityType(input.entityType);
  const operation = normalizeOperation(input.operation);
  const payload = normalizePayloadKeys(input.payload);
  const reasoningSummary = sanitizeReasoningSummary(input.reasoningSummary);

  if (!["create", "update"].includes(operation)) {
    const err = new Error("operation must be 'create' or 'update'");
    err.code = "INVALID_OPERATION";
    err.status = 400;
    throw err;
  }

  const service = getService(entityType);
  verifyPermission(entityType, operation, executionContext);

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    const err = new Error("payload must be an object");
    err.code = "INVALID_PAYLOAD";
    err.status = 400;
    throw err;
  }

  assertPayloadWhitelist(entityType, operation, payload);
  validatePayload(entityType, operation, payload);

  let snapshot;
  let params;
  let affectedId;
  let reversible = false;
  let domainGuardConfirmation = null;

  if (operation === "create") {
    if (String(input.entityId || "").trim() !== CREATE_SENTINEL) {
      const err = new Error(`create operation requires entityId="${CREATE_SENTINEL}"`);
      err.code = "INVALID_CREATE_ENTITY_ID";
      err.status = 400;
      throw err;
    }
    snapshot = buildCreateSnapshot(entityType);
    const domainEvaluation = evaluateMutationConstraints({
      entityType,
      operation,
      entityId: null,
      payload,
      existing: null,
    });
    if (!domainEvaluation.allowed) {
      assertDomainMutationAllowed({
        entityType,
        operation,
        entityId: null,
        payload,
        existing: null,
      });
    }
    if (domainEvaluation.requiresExtraConfirmation === true) {
      domainGuardConfirmation = {
        mode: "explicit",
        extraRiskAck: true,
        impactSummary: Array.isArray(domainEvaluation.impactSummary)
          ? domainEvaluation.impactSummary
          : [],
        warnings: Array.isArray(domainEvaluation.warnings)
          ? domainEvaluation.warnings.map((w) => w?.userFacingFactText || String(w))
          : [],
      };
    }
    affectedId = CREATE_SENTINEL;
    params = {
      entityType,
      payload,
    };
    reversible = Boolean(getReversibilityRules(entityType)?.create?.reversible);
  } else {
    const numericId = Number(String(input.entityId || "").trim());
    if (!Number.isInteger(numericId) || numericId <= 0) {
      const err = new Error("update operation requires entityId as a positive numeric string");
      err.code = "INVALID_UPDATE_ENTITY_ID";
      err.status = 400;
      throw err;
    }
    if (typeof service.get !== "function") {
      const err = new Error(`Entity type ${entityType} does not support get(id) preflight checks`);
      err.code = "SERVICE_GET_UNAVAILABLE";
      err.status = 500;
      throw err;
    }
    const existing = service.get(numericId);
    if (!existing) {
      const err = new Error(`${entityType} ${numericId} not found`);
      err.code = "ENTITY_NOT_FOUND";
      err.status = 404;
      throw err;
    }
    const domainEvaluation = evaluateMutationConstraints({
      entityType,
      operation,
      entityId: numericId,
      payload,
      existing,
    });
    if (!domainEvaluation.allowed) {
      assertDomainMutationAllowed({
        entityType,
        operation,
        entityId: numericId,
        payload,
        existing,
      });
    }
    if (domainEvaluation.requiresExtraConfirmation === true) {
      domainGuardConfirmation = {
        mode: "explicit",
        extraRiskAck: true,
        impactSummary: Array.isArray(domainEvaluation.impactSummary)
          ? domainEvaluation.impactSummary
          : [],
        warnings: Array.isArray(domainEvaluation.warnings)
          ? domainEvaluation.warnings.map((w) => w?.userFacingFactText || String(w))
          : [],
      };
    }
    snapshot = buildUpdateSnapshot(entityType, numericId);
    affectedId = numericId;
    params = {
      entityType,
      entityId: numericId,
      changes: payload,
    };
    reversible = Boolean(getReversibilityRules(entityType)?.update?.reversible);
  }

  const actionType = operation === "create" ? "CREATE_ENTITY" : "UPDATE_ENTITY";
  const proposalId = generateProposalId(actionType, "v3");

  return createActionProposal({
    proposalId,
    actionType,
    toolCategory: "execute",
    params,
    reversible,
    requiresConfirmation: true,
    humanReadableSummary: buildHumanSummary({
      operation,
      entityType,
      entityId: affectedId,
      payload,
      reasoningSummary,
    }),
    affectedEntities: [{ type: entityType, id: affectedId, operation }],
    status: ACTION_STATUS.PROPOSED,
    version: "v3",
    posture: "WORK",
    snapshot,
    confirmation: domainGuardConfirmation,
    sessionId: executionContext.sessionId || null,
  });
}

module.exports = {
  buildProposal,
  normalizeEntityType,
  normalizePayloadKeys,
  CREATE_SENTINEL,
  MAX_REASONING_SUMMARY_LEN,
};
