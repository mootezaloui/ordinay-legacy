"use strict";

const { EventEmitter } = require("events");

const ENTITY_MUTATION_SUCCESS_EVENT = "ENTITY_MUTATION_SUCCESS";
const INTERNAL_EMITTER_EVENT = "entity-mutation-success";
const emitter = new EventEmitter();
const PARENT_LINK_FIELDS = [
  { entityType: "client", snake: "client_id", camel: "clientId" },
  { entityType: "dossier", snake: "dossier_id", camel: "dossierId" },
  { entityType: "lawsuit", snake: "lawsuit_id", camel: "lawsuitId" },
  { entityType: "mission", snake: "mission_id", camel: "missionId" },
  { entityType: "task", snake: "task_id", camel: "taskId" },
  { entityType: "session", snake: "session_id", camel: "sessionId" },
  { entityType: "personal_task", snake: "personal_task_id", camel: "personalTaskId" },
  { entityType: "financial_entry", snake: "financial_entry_id", camel: "financialEntryId" },
  { entityType: "officer", snake: "officer_id", camel: "officerId" },
];

function normalizeOperation(value, fallback = "update") {
  const op = String(value || fallback).trim().toLowerCase();
  if (op === "create" || op === "update" || op === "delete" || op === "attach") return op;
  return fallback;
}

function normalizeEntityType(value) {
  return String(value || "").trim().toLowerCase() || null;
}

function normalizeEntityId(value) {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  return null;
}

function pickScopeNumber(...candidates) {
  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

function inferScopeFromPayload(payload = {}) {
  return {
    clientId: pickScopeNumber(payload.clientId, payload.client_id),
    dossierId: pickScopeNumber(payload.dossierId, payload.dossier_id),
    lawsuitId: pickScopeNumber(payload.lawsuitId, payload.lawsuit_id),
    parentEntityType:
      normalizeEntityType(payload.parentEntityType || payload.parent_entity_type) || undefined,
    parentEntityId: pickScopeNumber(payload.parentEntityId, payload.parent_entity_id),
  };
}

function inferScopeFromMutationResult(result = {}, params = {}, operation = "update") {
  const data =
    result?.after ||
    result?.updatedRow ||
    result?.createdRow ||
    result?.linkedTo ||
    result?.attachmentSummary?.target ||
    {};
  const scope = inferScopeFromPayload({
    ...params,
    ...data,
    ...(params?.target && typeof params.target === "object"
      ? {
          parentEntityType: params.target.type,
          parentEntityId: params.target.id,
        }
      : {}),
  });
  if (operation === "attach") {
    if (!scope.parentEntityType && params?.target?.type) {
      scope.parentEntityType = normalizeEntityType(params.target.type) || undefined;
    }
    if (!scope.parentEntityId && params?.target?.id) {
      scope.parentEntityId = normalizeEntityId(params.target.id) || undefined;
    }
  }
  return scope;
}

function addParentLink(target, entityType, entityId, field) {
  const normalizedType = normalizeEntityType(entityType);
  const normalizedId = normalizeEntityId(entityId);
  if (!normalizedType || normalizedId == null) return;
  const key = `${normalizedType}:${String(normalizedId)}:${String(field || "")}`;
  if (target.has(key)) return;
  target.set(key, {
    entityType: normalizedType,
    entityId: normalizedId,
    ...(field ? { field } : {}),
  });
}

function collectParentLinksFromObject(candidate, target) {
  if (!candidate || typeof candidate !== "object") return;
  for (const mapping of PARENT_LINK_FIELDS) {
    const value = candidate[mapping.snake] ?? candidate[mapping.camel];
    addParentLink(target, mapping.entityType, value, mapping.snake);
  }
}

function collectParentLinksFromScope(scope, target) {
  if (!scope || typeof scope !== "object") return;
  addParentLink(target, "client", scope.clientId, "client_id");
  addParentLink(target, "dossier", scope.dossierId, "dossier_id");
  addParentLink(target, "lawsuit", scope.lawsuitId, "lawsuit_id");
  if (scope.parentEntityType || scope.parentEntityId) {
    addParentLink(target, scope.parentEntityType, scope.parentEntityId, "parent");
  }
}

function normalizeLinkResolutionStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    normalized === "resolved" ||
    normalized === "unchanged" ||
    normalized === "ambiguous" ||
    normalized === "unresolved"
  ) {
    return normalized;
  }
  return undefined;
}

function normalizeLinkResolutionSourceTrace(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "explicit" || normalized === "resolved" || normalized === "fallback") {
    return normalized;
  }
  return undefined;
}

function inferLinkingFromMutationResult(result = {}, params = {}, operation = "update", scope = {}) {
  const data =
    result?.after ||
    result?.updatedRow ||
    result?.createdRow ||
    result?.linkedTo ||
    result?.attachmentSummary?.target ||
    {};

  const parentLinksByKey = new Map();
  collectParentLinksFromObject(params, parentLinksByKey);
  collectParentLinksFromObject(params?.payload, parentLinksByKey);
  collectParentLinksFromObject(params?.changes, parentLinksByKey);
  collectParentLinksFromObject(data, parentLinksByKey);
  if (params?.target && typeof params.target === "object") {
    addParentLink(parentLinksByKey, params.target.type, params.target.id, "target");
  }
  collectParentLinksFromScope(scope, parentLinksByKey);

  const sourceTrace = normalizeLinkResolutionSourceTrace(
    params?.linkResolutionSourceTrace ||
      result?.linkResolutionSourceTrace ||
      data?.linkResolutionSourceTrace,
  );
  const resolutionStatus = normalizeLinkResolutionStatus(
    params?.linkResolutionStatus ||
      result?.linkResolutionStatus ||
      data?.linkResolutionStatus,
  );
  const parentLinks = Array.from(parentLinksByKey.values());

  if (!sourceTrace && !resolutionStatus && parentLinks.length === 0) {
    return undefined;
  }

  if (operation === "delete" && parentLinks.length === 0 && !sourceTrace && !resolutionStatus) {
    return undefined;
  }

  return {
    ...(sourceTrace ? { sourceTrace } : {}),
    ...(resolutionStatus ? { resolutionStatus } : {}),
    ...(parentLinks.length > 0 ? { parentLinks } : {}),
  };
}

function buildMutationEventsFromExecution({
  proposal = null,
  executionResult = null,
  sessionId = null,
  source = "agent",
} = {}) {
  const action = executionResult?.executedActions?.[0] || null;
  const rootResult = action?.result || null;
  const actionType = String(action?.actionType || proposal?.actionType || "").toUpperCase();
  const params = proposal?.params || {};
  const events = [];

  const emit = ({ entityType, entityId, operation, scope = {}, linking }) => {
    const normalizedType = normalizeEntityType(entityType);
    if (!normalizedType) return;
    events.push({
      type: ENTITY_MUTATION_SUCCESS_EVENT,
      entityType: normalizedType,
      entityId: normalizeEntityId(entityId),
      operation: normalizeOperation(operation),
      scope: {
        clientId: scope.clientId,
        dossierId: scope.dossierId,
        lawsuitId: scope.lawsuitId,
        parentEntityType: scope.parentEntityType,
        parentEntityId: scope.parentEntityId,
      },
      ...(linking && typeof linking === "object" ? { linking } : {}),
      sessionId: sessionId || null,
      source,
      timestamp: new Date().toISOString(),
    });
  };

  if (actionType === "EXECUTE_MUTATION_WORKFLOW" && Array.isArray(rootResult?.stepResults)) {
    for (const step of rootResult.stepResults) {
      if (!step || step.ok !== true || !step.result || step.result.ok === false) continue;
      const stepActionType = String(step.actionType || "").toUpperCase();
      const stepOp =
        stepActionType === "CREATE_ENTITY"
          ? "create"
          : stepActionType === "DELETE_ENTITY"
            ? "delete"
            : stepActionType === "ATTACH_TO_ENTITY"
              ? "attach"
              : "update";
      const stepParams =
        step?.params && typeof step.params === "object"
          ? { ...params, ...step.params }
          : params;
      const stepScope = inferScopeFromMutationResult(step.result, stepParams, stepOp);
      emit({
        entityType: step.result.entityType,
        entityId: step.result.entityId || step.result.id,
        operation: step.result.operation || stepOp,
        scope: stepScope,
        linking: inferLinkingFromMutationResult(
          step.result,
          stepParams,
          stepOp,
          stepScope,
        ),
      });
    }
    return events;
  }

  const operation =
    actionType === "CREATE_ENTITY"
      ? "create"
      : actionType === "DELETE_ENTITY"
        ? "delete"
        : actionType === "ATTACH_TO_ENTITY"
          ? "attach"
          : "update";
  const rootScope = inferScopeFromMutationResult(rootResult, params, operation);
  emit({
    entityType:
      rootResult?.entityType ||
      params?.entityType ||
      params?.target?.type ||
      params?.sourceType ||
      null,
    entityId:
      rootResult?.entityId ||
      rootResult?.id ||
      params?.entityId ||
      params?.target?.id ||
      params?.sourceId ||
      null,
    operation,
    scope: rootScope,
    linking: inferLinkingFromMutationResult(rootResult, params, operation, rootScope),
  });
  return events;
}

function emitEntityMutationSuccess(event) {
  if (!event || event.type !== ENTITY_MUTATION_SUCCESS_EVENT) return;
  emitter.emit(INTERNAL_EMITTER_EVENT, event);
}

function emitEntityMutationEventsFromExecution(payload = {}) {
  const events = buildMutationEventsFromExecution(payload);
  for (const event of events) {
    emitEntityMutationSuccess(event);
  }
  return events;
}

function subscribeEntityMutationSuccess(listener) {
  if (typeof listener !== "function") return () => {};
  emitter.on(INTERNAL_EMITTER_EVENT, listener);
  return () => emitter.off(INTERNAL_EMITTER_EVENT, listener);
}

module.exports = {
  ENTITY_MUTATION_SUCCESS_EVENT,
  buildMutationEventsFromExecution,
  emitEntityMutationEventsFromExecution,
  subscribeEntityMutationSuccess,
};
